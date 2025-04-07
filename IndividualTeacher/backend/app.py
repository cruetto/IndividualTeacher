from flask import Flask, jsonify, request # Import necessary modules
from flask_cors import CORS
from database import connect_to_db, get_db # Import your DB functions
from bson import ObjectId # Import ObjectId to handle MongoDB's IDs
import json # Required for the custom JSON Encoder
import os # Used for potentially getting PORT later

# Initialize the Flask application
app = Flask(__name__)

# --- Enable CORS ---
# Allows requests from your frontend (React/Vite default is often http://localhost:5173)
# For production, restrict the origins more specifically.
CORS(app, resources={r"/api/*": {"origins": ["http://localhost:5173", "http://127.0.0.1:5173"]}}) # Adjust origins as needed


# --- Custom JSON Encoder for Handling MongoDB ObjectId ---
class MongoJSONEncoder(json.JSONEncoder):
    def default(self, o):
        if isinstance(o, ObjectId):
            return str(o) # Convert ObjectId to its string representation
        return super().default(o)

# Apply the custom encoder to the Flask app
app.json_encoder = MongoJSONEncoder


# --- Connect to Database ONCE at Startup ---
# It's crucial to establish the connection when the app initializes
try:
    connect_to_db() # This function is defined in database.py
    print("Database connection established successfully for the Flask app.")
except Exception as e:
    print(f"FATAL: Could not connect to database on startup: {e}")
    # Exit if the database connection fails on startup
    import sys
    sys.exit(1)


# --------------------------------- API Endpoints (Routes) ----------------------------------

@app.route('/') # Basic route for testing server status
def home():
    return "Hello from the Python Backend! Database connection should be active."


# --- API endpoint to GET all quizzes ---
@app.route('/api/quizzes', methods=['GET'])
def get_all_quizzes():
    print("GET /api/quizzes request received") # Debugging statement
    try:
        db = get_db() # Get the database connection instance
        quizzes_collection = db.quizzes # Access the 'quizzes' collection

        # Find all documents in the collection. find() returns a cursor.
        # Convert the cursor to a list of dictionaries.
        all_quizzes = list(quizzes_collection.find({}))

        # jsonify will use the custom MongoJSONEncoder we set up
        return jsonify(all_quizzes)

    except Exception as e:
        print(f"Error fetching quizzes: {e}")
        # Return a generic error response
        return jsonify({"error": "Failed to fetch quizzes from database"}), 500


# --- API endpoint to POST (add) a new quiz ---
@app.route('/api/quizzes', methods=['POST'])
def add_quiz():
    print("POST /api/quizzes request received")
    try:
        db = get_db()
        quizzes_collection = db.quizzes
        data = request.get_json() # Get the JSON data from the request body

        # --- Basic Input Validation ---
        if not data:
            return jsonify({"error": "Request body must contain JSON data"}), 400
        if 'title' not in data or not data['title']: # Ensure title exists and is not empty
             return jsonify({"error": "Missing or empty 'title' in request body"}), 400

        # --- Data Preparation (Optional Defaults) ---
        # Ensure 'questions' field exists, even if empty, for consistency
        if 'questions' not in data:
            data['questions'] = []
        # You might want more validation here (e.g., check question structure)

        # --- Insert into Database ---
        # insert_one returns an InsertOneResult object containing the _id
        insert_result = quizzes_collection.insert_one(data)

        # --- Fetch and Return the Newly Created Document ---
        # Find the document we just inserted using its generated _id
        new_quiz = quizzes_collection.find_one({"_id": insert_result.inserted_id})

        if not new_quiz:
             # Should not happen if insert succeeded, but good to check
             return jsonify({"error": "Failed to retrieve newly added quiz"}), 500

        # Return the created quiz data with a 201 Created status code
        return jsonify(new_quiz), 201

    except Exception as e:
        print(f"Error adding quiz: {e}")
        return jsonify({"error": "Failed to add quiz to database"}), 500


# --- Run the App ---
if __name__ == '__main__':
    # Use debug=True for development ONLY (enables auto-reloading and detailed errors)
    # Set port explicitly (e.g., 5001 to avoid conflict with frontend dev server)
    port = int(os.environ.get('PORT', 5001)) # Use PORT from env if available, else 5001
    app.run(debug=True, host='0.0.0.0', port=port) # host='0.0.0.0' makes it accessible externally if needed