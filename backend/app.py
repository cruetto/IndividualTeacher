import os
import threading
import time
from flask import Flask
from config import init_app, IS_PRODUCTION

from api.auth import auth_routes
from api.quizzes import quiz_routes
from api.chat import chat_routes
from api.recommendations import recommendation_routes


clustering_started = False
clustering_lock = threading.Lock()


def trigger_clustering_lazy():
    global clustering_started
    
    with clustering_lock:
        if clustering_started:
            return
        clustering_started = True
    
    def run_clustering_background():
        try:
            from core.embeddings import run_full_clustering
            run_full_clustering()
        except Exception as e:
            print(f"Clustering failed: {e}")
    
    thread = threading.Thread(target=run_clustering_background, daemon=True)
    thread.start()


app = Flask(__name__)
init_app(app)

app.register_blueprint(auth_routes)
app.register_blueprint(quiz_routes)
app.register_blueprint(chat_routes)
app.register_blueprint(recommendation_routes)


@app.route('/', methods=['GET', 'HEAD'])
def health_check():
    trigger_clustering_lazy()
    return "OK", 200


@app.before_request
def before_request_handler():
    trigger_clustering_lazy()


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5001))
    debug_mode = not IS_PRODUCTION
    app.run(debug=debug_mode, host='0.0.0.0', port=port, use_reloader=False)