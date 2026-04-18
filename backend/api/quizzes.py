import traceback
import uuid
from flask import Blueprint, jsonify, request
from flask_login import login_required
from bson import ObjectId

from config import get_db, get_current_user_db_id

quiz_routes = Blueprint('quizzes', __name__)


@quiz_routes.route('/api/quizzes', methods=['GET'])
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


@quiz_routes.route('/api/quizzes', methods=['POST'])
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


@quiz_routes.route('/api/quizzes/<quiz_id>', methods=['DELETE'])
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


@quiz_routes.route('/api/quizzes/<quiz_id>', methods=['PUT'])
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


@quiz_routes.route('/api/quizzes/<quiz_id>', methods=['GET'])
@login_required
def get_quiz_by_id(quiz_id):
    """Fetches a single quiz by its custom ID, ensuring the user owns it."""
    user_db_id = get_current_user_db_id()
    print(f"GET /api/quizzes/{quiz_id} request. UserID: {user_db_id}")
    try:
        db = get_db()
        quizzes_collection = db.quizzes

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