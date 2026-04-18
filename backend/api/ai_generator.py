import traceback
import uuid
import json
from flask import Blueprint, jsonify, request
from bson import ObjectId

from config import get_db, get_current_user_db_id
from services.llm_service import get_llm_client, create_quiz_prompt, parse_ai_quiz_response

ai_routes = Blueprint('ai_generator', __name__)


@ai_routes.route('/api/quizzes/generate', methods=['POST'])
def generate_quiz():
    """Generates a quiz using AI. Saves to DB only if user is logged in."""
    user_db_id = get_current_user_db_id() 
    is_guest = user_db_id is None
    print(f"POST /api/quizzes/generate request received. UserID: {user_db_id} (Guest: {is_guest})")

    groq = get_llm_client()
    if not groq:
        return jsonify({"error": "AI service is not configured."}), 503

    try:
        data = request.get_json()
        if not data or not data.get('title') or not data.get('topic'):
            return jsonify({"error": "Missing 'title' or 'topic'"}), 400
        req_title = data['title']
        topic = data['topic']
        num_questions = data.get('num_questions', 5)
        if not isinstance(num_questions, int) or not 1 <= num_questions <= 20:
            return jsonify({"error": "Invalid 'num_questions' (1-20)."}), 400

        prompt = create_quiz_prompt(topic, num_questions)
        print(f"Sending quiz generation prompt to GROQ for topic: '{topic}'")

        ai_response_content = ""
        try:
            ai_response = groq.invoke(prompt)
            ai_response_content = ai_response.content
            print("Received quiz generation response from GROQ.")
        except Exception as ai_error:
            print(f"Error interacting with GROQ API: {ai_error}"); traceback.print_exc(); user_message="AI service error.";
            if "quota" in str(ai_error).lower(): user_message = "AI quota exceeded."
            elif "blocked" in str(ai_error).lower(): user_message = "Content blocked by AI safety filters."
            elif "API key not valid" in str(ai_error): user_message = "AI API key is invalid."
            return jsonify({"error": user_message}), 503

        try:
            validated_questions = parse_ai_quiz_response(ai_response_content)
            print(f"Successfully parsed {len(validated_questions)} questions.")
        except (json.JSONDecodeError, ValueError, TypeError) as parse_error:
            print(f"Error parsing/validating AI response: {parse_error}");
            print(f"--- Raw AI Response ---\n{ai_response_content[:1000]}{'...' if len(ai_response_content) > 1000 else ''}\n--- End Raw Response ---");
            return jsonify({"error": f"Received invalid data format from AI generator: {parse_error}"}), 500

        quiz_document_data = {
            "id": str(uuid.uuid4()),
            "title": req_title,
            "topic": topic,
            "questions": validated_questions,
        }

        if not is_guest:
            db = get_db()
            quizzes_collection = db.quizzes
            quiz_document_data_to_save = quiz_document_data.copy() 
            quiz_document_data_to_save['userId'] = user_db_id
            try:
                insert_result = quizzes_collection.insert_one(quiz_document_data_to_save)
                print(f"Saved generated quiz to DB. ID: {quiz_document_data['id']}, UserID: {user_db_id}")

                saved_quiz_from_db = quizzes_collection.find_one({"id": quiz_document_data['id']})
                if not saved_quiz_from_db: raise Exception("Failed to retrieve saved quiz.")

                response_data = {}
                for key, value in saved_quiz_from_db.items():
                    if isinstance(value, ObjectId):
                        response_data[key] = str(value)
                    else:
                        response_data[key] = value
                response_data.pop('_id', None) 
                print(f"Returning saved quiz data for user. Quiz ID: {response_data['id']}")
                return jsonify(response_data), 201

            except Exception as db_error:
                 print(f"Error saving generated quiz to DB for user {user_db_id}: {db_error}")
                 traceback.print_exc()
                 return jsonify({"error": "Failed to save generated quiz."}), 500
        else:

            print(f"Generated quiz for GUEST (not saved). ID: {quiz_document_data['id']}")
            quiz_document_data['userId'] = None
            return jsonify(quiz_document_data), 200 

    except Exception as e:
        print(f"Unexpected error in /api/quizzes/generate: {e}")
        traceback.print_exc()
        return jsonify({"error": "Server error during quiz generation."}), 500