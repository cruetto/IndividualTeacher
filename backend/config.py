import os
import json
import datetime
import sys
from flask_cors import CORS
from flask_login import LoginManager, UserMixin
from bson import ObjectId
from dotenv import load_dotenv

from core.database import connect_to_db, get_db

load_dotenv()

IS_PRODUCTION = os.environ.get('ENVIRONMENT') == 'production'
GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID")
FRONTEND_ORIGIN = os.environ.get("FRONTEND_ORIGIN", "http://localhost:5173")


class MongoJSONEncoder(json.JSONEncoder):
    def default(self, o):
        if isinstance(o, ObjectId):
            return str(o)
        if isinstance(o, datetime.datetime):
            return o.isoformat(timespec='milliseconds') + 'Z'
        return super().default(o)


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


login_manager = LoginManager()


@login_manager.user_loader
def load_user(user_id_str):
    if not ObjectId.is_valid(user_id_str):
        return None
    try:
        user_data = get_db().users.find_one({'_id': ObjectId(user_id_str)})
        return User(user_data) if user_data else None
    except Exception as e:
        print(f"Error in user_loader for ID {user_id_str}: {e}")
        return None


@login_manager.unauthorized_handler
def unauthorized():
    print("Unauthorized access attempt detected.")
    from flask import jsonify
    return jsonify(error="Authentication required."), 401


def get_current_user_db_id():
    from flask_login import current_user
    if current_user and current_user.is_authenticated:
        return current_user.get_db_id()
    return None


def init_app(app):
    app.secret_key = os.environ.get('FLASK_SECRET_KEY')
    
    if IS_PRODUCTION:
        print("--- RUNNING IN PRODUCTION MODE ---")
        app.config['SESSION_COOKIE_SAMESITE'] = 'None'
        app.config['SESSION_COOKIE_SECURE'] = True
    else:
        print("--- RUNNING IN DEVELOPMENT MODE ---")
        app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'
        app.config['SESSION_COOKIE_SECURE'] = False
    
    app.config['SESSION_COOKIE_HTTPONLY'] = True
    
    print(f"--- FLASK BACKEND: Initializing CORS for Origin: {FRONTEND_ORIGIN} ---")
    CORS(
        app,
        origins=[FRONTEND_ORIGIN],
        supports_credentials=True,
        methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allow_headers=["Content-Type", "Authorization", "X-Requested-With", "Accept", "Origin"]
    )
    
    app.json_encoder = MongoJSONEncoder
    
    try:
        connect_to_db()
        print("Database connection established successfully.")
    except Exception as e:
        print(f"FATAL: Could not connect to database on startup: {e}")
        sys.exit(1)
    
    login_manager.init_app(app)
    
    if not GOOGLE_CLIENT_ID:
        print("FATAL: GOOGLE_CLIENT_ID environment variable not set.")