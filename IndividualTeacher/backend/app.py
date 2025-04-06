from flask import Flask, jsonify, request # Import necessary modules
from flask_cors import CORS
import json

# Initialize the Flask application
app = Flask(__name__)

# Enable CORS for all routes, allowing requests from your React app's origin
# Be more specific in production (e.g., CORS(app, resources={r"/api/*": {"origins": "YOUR_FRONTEND_URL"}}))
CORS(app)



quiz = None
with open('database.json') as f:
    try:
        # Load JSON data from the file
        quiz = json.load(f)
        print(quiz)
    except:
        # Handle JSON decoding error
        print(f"Error decoding JSON")

    

# --------------------------------- API Endpoints (Routes) ----------------------------------
@app.route('/') # Basic route for testing
def home():
    return "Hello from the Python Backend!"



# Example API endpoint to get all quizzes
@app.route('/api/quizzes', methods=['GET'])
def get_quizzes():
    print("GET /api/quizzes request received") # Add print statements for debugging
    return jsonify(quiz)



# Example API endpoint to add a new quiz (using POST)
# @app.route('/api/quizzes', methods=['POST'])
# def add_quiz():
#     global next_quiz_id # Use global variable (simplistic, better with classes/DB later)
#     print("POST /api/quizzes request received")
#     if not request.json or not 'title' in request.json:
#         return jsonify({"error": "Missing 'title' in request body"}), 400 # Bad request

#     new_quiz = {
#         "id": next_quiz_id,
#         "title": request.json['title'],
#         "question_count": request.json.get('question_count', 0) # Optional field
#     }
#     quizzes.append(new_quiz)
#     next_quiz_id += 1
#     print(f"Added quiz: {new_quiz}")
#     return jsonify(new_quiz), 201 # 201 = Created



# --- Run the App ---
if __name__ == '__main__':
    # Use debug=True for development (auto-reloads on code changes)
    # Default port is 5000
    app.run(debug=True, port=5001) # Use a different port like 5001 if 5000 is common