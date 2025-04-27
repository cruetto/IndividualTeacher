# backend/app.py

from flask import Flask, jsonify, request
from flask_cors import CORS
from database import connect_to_db, get_db
from bson import ObjectId
import json
import os
import uuid # Keep using UUIDs for your internal IDs
import google.generativeai as genai # Import Google GenAI
from dotenv import load_dotenv



# --- Load Environment Variables ---
load_dotenv()

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": ["http://localhost:5173", "http://127.0.0.1:5173"]}}) # Adjust as needed



# --- Configure Google Gemini Client ---
gemini_model = None
try:
    google_api_key = os.environ.get("GOOGLE_API_KEY")
    if not google_api_key:
        print("WARNING: GOOGLE_API_KEY environment variable not set. AI generation disabled.")
    else:
        genai.configure(api_key=google_api_key)
        # Configure the model to directly output JSON
        generation_config = genai.types.GenerationConfig(
            # Crucial for getting structured JSON output
            response_mime_type="application/json"
        )
        # Select the Gemini model (check Google AI documentation for latest models)
        # gemini-1.5-flash is often a good balance of cost/performance
        gemini_model = genai.GenerativeModel(
            "gemini-1.5-flash",
            generation_config=generation_config
            # Add safety_settings here if needed (e.g., block fewer categories)
            # safety_settings=[...]
            )
        print("Google Gemini client initialized ('gemini-1.5-flash' with JSON output).")
except Exception as e:
     print(f"Error initializing Google Gemini client: {e}")



# --- Custom JSON Encoder (Keep this) ---
class MongoJSONEncoder(json.JSONEncoder):
    def default(self, o):
        if isinstance(o, ObjectId): return str(o)
        return super().default(o)
app.json_encoder = MongoJSONEncoder



# --- Connect to DB ---
try:
    connect_to_db()
    print("Database connection established successfully.")
except Exception as e:
    print(f"FATAL: Could not connect to database on startup: {e}")
    import sys
    sys.exit(1)



# --- Helper function to create the prompt (extracted for clarity) ---
def create_quiz_prompt(topic: str, num_questions: int) -> str:
    """Generates the precise prompt for the LLMs, requesting JSON output."""
    # Using the well-defined prompt structure you refined
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



# --- GET /api/quizzes (No changes needed) ---
@app.route('/api/quizzes', methods=['GET'])
def get_all_quizzes():
    print("GET /api/quizzes request received")
    try:
        db = get_db()
        quizzes_collection = db.quizzes
        all_quizzes = list(quizzes_collection.find({}, {'_id': 0}))
        return jsonify(all_quizzes)
    except Exception as e:
        print(f"Error fetching quizzes: {e}")
        return jsonify({"error": "Failed to fetch quizzes from database"}), 500

# --- POST /api/quizzes (Manual Add - No changes needed) ---
@app.route('/api/quizzes', methods=['POST'])
def add_quiz():
    # ... (previous code for manual adding) ...
    print("POST /api/quizzes request received (Manual Add)")
    try:
        db = get_db()
        quizzes_collection = db.quizzes
        data = request.get_json()
        if not data: return jsonify({"error": "Request body must contain JSON data"}), 400
        if 'title' not in data or not data['title']: return jsonify({"error": "Missing 'title'"}), 400
        if 'id' not in data: data['id'] = str(uuid.uuid4())
        if 'questions' not in data: data['questions'] = []
        insert_result = quizzes_collection.insert_one(data)
        new_quiz = quizzes_collection.find_one({"id": data['id']}, {'_id': 0})
        if not new_quiz: return jsonify({"error": "Failed to retrieve newly added quiz"}), 500
        return jsonify(new_quiz), 201
    except Exception as e:
        print(f"Error adding manual quiz: {e}")
        return jsonify({"error": "Failed to add quiz manually"}), 500



# --- *** MODIFIED: API endpoint to GENERATE a quiz using Google Gemini *** ---
@app.route('/api/quizzes/generate', methods=['POST'])
def generate_quiz():
    print("POST /api/quizzes/generate request received (Using Gemini)")
    if not gemini_model: # Check if Gemini client is initialized
        return jsonify({"error": "AI service (Gemini) is not configured or API key is missing."}), 503

    try:
        data = request.get_json()
        if not data: return jsonify({"error": "Request body must contain JSON data"}), 400

        req_title = data.get('title')
        topic = data.get('topic')
        num_questions = data.get('num_questions', 5)

        if not req_title or not topic:
            return jsonify({"error": "Missing 'title' or 'topic' in request body"}), 400
        if not isinstance(num_questions, int) or num_questions < 1 or num_questions > 20:
             return jsonify({"error": "Invalid 'num_questions' (must be int between 1 and 20)"}), 400

        # --- Create the prompt using the helper function ---
        prompt = create_quiz_prompt(topic, num_questions)

        print(f"Sending prompt to Gemini for topic: '{topic}' ({num_questions} questions)")
        # --- Call Google Gemini API ---
        try:
            # Call the Gemini model
            response = gemini_model.generate_content(prompt)

            # --- Handle Gemini Response ---
            if response.parts:
                ai_response_content = response.text.strip() # .text gets the content
                print("Received response from Gemini.")
            else:
                # Log detailed blocking information if available
                print("Gemini Error: No content generated or response was blocked.")
                error_message = "AI failed to generate content."
                try:
                    print(f"Prompt Feedback: {response.prompt_feedback}")
                    if response.candidates:
                        reason = response.candidates[0].finish_reason
                        print(f"Finish Reason: {reason}")
                        if reason == 'SAFETY':
                             error_message = "AI content generation blocked due to safety settings."
                             print(f"Safety Ratings: {response.candidates[0].safety_ratings}")

                except Exception as feedback_err:
                    print(f"Could not access detailed Gemini feedback: {feedback_err}")
                # Raise an error that will be caught by the outer 'except' block
                raise ValueError(error_message)

        except Exception as ai_error:
             # Catch errors during the API call itself or the ValueError raised above
             print(f"Error interacting with Gemini API: {ai_error}")
             user_message = f"Failed to generate quiz content from AI service: {ai_error}"
             # Check for common API key errors (may vary based on google-generativeai library versions)
             if "api key" in str(ai_error).lower() or "permission denied" in str(ai_error).lower():
                 user_message = "AI service authentication failed. Check Google API key."

             return jsonify({"error": user_message}), 503 # Service Unavailable or specific error

        # --- Parse and Validate AI Response ---
        # (This part remains largely the same as we expect JSON)
        try:
            if not ai_response_content: raise ValueError("AI returned empty content string.")

            # Parse the JSON string from the AI response
            # Gemini (with response_mime_type="application/json") should return just the JSON object string
            generated_data = json.loads(ai_response_content)

            # Validate the top-level structure
            if not isinstance(generated_data, dict) or "questions" not in generated_data:
                 raise ValueError("AI response is not a JSON object with a 'questions' key.")
            generated_questions = generated_data["questions"]
            if not isinstance(generated_questions, list):
                 raise ValueError("The 'questions' field in AI response is not a JSON array.")

            # Basic validation of generated questions count
            if len(generated_questions) != num_questions:
                 print(f"Warning: AI generated {len(generated_questions)} questions, requested {num_questions}.")

            # ** TODO: Add the same robust validation as before **
            # Check question structure, answers, exactly one correct, UUIDs etc.

            print(f"Successfully parsed {len(generated_questions)} questions from Gemini response.")

        except (json.JSONDecodeError, ValueError, TypeError) as parse_error:
            print(f"Error parsing or validating AI (Gemini) response: {parse_error}")
            print("--- Raw AI (Gemini) Response ---")
            print(ai_response_content)
            print("--- End Raw AI Response ---")
            return jsonify({"error": "Received invalid data format from AI generator."}), 500

        # --- Prepare and Save Quiz Document (No changes needed here) ---
        db = get_db()
        quizzes_collection = db.quizzes

        # Inside generate_quiz function, after parsing 'generated_questions'

        validated_questions = []
        for q_data in generated_questions:
            question_id = str(uuid.uuid4()) # Generate question ID
            validated_answers = []
            if "answers" in q_data and isinstance(q_data["answers"], list):
                 for a_data in q_data["answers"]:
                     validated_answers.append({
                         "id": str(uuid.uuid4()), # Generate answer ID
                         "answer_text": a_data.get("answer_text", "N/A"),
                         "is_correct": a_data.get("is_correct", False)
                     })
            validated_questions.append({
                "id": question_id, # Use generated ID
                "question_text": q_data.get("question_text", "N/A"),
                "type": q_data.get("type", "multiple_choice"),
                "answers": validated_answers
            })

        print(f"Added UUIDs to {len(validated_questions)} questions.")
        generated_questions = validated_questions # Replace with processed list

        # --- Prepare and Save Quiz Document ---
        # ... (rest of the function uses the generated_questions list with IDs) ...
        new_quiz_doc = {
            "id": str(uuid.uuid4()),
            "title": req_title,
            "topic": topic,
            "questions": generated_questions # <-- Use questions with IDs
        }
        # ... (rest of save logic) ...

        insert_result = quizzes_collection.insert_one(new_quiz_doc)
        print(f"Inserted quiz with custom ID: {new_quiz_doc['id']}, MongoDB _id: {insert_result.inserted_id}")

        # --- Fetch and Return (excluding _id) (No changes needed here) ---
        created_quiz = quizzes_collection.find_one({"id": new_quiz_doc['id']}, {'_id': 0})
        if not created_quiz:
             print(f"CRITICAL: Failed to retrieve quiz {new_quiz_doc['id']} immediately after insertion.")
             return jsonify({"error": "Failed to confirm quiz creation after saving"}), 500

        print(f"Successfully generated and saved quiz '{created_quiz['title']}' using Gemini")
        return jsonify(created_quiz), 201

    except Exception as e:
        # Catch-all for unexpected errors in the route logic
        print(f"Unexpected error in /api/quizzes/generate (Gemini): {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": "An unexpected server error occurred during quiz generation."}), 500






# backend/app.py
# ... (previous imports, setup, GET, POST, GENERATE routes) ...

# --- *** NEW: API endpoint to DELETE a quiz *** ---
@app.route('/api/quizzes/<quiz_id>', methods=['DELETE'])
def delete_quiz(quiz_id):
    print(f"DELETE /api/quizzes/{quiz_id} request received")
    try:
        db = get_db()
        quizzes_collection = db.quizzes

        # Find using the custom 'id' field (which should be a string UUID)
        delete_result = quizzes_collection.delete_one({"id": quiz_id})

        if delete_result.deleted_count == 1:
            print(f"Successfully deleted quiz with ID: {quiz_id}")
            # 204 No Content is often used for successful DELETE with no body
            return '', 204
        else:
            print(f"Quiz with ID {quiz_id} not found for deletion.")
            return jsonify({"error": "Quiz not found"}), 404

    except Exception as e:
        print(f"Error deleting quiz {quiz_id}: {e}")
        return jsonify({"error": "Failed to delete quiz"}), 500


# --- *** NEW: API endpoint to UPDATE (PUT) a quiz *** ---
@app.route('/api/quizzes/<quiz_id>', methods=['PUT'])
def update_quiz(quiz_id):
    print(f"PUT /api/quizzes/{quiz_id} request received")
    try:
        db = get_db()
        quizzes_collection = db.quizzes
        updated_data = request.get_json()

        if not updated_data:
            return jsonify({"error": "Request body must contain JSON data"}), 400

        # --- Validation (Crucial!) ---
        # Ensure required fields are present (title, questions as list, etc.)
        if 'id' not in updated_data or updated_data['id'] != quiz_id:
             return jsonify({"error": "Quiz ID in body does not match URL ID"}), 400
        if 'title' not in updated_data or not updated_data['title']:
             return jsonify({"error": "Missing or empty 'title'"}), 400
        if 'questions' not in updated_data or not isinstance(updated_data['questions'], list):
            return jsonify({"error": "Missing or invalid 'questions' array"}), 400
        # ** TODO: Add deeper validation for questions and answers structure **
        # - Check IDs, question_text, answers array, answer_text, is_correct boolean etc.


        # --- Perform Update ---
        # replace_one finds the document by custom 'id' and replaces its entire content
        # (excluding the immutable MongoDB _id) with the provided data.
        update_result = quizzes_collection.replace_one(
            {"id": quiz_id}, # Filter to find the document by custom ID
            updated_data     # The new content for the document
            # upsert=False by default (don't create if not found)
        )

        if update_result.matched_count == 1:
            if update_result.modified_count == 1:
                print(f"Successfully updated quiz with ID: {quiz_id}")
                 # Fetch the updated document (excluding _id) to return it
                updated_quiz = quizzes_collection.find_one({"id": quiz_id}, {'_id': 0})
                return jsonify(updated_quiz), 200 # OK
            else:
                 print(f"Quiz {quiz_id} found but no changes were needed.")
                 # Still return the document, maybe with 200 OK or 304 Not Modified? 200 is simpler.
                 updated_quiz = quizzes_collection.find_one({"id": quiz_id}, {'_id': 0})
                 return jsonify(updated_quiz), 200
        else:
            print(f"Quiz with ID {quiz_id} not found for update.")
            return jsonify({"error": "Quiz not found"}), 404

    except Exception as e:
        print(f"Error updating quiz {quiz_id}: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": "Failed to update quiz"}), 500


# --- Run the App ---
# ... (if __name__ == '__main__' block) ...




# --- Run the App (No changes needed) ---
if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5001))
    app.run(debug=True, host='0.0.0.0', port=port)