# backend/app.py

from flask import Flask, jsonify, request
from flask_cors import CORS
from database import connect_to_db, get_db # Assuming database.py exists and works
from bson import ObjectId
import json
import os
import uuid # Using UUIDs for custom IDs
import google.generativeai as genai # Import Google GenAI
from dotenv import load_dotenv
import traceback # For detailed error logging

# --- Load Environment Variables ---
load_dotenv()

app = Flask(__name__)
# Adjust origins for production deployment
CORS(app, resources={r"/api/*": {"origins": ["http://localhost:5173", "http://127.0.0.1:5173"]}})

# --- Configure Google Gemini Client ---
# One client can handle both JSON and text generation based on the call
gemini_model = None
gemini_generation_config_json = None # Specific config for JSON output
try:
    google_api_key = os.environ.get("GOOGLE_API_KEY")
    if not google_api_key:
        print("WARNING: GOOGLE_API_KEY environment variable not set. AI features disabled.")
    else:
        genai.configure(api_key=google_api_key)
        # Config for forcing JSON output (used by quiz generator)
        gemini_generation_config_json = genai.types.GenerationConfig(
            response_mime_type="application/json"
        )
        # Initialize the model - use this one instance for both calls
        # Check documentation for latest recommended models (e.g., gemini-1.5-flash-latest)
        gemini_model = genai.GenerativeModel(
            "gemini-1.5-flash"
            # Note: We apply generation_config *per call* if needed
        )
        print("Google Gemini client initialized ('gemini-1.5-flash').")
except Exception as e:
     print(f"Error initializing Google Gemini client: {e}")

# --- Custom JSON Encoder (Handles MongoDB ObjectIds) ---
class MongoJSONEncoder(json.JSONEncoder):
    def default(self, o):
        if isinstance(o, ObjectId): return str(o)
        return super().default(o)
app.json_encoder = MongoJSONEncoder

# --- Connect to DB ---
try:
    connect_to_db() # Function from database.py
    print("Database connection established successfully.")
except Exception as e:
    print(f"FATAL: Could not connect to database on startup: {e}")
    import sys
    sys.exit(1)

# --- Helper function to create the Quiz Generation Prompt ---
def create_quiz_prompt(topic: str, num_questions: int) -> str:
    """Generates the precise prompt for the LLMs, requesting JSON output for quizzes."""
    # Using the well-defined prompt structure you refined previously
    prompt = f"""
Generate exactly {num_questions} multiple-choice quiz questions about the topic: "{topic}".

Format the output STRICTLY as a single JSON object. This object must contain ONE key named "questions".
The value of "questions" MUST be a JSON array where each element is a question object.

Each question object in the array MUST have the following fields:
- "id": A unique UUID string generated for this question.
- "type": The string "multiple_choice".
- "question_text": The string containing the question text.
- "answers": A JSON array containing exactly 4 answer option objects.

Each answer option object in the "answers" array MUST have the following fields:
- "id": A unique UUID string generated for this answer option.
- "answer_text": The string containing the answer text.
- "is_correct": A boolean value (true for ONLY ONE answer per question, false for the others).

Example of a single question object within the "questions" array:
{{
  "id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "type": "multiple_choice",
  "question_text": "What is the powerhouse of the cell?",
  "answers": [
    {{ "id": "a1b2c3d4-...", "answer_text": "Nucleus", "is_correct": false }},
    {{ "id": "e5f6g7h8-...", "answer_text": "Ribosome", "is_correct": false }},
    {{ "id": "i9j0k1l2-...", "answer_text": "Mitochondrion", "is_correct": true }},
    {{ "id": "m3n4o5p6-...", "answer_text": "Chloroplast", "is_correct": false }}
  ]
}}

Ensure the entire output is only the valid JSON object with the "questions" key and its array value. Do not include any other text, explanations, or markdown formatting like ```json ... ```. Generate unique UUIDs for all 'id' fields.
"""
    return prompt.strip()

# =========================================
# --- Standard Quiz CRUD API Endpoints ---
# =========================================

# --- GET /api/quizzes ---
@app.route('/api/quizzes', methods=['GET'])
def get_all_quizzes():
    print("GET /api/quizzes request received")
    try:
        db = get_db()
        quizzes_collection = db.quizzes
        # Use projection {'_id': 0} to exclude MongoDB's internal ID
        all_quizzes = list(quizzes_collection.find({}, {'_id': 0}))
        return jsonify(all_quizzes)
    except Exception as e:
        print(f"Error fetching quizzes: {e}")
        return jsonify({"error": "Failed to fetch quizzes from database"}), 500

# --- POST /api/quizzes (Manual Add) ---
@app.route('/api/quizzes', methods=['POST'])
def add_quiz():
    print("POST /api/quizzes request received (Manual Add)")
    try:
        db = get_db()
        quizzes_collection = db.quizzes
        data = request.get_json()
        if not data: return jsonify({"error": "Request body must contain JSON data"}), 400
        if 'title' not in data or not data['title']: return jsonify({"error": "Missing 'title'"}), 400

        # Ensure custom 'id' exists (generate if needed)
        if 'id' not in data: data['id'] = str(uuid.uuid4())
        if 'questions' not in data: data['questions'] = []
        # TODO: Consider adding ID generation for questions/answers in manual add too

        insert_result = quizzes_collection.insert_one(data)
        # Fetch using custom 'id' and exclude '_id'
        new_quiz = quizzes_collection.find_one({"id": data['id']}, {'_id': 0})
        if not new_quiz: return jsonify({"error": "Failed to retrieve newly added quiz"}), 500
        return jsonify(new_quiz), 201
    except Exception as e:
        print(f"Error adding manual quiz: {e}")
        return jsonify({"error": "Failed to add quiz manually"}), 500

# --- DELETE /api/quizzes/:quiz_id ---
@app.route('/api/quizzes/<quiz_id>', methods=['DELETE'])
def delete_quiz(quiz_id):
    print(f"DELETE /api/quizzes/{quiz_id} request received")
    try:
        db = get_db()
        quizzes_collection = db.quizzes
        delete_result = quizzes_collection.delete_one({"id": quiz_id}) # Match custom string ID

        if delete_result.deleted_count == 1:
            print(f"Successfully deleted quiz with ID: {quiz_id}")
            return '', 204 # No Content
        else:
            print(f"Quiz with ID {quiz_id} not found for deletion.")
            return jsonify({"error": "Quiz not found"}), 404
    except Exception as e:
        print(f"Error deleting quiz {quiz_id}: {e}")
        return jsonify({"error": "Failed to delete quiz"}), 500

# --- PUT /api/quizzes/:quiz_id (Update) ---
@app.route('/api/quizzes/<quiz_id>', methods=['PUT'])
def update_quiz(quiz_id):
    print(f"PUT /api/quizzes/{quiz_id} request received")
    try:
        db = get_db()
        quizzes_collection = db.quizzes
        updated_data = request.get_json()
        if not updated_data: return jsonify({"error": "Request body must contain JSON data"}), 400

        # --- Basic Validation ---
        if 'id' not in updated_data or updated_data['id'] != quiz_id: return jsonify({"error": "Quiz ID mismatch"}), 400
        if 'title' not in updated_data or not updated_data['title']: return jsonify({"error": "Missing 'title'"}), 400
        if 'questions' not in updated_data or not isinstance(updated_data['questions'], list): return jsonify({"error": "Missing 'questions' array"}), 400
        # TODO: Add deeper validation of questions/answers structure

        # Perform replacement using custom 'id' as the filter
        update_result = quizzes_collection.replace_one({"id": quiz_id}, updated_data)

        if update_result.matched_count == 1:
            print(f"Quiz {quiz_id} {'updated' if update_result.modified_count == 1 else 'found but not modified'}.")
            updated_quiz = quizzes_collection.find_one({"id": quiz_id}, {'_id': 0}) # Fetch updated, exclude _id
            return jsonify(updated_quiz), 200 # OK
        else:
            print(f"Quiz {quiz_id} not found for update.")
            return jsonify({"error": "Quiz not found"}), 404
    except Exception as e:
        print(f"Error updating quiz {quiz_id}: {e}")
        traceback.print_exc()
        return jsonify({"error": "Failed to update quiz"}), 500

# ==================================
# --- AI Interaction Endpoints ---
# ==================================

# --- POST /api/quizzes/generate (AI Quiz Creation) ---
@app.route('/api/quizzes/generate', methods=['POST'])
def generate_quiz():
    print("POST /api/quizzes/generate request received (Using Gemini)")
    if not gemini_model or not gemini_generation_config_json:
        return jsonify({"error": "AI service (Gemini) is not configured properly for JSON generation."}), 503

    try:
        data = request.get_json()
        if not data: return jsonify({"error": "Request body must contain JSON data"}), 400
        req_title = data.get('title')
        topic = data.get('topic')
        num_questions = data.get('num_questions', 5)

        # Input validation
        if not req_title or not topic: return jsonify({"error": "Missing 'title' or 'topic'"}), 400
        if not isinstance(num_questions, int) or num_questions < 1 or num_questions > 20: return jsonify({"error": "Invalid 'num_questions'"}), 400

        prompt = create_quiz_prompt(topic, num_questions)
        print(f"Sending quiz generation prompt to Gemini for topic: '{topic}'")

        # --- Call Gemini API with JSON config ---
        try:
            response = gemini_model.generate_content(
                prompt,
                generation_config=gemini_generation_config_json # Apply JSON config
            )
            if not response.parts: raise ValueError("AI failed to generate content or was blocked.")
            ai_response_content = response.text.strip()
            print("Received quiz generation response from Gemini.")
        except Exception as ai_error:
             # ... (Error handling for AI call as before) ...
             print(f"Error interacting with Gemini API: {ai_error}")
             user_message = f"Failed to generate quiz content from AI: {ai_error}"
             if "api key" in str(ai_error).lower() or "permission denied" in str(ai_error).lower(): user_message = "AI service authentication failed."
             elif "quota" in str(ai_error).lower(): user_message = "AI service quota exceeded."
             return jsonify({"error": user_message}), 503

        # --- Parse and Validate JSON Response ---
        try:
            if not ai_response_content: raise ValueError("AI returned empty content string.")
            generated_data = json.loads(ai_response_content)
            if not isinstance(generated_data, dict) or "questions" not in generated_data: raise ValueError("AI response not JSON object with 'questions' key.")
            generated_questions = generated_data["questions"]
            if not isinstance(generated_questions, list): raise ValueError("'questions' field not a JSON array.")
            if len(generated_questions) != num_questions: print(f"Warning: AI generated {len(generated_questions)} questions, requested {num_questions}.")
            # TODO: Add robust validation of questions/answers structure
            print(f"Successfully parsed {len(generated_questions)} questions from Gemini.")
        except (json.JSONDecodeError, ValueError, TypeError) as parse_error:
            # ... (Error handling for parsing as before) ...
            print(f"Error parsing/validating AI response: {parse_error}")
            print("--- Raw AI Response ---\n", ai_response_content, "\n--- End Raw Response ---")
            return jsonify({"error": "Received invalid data format from AI generator."}), 500

        # --- Add IDs and Prepare Document ---
        validated_questions = []
        for q_data in generated_questions:
            question_id = str(uuid.uuid4())
            validated_answers = []
            if "answers" in q_data and isinstance(q_data["answers"], list):
                 for a_data in q_data["answers"]:
                     validated_answers.append({
                         "id": str(uuid.uuid4()),
                         "answer_text": a_data.get("answer_text", "N/A"),
                         "is_correct": a_data.get("is_correct", False)
                     })
            validated_questions.append({
                "id": question_id,
                "question_text": q_data.get("question_text", "N/A"),
                "type": q_data.get("type", "multiple_choice"),
                "answers": validated_answers
            })
        generated_questions = validated_questions

        # --- Save to Database ---
        db = get_db()
        quizzes_collection = db.quizzes
        new_quiz_doc = {
            "id": str(uuid.uuid4()),
            "title": req_title,
            "topic": topic,
            "questions": generated_questions
        }
        insert_result = quizzes_collection.insert_one(new_quiz_doc)
        print(f"Inserted quiz ID: {new_quiz_doc['id']}, MongoDB _id: {insert_result.inserted_id}")

        # --- Fetch and Return Created Quiz ---
        created_quiz = quizzes_collection.find_one({"id": new_quiz_doc['id']}, {'_id': 0})
        if not created_quiz: return jsonify({"error": "Failed to confirm quiz creation after saving"}), 500
        print(f"Successfully generated/saved quiz '{created_quiz['title']}'")
        return jsonify(created_quiz), 201

    except Exception as e:
        print(f"Unexpected error in /api/quizzes/generate: {e}")
        traceback.print_exc()
        return jsonify({"error": "Server error during quiz generation."}), 500


# --- POST /api/chat (AI Chat Interaction) ---
@app.route('/api/chat', methods=['POST'])
def handle_chat():
    print("POST /api/chat request received")
    if not gemini_model:
        return jsonify({"error": "AI chat service is not configured."}), 503

    try:
        data = request.get_json()
        if not data: return jsonify({"error": "Request body must contain JSON data"}), 400

        user_message = data.get('message')
        context = data.get('context', {}) # Frontend sends context object

        if not user_message: return jsonify({"error": "Missing 'message'"}), 400

        # --- Build Contextual Prompt for Chat ---
        prompt_parts = ["You are a helpful quiz assistant."]

        # Add general quiz context if available
        if context.get('quizTitle'):
            prompt_parts.append(f"The user is interacting with the quiz titled '{context['quizTitle']}'.")

        # Add specific question context if available
        if context.get('questionText'):
            prompt_parts.append(f"The current question is: \"{context['questionText']}\"")
            if context.get('options'):
                 options_str = ", ".join([f"'{opt}'" for opt in context['options']])
                 prompt_parts.append(f"Options: {options_str}.")

            # Handle review mode context
            if context.get('isReviewMode'):
                 prompt_parts.append("\nThe user is currently reviewing their answer to this question.")
                 user_answer = context.get('userAnswerText')
                 correct_answer = context.get('correctAnswerText')
                 was_correct = context.get('wasCorrect') # Boolean from context

                 if user_answer is not None:
                     correctness_str = "correct" if was_correct else "incorrect"
                     prompt_parts.append(f"They previously answered '{user_answer}', which was {correctness_str}.")
                     if not was_correct and correct_answer:
                         prompt_parts.append(f"The correct answer is '{correct_answer}'.")
                 else:
                     prompt_parts.append("They did not answer this question during the quiz.")
                     if correct_answer:
                          prompt_parts.append(f"The correct answer is '{correct_answer}'.")
                 prompt_parts.append("Focus on explaining why the correct answer is right or why their answer was wrong based on their query.")
            else: # Active quiz mode context
                 prompt_parts.append("\nThe user is actively taking the quiz and asking about this question.")
                 prompt_parts.append("Provide helpful hints or conceptual explanations related ONLY to the question or its options. DO NOT REVEAL THE CORRECT ANSWER directly.")
        else:
            prompt_parts.append("\nThe user is asking a general question, possibly about the quiz topic.")

        # Add user's specific query
        prompt_parts.append(f"\nUser's message: \"{user_message}\"")
        prompt_parts.append("\nAssistant's concise and helpful response:")

        final_prompt = "\n".join(prompt_parts)
        print("\n--- Sending Chat Prompt to Gemini ---")
        print(final_prompt)
        print("-----------------------------------\n")

        # --- Call Gemini API for Text Generation ---
        try:
            # No specific generation config needed, default text output is fine for chat
            response = gemini_model.generate_content(final_prompt)

            if response.parts:
                ai_reply = response.text
                print("Received chat reply from Gemini.")
            else:
                # Handle blocking/errors (similar logic as quiz generation)
                print("Gemini Error: No chat reply generated or blocked.")
                error_message = "AI failed to generate a reply."
                try:
                    if response.candidates and response.candidates[0].finish_reason == 'SAFETY':
                         error_message = "AI reply blocked due to safety settings."
                         # Log details if needed: print(f"Safety Ratings: {response.candidates[0].safety_ratings}")
                except Exception: pass # Ignore errors fetching details
                return jsonify({"error": error_message}), 500

        except Exception as ai_error:
             # ... (Error handling for API call as before) ...
             print(f"Error calling Gemini API for chat: {ai_error}")
             user_message = f"Failed to get reply from AI service: {ai_error}"
             if "api key" in str(ai_error).lower() or "permission denied" in str(ai_error).lower(): user_message = "AI service authentication failed."
             return jsonify({"error": user_message}), 503

        # --- Return AI Reply ---
        return jsonify({"reply": ai_reply})

    except Exception as e:
        # Catch-all for unexpected errors in the route
        print(f"Unexpected error in /api/chat endpoint: {e}")
        traceback.print_exc()
        return jsonify({"error": "An unexpected server error occurred in chat."}), 500

# ==================
# --- Run the App ---
# ==================
if __name__ == '__main__':
    # Use 0.0.0.0 to be accessible within network/Codespaces
    # Set debug=False for production
    port = int(os.environ.get('PORT', 5001))
    app.run(debug=True, host='0.0.0.0', port=port)