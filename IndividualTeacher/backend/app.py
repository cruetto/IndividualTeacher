# backend/app.py

from flask import Flask, jsonify, request
from flask_cors import CORS
from database import connect_to_db, get_db
# bson.ObjectId might not be strictly needed if you always exclude _id,
# but keep it for the encoder in case you use ObjectIds elsewhere.
from bson import ObjectId
import json
import os
# Remove 'import uuid' if you are NOT generating custom UUIDs for 'id'

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": ["http://localhost:5173", "http://127.0.0.1:5173"]}}) # Adjust as needed

# --- Custom JSON Encoder (Keep this, good practice) ---
# Although we exclude _id now, it handles any other potential ObjectId fields
class MongoJSONEncoder(json.JSONEncoder):
    def default(self, o):
        if isinstance(o, ObjectId):
            return str(o)
        return super().default(o)
app.json_encoder = MongoJSONEncoder

# --- Connect to DB ---
try:
    connect_to_db()
    print("Database connection established successfully for the Flask app.")
except Exception as e:
    print(f"FATAL: Could not connect to database on startup: {e}")
    import sys
    sys.exit(1)

# --- API endpoint to GET all quizzes ---
@app.route('/api/quizzes', methods=['GET'])
def get_all_quizzes():
    print("GET /api/quizzes request received")
    try:
        db = get_db()
        quizzes_collection = db.quizzes

        # --- Use Projection to exclude _id ---
        # find({}, {'_id': 0}) tells MongoDB: find all documents ({}),
        # but do NOT include the _id field (0 means exclude).
        # All other fields will be included by default.
        all_quizzes = list(quizzes_collection.find({}, {'_id': 0}))

        # The documents in 'all_quizzes' list will NOT have the '_id' key.
        # They will contain the 'id', 'title', 'questions' etc. fields
        # ASSUMING those fields actually exist in your database documents.

        return jsonify(all_quizzes)

    except Exception as e:
        print(f"Error fetching quizzes: {e}")
        return jsonify({"error": "Failed to fetch quizzes from database"}), 500


# --- API endpoint to POST (add) a new quiz ---
@app.route('/api/quizzes', methods=['POST'])
def add_quiz():
    print("POST /api/quizzes request received")
    try:
        db = get_db()
        quizzes_collection = db.quizzes
        data = request.get_json()

        # --- Basic Input Validation ---
        if not data:
            return jsonify({"error": "Request body must contain JSON data"}), 400
        # *** IMPORTANT: Ensure the 'id' field is provided by the client
        # or generate it here if your interface requires it but Mongo doesn't auto-add it ***
        if 'id' not in data:
            # Option A: Generate ID if missing (e.g., if using UUIDs)
            # data['id'] = str(uuid.uuid4()) # Requires importing uuid
            # Option B: If using numeric IDs, you need a way to generate the next one
            # next_id = get_next_sequence_value("quiz_id") # Requires custom counter logic
            # data['id'] = next_id
            # Option C: Return an error if client MUST provide the ID
             return jsonify({"error": "Missing 'id' in request body"}), 400

        if 'title' not in data or not data['title']:
             return jsonify({"error": "Missing or empty 'title' in request body"}), 400
        if 'questions' not in data:
            data['questions'] = [] # Default to empty list

        # --- Optional: Add IDs to nested questions/answers if needed ---
        # if 'questions' in data:
        #    for question in data['questions']:
        #       if 'id' not in question: question['id'] = ... # Generate/assign ID
        #       if 'answers' in question:
        #           for answer in question['answers']:
        #               if 'id' not in answer: answer['id'] = ... # Generate/assign ID

        # --- Insert into Database ---
        # data now contains the 'id' field required by your interface
        insert_result = quizzes_collection.insert_one(data)
        # MongoDB will still add its own _id internally, but we don't care about it

        # --- Fetch and Return (excluding _id) ---
        # Find using the 'id' field you expect (numeric or string)
        new_quiz = quizzes_collection.find_one({"id": data['id']}, {'_id': 0})

        if not new_quiz:
             # This could happen if insert failed silently or if find criteria is wrong
             return jsonify({"error": "Failed to retrieve newly added quiz"}), 500

        return jsonify(new_quiz), 201

    except Exception as e:
        print(f"Error adding quiz: {e}")
        return jsonify({"error": "Failed to add quiz to database"}), 500


# --- Run the App ---
if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5001))
    app.run(debug=True, host='0.0.0.0', port=port)