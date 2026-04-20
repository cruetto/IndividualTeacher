import os
import threading
from flask import Flask
from config import init_app, IS_PRODUCTION

from api.auth import auth_routes
from api.quizzes import quiz_routes
from api.chat import chat_routes
from api.recommendations import recommendation_routes

import atexit
import time

clustering_started = False
clustering_lock = threading.Lock()

def trigger_clustering_lazy():
    """Trigger clustering lazily after server has fully started and accepted first request"""
    global clustering_started
    
    with clustering_lock:
        if clustering_started:
            return
        clustering_started = True
    
    def run_clustering_background():
        time.sleep(5)  # Wait 5 seconds to let server fully initialize, port bind, Gunicorn accept worker
        try:
            print("\n[LAZY CLUSTER] Starting background clustering initialization after server is ready...")
            from core.embeddings import run_full_clustering
            run_full_clustering()
            print("[LAZY CLUSTER] ✅ Clustering initialization completed successfully")
        except Exception as e:
            print(f"[LAZY CLUSTER] ❌ Clustering initialization failed: {e}")
    
    thread = threading.Thread(target=run_clustering_background, daemon=True)
    thread.start()


# Trigger

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
    trigger_clustering_lazy()
    return "OK", 200


@app.before_request
def before_request_handler():
    # Trigger clustering on first ever request received
    trigger_clustering_lazy()

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5001))
    print(f"--- Starting Flask server on http://0.0.0.0:{port} ---")

    debug_mode = not IS_PRODUCTION
    app.run(debug=debug_mode, host='0.0.0.0', port=port, use_reloader=False)
