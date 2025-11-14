# backend/app.py
import os
import json
import uuid
import traceback
import datetime
import sys 
from functools import wraps

from flask import Flask, jsonify, request, session, make_response
from flask_cors import CORS 
import flask_cors
from flask_login import LoginManager, UserMixin, login_user, logout_user, login_required, current_user
from bson import ObjectId
from dotenv import load_dotenv
import google.generativeai as genai
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests

from database import connect_to_db, get_db

load_dotenv()
app = Flask(__name__)
app.secret_key = os.environ.get('FLASK_SECRET_KEY')

IS_PRODUCTION = os.environ.get('FLASK_ENV') == 'production'

if IS_PRODUCTION:
    print("--- RUNNING IN PRODUCTION MODE ---")
    app.config['SESSION_COOKIE_SAMESITE'] = 'None'
    app.config['SESSION_COOKIE_SECURE'] = True
else:
    print("--- RUNNING IN DEVELOPMENT MODE ---")
    app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'
    app.config['SESSION_COOKIE_SECURE'] = False

app.config['SESSION_COOKIE_HTTPONLY'] = True

frontend_origin = os.environ.get("FRONTEND_ORIGIN", "http://localhost:5173")
print(f"--- FLASK BACKEND: Initializing GLOBAL Flask-CORS for Origin: {frontend_origin} ---")
CORS(
    app,
    origins=[frontend_origin],
    supports_credentials=True,
    methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "X-Requested-With", "Accept", "Origin"]
)

_gemini_client = None

def get_gemini_client():
    """
    Initializes and returns a single instance of the Gemini client.
    This prevents initialization in the Gunicorn master process.
    """
    global _gemini_client
    if _gemini_client is None:
        print("--- Initializing Google Gemini client for the first time in this worker ---")
        try:
            google_api_key = os.environ.get("GOOGLE_API_KEY")
            if not google_api_key:
                print("WARNING: GOOGLE_API_KEY is not set.")
                return None
            
            genai.configure(api_key=google_api_key)
            gemini_generation_config_json = genai.types.GenerationConfig(
                response_mime_type="application/json"
            )
            _gemini_client = genai.GenerativeModel("google/gemini-2.5-flash")
            
            print("--- Google Gemini client initialized successfully. ---")
        except Exception as e:
            print(f"FATAL: Error initializing Google Gemini client: {e}")
            return None
    return _gemini_client


print(f"--- FLASK BACKEND: Flask-CORS imported successfully. Version: {flask_cors.__version__} ---")
print("--- FLASK BACKEND: GLOBAL Flask-CORS initialized. ---")


gemini_model = None
gemini_generation_config_json = None
try:
    google_api_key = os.environ.get("GOOGLE_API_KEY")
    if not google_api_key:
        print("WARNING: GOOGLE_API_KEY environment variable not set. AI features may be limited.")
    else:
        genai.configure(api_key=google_api_key)
        
        gemini_generation_config_json = genai.types.GenerationConfig(
            response_mime_type="application/json"
        )

except Exception as e:
     print(f"Error initializing Google Gemini client: {e}")


# --- Google Client ID Setup ---
GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID")
if not GOOGLE_CLIENT_ID:
  
    print("FATAL: GOOGLE_CLIENT_ID environment variable not set. Google Sign-In backend verification will fail.")

# --- Custom JSON Encoder (Handles ObjectId, Datetime) ---
class MongoJSONEncoder(json.JSONEncoder):
    def default(self, o):
        if isinstance(o, ObjectId):
            return str(o) # Convert ObjectId to string
        if isinstance(o, datetime.datetime):
            # Format datetime as ISO string with Z for UTC timezone indicator
            # Ensure milliseconds precision if needed by frontend
            return o.isoformat(timespec='milliseconds') + 'Z'
        return super().default(o)
app.json_encoder = MongoJSONEncoder # Register the custom encoder with Flask

# --- Database Connection ---
try:
    connect_to_db()
    print("Database connection established successfully.")
except Exception as e:
    print(f"FATAL: Could not connect to database on startup: {e}")
    sys.exit(1)

# --- Flask-Login Setup ---
login_manager = LoginManager()
login_manager.init_app(app)

class User(UserMixin):
    """User class compatible with Flask-Login"""
    def __init__(self, user_data):
        self.user_data = user_data

    @property
    def id(self):
        return str(self.user_data['_id'])

    @property
    def email(self): return self.user_data.get('email')
    @property
    def name(self): return self.user_data.get('name')
    @property
    def picture(self): return self.user_data.get('picture')

    def get_db_id(self):
        return self.user_data['_id']

@login_manager.user_loader
def load_user(user_id_str):
    """Loads user from DB based on string ID stored in session cookie."""
    if not ObjectId.is_valid(user_id_str):
        print(f"User loader received invalid ObjectId string: {user_id_str}")
        return None
    try:
        db = get_db()
        user_data = db.users.find_one({'_id': ObjectId(user_id_str)})
        if user_data:
            return User(user_data)
        else:
            return None
    except Exception as e:
         print(f"Error in user_loader for ID {user_id_str}: {e}")
         return None

@login_manager.unauthorized_handler
def unauthorized():
    """Handles unauthorized access attempts (e.g., accessing @login_required routes without session)."""
    print("Unauthorized access attempt detected (session invalid or missing).")
    # Return JSON error for API requests
    return jsonify(error="Authentication required."), 401

# --- Helper function to get current user's MongoDB ObjectId ---
def get_current_user_db_id():
    """Returns the MongoDB ObjectId of the currently logged-in user, or None."""
    if current_user and current_user.is_authenticated:
        return current_user.get_db_id()
    return None

# --- Quiz Prompt Helper ---
def create_quiz_prompt(topic: str, num_questions: int) -> str:
    """Generates the precise prompt for the LLMs, requesting JSON output for quizzes."""
    prompt = f"""
Generate exactly {num_questions} multiple-choice quiz questions about the topic: "{topic}".

Format the output STRICTLY as a single JSON object. This object must contain ONE key named "questions".
The value of "questions" MUST be a JSON array where each element is a question object.

Each question object in the array MUST have the following fields:
- "id": A unique UUID string generated for this question (e.g., using Python's uuid.uuid4()).
- "type": The string "multiple_choice".
- "question_text": The string containing the question text.
- "answers": A JSON array containing exactly 4 answer option objects.

Each answer option object in the "answers" array MUST have the following fields:
- "id": A unique UUID string generated for this answer option (e.g., using Python's uuid.uuid4()).
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


# ===================================
# --- Authentication Endpoints ---
# (Flask-CORS handles headers automatically)
# ===================================
@app.route('/api/auth/google/callback', methods=['POST'])
def google_callback():
    """Handles the token received from Google Sign-In on the frontend."""
    if not GOOGLE_CLIENT_ID:
         return jsonify({"error": "Google Sign-In not configured on server."}), 503

    data = request.get_json()
    token = data.get('credential')

    if not token:
        return jsonify({"error": "Missing credential token."}), 400 

    try:
        print("Attempting to verify Google token...")
        # Verify the token with Google's servers
        idinfo = id_token.verify_oauth2_token(
            token, google_requests.Request(), GOOGLE_CLIENT_ID
        )
        print("Token verified successfully.")

        # --- User Lookup/Creation in Database ---
        db = get_db()
        users_collection = db.users
        google_id = idinfo['sub'] # Unique Google User ID
        email = idinfo.get('email')
        name = idinfo.get('name')
        picture = idinfo.get('picture')

        if not email:
            return jsonify({"error": "Email not found in Google token."}), 400

        user_data = users_collection.find_one({"googleId": google_id})
        current_time = datetime.datetime.now(datetime.timezone.utc) # Use timezone-aware UTC time

        if user_data:
            # Existing user: Update last login time and potentially name/picture
            update_result = users_collection.update_one(
                {"_id": user_data['_id']},
                {"$set": {
                    "lastLogin": current_time,
                    "name": name, # Update name/picture in case they changed
                    "picture": picture,
                    "email": email # Update email just in case
                }}
            )
            user_data = users_collection.find_one({"_id": user_data['_id']}) 
            print(f"User logged in: {email} (ID: {user_data['_id']})")
        else:
            new_user_doc = {
                "googleId": google_id,
                "email": email,
                "name": name,
                "picture": picture,
                "createdAt": current_time,
                "lastLogin": current_time
            }
            insert_result = users_collection.insert_one(new_user_doc)
            user_data = new_user_doc
            user_data['_id'] = insert_result.inserted_id 
            print(f"New user created: {email} (ID: {user_data['_id']})")

        user_obj = User(user_data)
        login_user(user_obj, remember=True, duration=datetime.timedelta(days=30))
        print(f"Flask-Login session created for user: {email}")


        return jsonify({
            "message": "Login successful",
            "user": {
                "id": str(user_data['_id']),
                "email": user_data.get('email'),
                "name": user_data.get('name'),
                "picture": user_data.get('picture')
             }
        }), 200 # OK

    except ValueError as e:
         print(f"Google Token Verification Error: {e}")
         traceback.print_exc()
         return jsonify({"error": "Invalid Google sign-in token."}), 401
    except Exception as e:
         print(f"Error during Google callback processing: {e}")
         traceback.print_exc()
         return jsonify({"error": "Server error during authentication."}), 500

@app.route('/api/auth/logout', methods=['POST'])
@login_required
def logout():
    """Logs the current user out by clearing the session."""
    user_email = current_user.email
    logout_user() 
    print(f"User logged out: {user_email}")
    
    return jsonify({"message": "Logout successful"}), 200

@app.route('/api/auth/status', methods=['GET'])
def auth_status():
    """Checks if a user is currently logged in via session cookie."""
    if current_user and current_user.is_authenticated:
        print(f"Auth status check: User '{current_user.email}' is authenticated.")
        #
        return jsonify({
            "isAuthenticated": True,
            "user": {
                "id": current_user.id,
                "email": current_user.email,
                "name": current_user.name,
                "picture": current_user.picture
             }
        })
    else:
         print("Auth status check: No authenticated user.")
         return jsonify({"isAuthenticated": False, "user": None})

# =========================================
# --- Standard Quiz CRUD API Endpoints ---
# (Flask-CORS handles headers automatically)
# =========================================
@app.route('/api/quizzes', methods=['GET'])
def get_quizzes():
    """Fetches quizzes based on scope: 'public' (userId: null) or 'my' (userId: current user)."""
    try:
        db = get_db()
        quizzes_collection = db.quizzes
        scope = request.args.get('scope', 'public')
        user_db_id = get_current_user_db_id()

        print(f"GET /api/quizzes request. Scope: {scope}, UserID: {user_db_id}")
        query = {}

        if scope == 'public':
            query = {"userId": None}
            print("Fetching public (userId: None) quizzes.")
        elif scope == 'my':
            if not user_db_id:
                return jsonify({"error": "Authentication required to fetch 'my' quizzes."}), 401
            query = {"userId": user_db_id}
            print(f"Fetching quizzes for user {user_db_id}.")
        else:
            return jsonify({"error": "Invalid scope parameter. Use 'public' or 'my'."}), 400

        
        found_quizzes_raw = list(quizzes_collection.find(query))

        processed_quizzes = []
        for quiz in found_quizzes_raw:
            processed_quiz = {}
            for key, value in quiz.items():
                if isinstance(value, ObjectId):
                    processed_quiz[key] = str(value)
                else:
                    processed_quiz[key] = value
            processed_quiz.pop('_id', None)
            processed_quizzes.append(processed_quiz)

        print(f"Found and processed {len(processed_quizzes)} quizzes for scope '{scope}'.")

        return jsonify(processed_quizzes)

    except Exception as e:
        print(f"Error fetching quizzes (scope: {scope}): {e}")
        traceback.print_exc()
        return jsonify({"error": "Failed to fetch quizzes from database"}), 500


@app.route('/api/quizzes', methods=['POST'])
@login_required
def add_quiz():
    """Adds a new quiz manually for the logged-in user."""
    user_db_id = get_current_user_db_id()
    print(f"POST /api/quizzes request received (Manual Add). UserID: {user_db_id}")
    try:
        db = get_db()
        quizzes_collection = db.quizzes
        data = request.get_json()

        if not data: return jsonify({"error": "Request body must contain JSON data"}), 400
        if not data.get('title'): return jsonify({"error": "Missing 'title'"}), 400
        if 'questions' not in data or not isinstance(data['questions'], list): data['questions'] = []

        if 'id' not in data or not data['id']: data['id'] = str(uuid.uuid4())
        for q in data['questions']:
            if 'id' not in q or not q['id']: q['id'] = str(uuid.uuid4())
            if 'answers' in q:
                for a in q['answers']:
                    if 'id' not in a or not a['id']: a['id'] = str(uuid.uuid4())

        data['userId'] = user_db_id
        data.pop('_id', None)

        insert_result = quizzes_collection.insert_one(data)
        new_quiz = quizzes_collection.find_one({"id": data['id']}, {'_id': 0})

        if not new_quiz: return jsonify({"error": "Failed to retrieve newly added quiz"}), 500
        print(f"Quiz added manually. ID: {data['id']}, UserID assigned: {user_db_id}")

        return jsonify(new_quiz), 201 

    except Exception as e:
        print(f"Error adding manual quiz: {e}")
        traceback.print_exc()
        return jsonify({"error": "Failed to add quiz manually"}), 500

@app.route('/api/quizzes/<quiz_id>', methods=['DELETE'])
@login_required
def delete_quiz(quiz_id):
    """Deletes a quiz owned by the current user."""
    user_db_id = get_current_user_db_id()
    print(f"DELETE /api/quizzes/{quiz_id} request. UserID: {user_db_id}")
    try:
        db = get_db()
        quizzes_collection = db.quizzes
        delete_result = quizzes_collection.delete_one({"id": quiz_id, "userId": user_db_id})

        if delete_result.deleted_count == 1:
            print(f"Successfully deleted quiz {quiz_id} owned by {user_db_id}")
            return '', 204
        else:
            quiz_exists = quizzes_collection.count_documents({"id": quiz_id}) > 0
            if quiz_exists:
                print(f"Permission denied: User {user_db_id} tried to delete quiz {quiz_id} not owned by them.")
                return jsonify({"error": "Permission denied. You do not own this quiz."}), 403
            else:
                print(f"Not found: Quiz {quiz_id} not found for deletion.")
                return jsonify({"error": "Quiz not found"}), 404

    except Exception as e:
        print(f"Error deleting quiz {quiz_id}: {e}")
        traceback.print_exc()
        return jsonify({"error": "Failed to delete quiz"}), 500

@app.route('/api/quizzes/<quiz_id>', methods=['PUT'])
@login_required
def update_quiz(quiz_id):
    """Updates a quiz owned by the current user."""
    user_db_id = get_current_user_db_id()
    print(f"PUT /api/quizzes/{quiz_id} request. UserID: {user_db_id}")
    try:
        db = get_db()
        quizzes_collection = db.quizzes
        updated_data = request.get_json()

        if not updated_data: return jsonify({"error": "Request body must contain JSON data"}), 400
        if not updated_data.get('title'): return jsonify({"error": "Missing 'title'"}), 400
        if 'questions' not in updated_data or not isinstance(updated_data['questions'], list): return jsonify({"error": "Missing 'questions' array"}), 400

        updated_data['id'] = quiz_id
        for q in updated_data.get('questions', []):
             if 'id' not in q or not q['id']: q['id'] = str(uuid.uuid4())
             for a in q.get('answers', []):
                 if 'id' not in a or not a['id']: a['id'] = str(uuid.uuid4())

        updated_data.pop('_id', None); updated_data.pop('userId', None)
        replacement_doc = updated_data.copy(); replacement_doc['userId'] = user_db_id
        filter_criteria = {"id": quiz_id, "userId": user_db_id}
        update_result = quizzes_collection.replace_one(filter_criteria, replacement_doc)

        if update_result.matched_count == 1:
            print(f"Quiz {quiz_id} owned by {user_db_id} updated (Modified: {update_result.modified_count == 1}).")
            updated_quiz_from_db = quizzes_collection.find_one(filter_criteria)

            if not updated_quiz_from_db:
                 print(f"Error: Failed to retrieve quiz {quiz_id} after successful update confirmation.")
                 return jsonify({"error": "Failed to retrieve updated quiz after successful update."}), 500

            response_data = {}
            for key, value in updated_quiz_from_db.items():
                if isinstance(value, ObjectId):
                    response_data[key] = str(value)
                else:
                    response_data[key] = value
            response_data.pop('_id', None) 

            return jsonify(response_data), 200 

        else:
            quiz_exists = quizzes_collection.count_documents({"id": quiz_id}) > 0
            if quiz_exists:
                print(f"Permission denied: User {user_db_id} tried to update quiz {quiz_id} owned by someone else.")
                return jsonify({"error": "Permission denied. You do not own this quiz."}), 403
            else:
                print(f"Not found: Quiz {quiz_id} not found for update.")
                return jsonify({"error": "Quiz not found"}), 404 

    except Exception as e:
        print(f"Error updating quiz {quiz_id}: {e}")
        traceback.print_exc()
        return jsonify({"error": "Failed to update quiz"}), 500


@app.route('/api/quizzes/<quiz_id>', methods=['GET'])
@login_required
def get_quiz_by_id(quiz_id):
    """Fetches a single quiz by its custom ID, ensuring the user owns it."""
    user_db_id = get_current_user_db_id()
    print(f"GET /api/quizzes/{quiz_id} request. UserID: {user_db_id}")
    try:
        db = get_db()
        quizzes_collection = db.quizzes

        # Find the quiz by its custom ID AND ensure it belongs to the current user
        # Fetch the raw document including _id and userId (as ObjectId)
        quiz_data_raw = quizzes_collection.find_one(
            {"id": quiz_id, "userId": user_db_id}
        )

        if quiz_data_raw:
            print(f"Found quiz {quiz_id} owned by user {user_db_id}.")

            response_data = {}
            for key, value in quiz_data_raw.items():
                if isinstance(value, ObjectId):
                    response_data[key] = str(value) 
                else:
                    response_data[key] = value
            response_data.pop('_id', None) 

            return jsonify(response_data), 200 
        else:

            print(f"Quiz {quiz_id} not found or not owned by user {user_db_id}.")
            return jsonify({"error": "Quiz not found or permission denied."}), 404 

    except Exception as e:
        print(f"Error fetching quiz {quiz_id}: {e}")
        traceback.print_exc()
        return jsonify({"error": "Failed to fetch quiz data"}), 500


# ==================================
# --- AI Interaction Endpoints ---
# ==================================

@app.route('/api/quizzes/generate', methods=['POST'])
def generate_quiz():
    """Generates a quiz using AI. Saves to DB only if user is logged in."""
    user_db_id = get_current_user_db_id() 
    is_guest = user_db_id is None
    print(f"POST /api/quizzes/generate request received. UserID: {user_db_id} (Guest: {is_guest})")

    gemini_model = get_gemini_client()
    if not gemini_model:
        return jsonify({"error": "AI service is not configured."}), 503

    try:
        data = request.get_json()
        # --- Input validation ---
        if not data or not data.get('title') or not data.get('topic'):
            return jsonify({"error": "Missing 'title' or 'topic'"}), 400
        req_title = data['title']
        topic = data['topic']
        num_questions = data.get('num_questions', 5)
        if not isinstance(num_questions, int) or not 1 <= num_questions <= 20:
            return jsonify({"error": "Invalid 'num_questions' (1-20)."}), 400

        prompt = create_quiz_prompt(topic, num_questions)
        print(f"Sending quiz generation prompt to Gemini for topic: '{topic}'")

        # --- Call Gemini API ---
        ai_response_content = ""
        try:
            config_to_use = gemini_generation_config_json
            response = gemini_model.generate_content(prompt, generation_config=config_to_use)
            if not response.parts: raise ValueError("AI failed to generate content or was blocked.")
            ai_response_content = response.text.strip()
            print("Received quiz generation response from Gemini.")
        except Exception as ai_error:
            print(f"Error interacting with Gemini API: {ai_error}"); traceback.print_exc(); user_message="AI service error.";
            if "quota" in str(ai_error).lower(): user_message = "AI quota exceeded."
            elif "blocked" in str(ai_error).lower(): user_message = "Content blocked by AI safety filters."
            elif "API key not valid" in str(ai_error): user_message = "AI API key is invalid."
            return jsonify({"error": user_message}), 503

        validated_questions = [] 
        try:
            if ai_response_content.startswith("```json"): ai_response_content = ai_response_content[7:]
            if ai_response_content.endswith("```"): ai_response_content = ai_response_content[:-3]
            ai_response_content = ai_response_content.strip();
            if not ai_response_content: raise ValueError("AI returned empty content after cleaning.")
            generated_data = json.loads(ai_response_content)
            if not isinstance(generated_data, dict) or "questions" not in generated_data: raise ValueError("AI JSON missing 'questions' key.")
            if not isinstance(generated_data["questions"], list): raise ValueError("'questions' field is not a list.")

            for q_data in generated_data["questions"]:
                 if isinstance(q_data, dict) and q_data.get("question_text") and isinstance(q_data.get("answers"), list):
                      q_data['id'] = q_data.get('id', str(uuid.uuid4())); q_data['type'] = q_data.get('type', 'multiple_choice'); q_data['question_text'] = str(q_data['question_text'])
                      valid_answers = []
                      for a_data in q_data.get("answers", []):
                          if isinstance(a_data, dict) and a_data.get("answer_text") is not None:
                              a_data['id'] = a_data.get('id', str(uuid.uuid4())); a_data['answer_text'] = str(a_data['answer_text']); a_data['is_correct'] = bool(a_data.get('is_correct', False))
                              valid_answers.append(a_data)
                      q_data['answers'] = valid_answers
                      if valid_answers: validated_questions.append(q_data)
                 else: print(f"Warning: Skipping invalid question structure: {q_data}")
            if not validated_questions: raise ValueError("AI response parsed, but no valid questions found after validation.")
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
                return jsonify(response_data), 201 # 201 Created

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
    


@app.route('/api/chat', methods=['POST'])
def handle_chat():
    """Handles chat messages, providing context to the AI."""
    print("POST /api/chat request received")
    gemini_model = get_gemini_client()
    if not gemini_model:
        return jsonify({"error": "AI chat service is not configured."}), 503

    try:
        data = request.get_json()
        if not data: return jsonify({"error": "Request body must contain JSON data"}), 400

        user_message = data.get('message')
        context = data.get('context', {}) 

        if not user_message: return jsonify({"error": "Missing 'message'"}), 400

        # --- Build Contextual Prompt for Chat ---
        prompt_parts = ["You are a helpful quiz assistant."]
        if context.get('quizTitle'): prompt_parts.append(f"The user is interacting with the quiz titled '{context['quizTitle']}'.")
        if context.get('questionText'):
            prompt_parts.append(f"The current question is: \"{context['questionText']}\"")
            if context.get('options'):
                 options_str = ", ".join([f"'{opt}'" for opt in context['options']])
                 prompt_parts.append(f"Options: {options_str}.")
    
            if context.get('isReviewMode'):
                 prompt_parts.append("\nThe user is currently reviewing their answer to this question.")
                 user_answer = context.get('userAnswerText')
                 correct_answer = context.get('correctAnswerText')
                 was_correct = context.get('wasCorrect')
                 if user_answer is not None:
                     correctness_str = "correct" if was_correct else "incorrect"
                     prompt_parts.append(f"They previously answered '{user_answer}', which was {correctness_str}.")
                     if not was_correct and correct_answer: prompt_parts.append(f"The correct answer is '{correct_answer}'.")
                 else:
                     prompt_parts.append("They did not answer this question during the quiz.")
                     if correct_answer: prompt_parts.append(f"The correct answer is '{correct_answer}'.")
                 prompt_parts.append("Focus on explaining why the correct answer is right or why their answer was wrong based on their query.")
            else: 
                 prompt_parts.append("\nThe user is actively taking the quiz and asking about this question.")
                 prompt_parts.append("Provide helpful hints or conceptual explanations related ONLY to the question or its options. DO NOT REVEAL THE CORRECT ANSWER directly.")
        else: 
            prompt_parts.append("\nThe user is asking a general question, possibly about the quiz topic.")

        prompt_parts.append(f"\nUser's message: \"{user_message}\"")
        prompt_parts.append("\nAssistant's concise and helpful response:")
        final_prompt = "\n".join(prompt_parts)

        print("\n--- Sending Chat Prompt to Gemini ---")
        print(final_prompt)
        print("-----------------------------------\n")

        # --- Call Gemini API for Text Generation ---
        try:
            # Use default text generation, no specific JSON config needed for chat
            response = gemini_model.generate_content(final_prompt)
            # Check for blocked content or other generation issues
            if response.parts:
                ai_reply = response.text
                print("Received chat reply from Gemini.")
            else:
                print("Gemini Error: No chat reply generated or potentially blocked.")
                error_message = "AI failed to generate a reply."
                try:
                    if response.prompt_feedback and response.prompt_feedback.block_reason:
                         error_message = f"AI reply blocked due to: {response.prompt_feedback.block_reason.name}. Try rephrasing."
                    elif response.candidates and response.candidates[0].finish_reason != genai.types.Candidate.FinishReason.STOP:
                         error_message = f"AI reply generation stopped unexpectedly ({response.candidates[0].finish_reason.name})."
                except Exception as feedback_error:
                     print(f"Could not parse detailed AI feedback: {feedback_error}")
                return jsonify({"error": error_message}), 500

        except Exception as ai_error:
             print(f"Error calling Gemini API for chat: {ai_error}")
             traceback.print_exc()
             user_message = f"Failed to get reply from AI service: {ai_error}"
             if "api key" in str(ai_error).lower() or "permission denied" in str(ai_error).lower(): user_message = "AI service authentication failed."
             return jsonify({"error": user_message}), 503

        return jsonify({"reply": ai_reply})

    except Exception as e:
        print(f"Unexpected error in /api/chat endpoint: {e}")
        traceback.print_exc()
        return jsonify({"error": "An unexpected server error occurred in chat."}), 500


# ==================
# --- Run the App ---
# ==================
if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5001))
    print(f"--- Starting Flask server on http://0.0.0.0:{port} ---")
    app.run(debug=True, host='0.0.0.0', port=port)
