import os
import threading
from flask import Flask
from config import init_app, IS_PRODUCTION

from api.auth import auth_routes
from api.quizzes import quiz_routes
from api.chat import chat_routes
from api.recommendations import recommendation_routes

# Initialize clustering in background when server starts
def initialize_clustering_background():
    """Run full clustering in a separate background thread after server starts"""
    try:
        print("\nStarting background clustering initialization...")
        from core.embeddings import run_full_clustering
        run_full_clustering()
        print("Clustering initialization completed successfully")
    except Exception as e:
        print(f"Clustering initialization failed: {e}")

app = Flask(__name__)
init_app(app)

# Register all blueprints
app.register_blueprint(auth_routes)
app.register_blueprint(quiz_routes)
app.register_blueprint(chat_routes)
app.register_blueprint(recommendation_routes)

# Root health check route for Render deployment
@app.route('/', methods=['GET', 'HEAD'])
def health_check():
    return "OK", 200

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5001))
    print(f"--- Starting Flask server on http://0.0.0.0:{port} ---")
 
    # Start clustering in background thread BEFORE starting server
    clustering_thread = threading.Thread(target=initialize_clustering_background, daemon=True)
    clustering_thread.start()
 
    debug_mode = not IS_PRODUCTION
    app.run(debug=debug_mode, host='0.0.0.0', port=port, use_reloader=False)
