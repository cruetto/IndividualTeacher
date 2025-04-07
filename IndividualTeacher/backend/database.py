# backend/database.py

import os
from pymongo.mongo_client import MongoClient
from pymongo.server_api import ServerApi
from dotenv import load_dotenv

# --- Configuration ---
load_dotenv()  # Load variables from .env file into environment

# Get the connection string from environment variables
MONGODB_URI = os.environ.get("MONGODB_URI")
DB_NAME = "myWebsiteDb" # Choose a name for your database (e.g., quiz_app, my_data)

# --- Check Configuration ---
if not MONGODB_URI:
    raise ValueError("MONGODB_URI environment variable not set. Please check your .env file.")

# --- Global variable to hold the database connection ---
# We initialize it once and reuse it
_db = None

# --- Connection Function ---
def connect_to_db():
    """
    Connects to MongoDB using the URI from environment variables
    and sets the global _db variable.
    Uses the Stable API for compatibility.
    """
    global _db
    if _db is not None:
        print("Database connection already established.")
        return _db

    print("Connecting to MongoDB Atlas...")
    try:
        # Create a new client and connect to the server
        client = MongoClient(MONGODB_URI, server_api=ServerApi('1'))

        # Send a ping to confirm a successful connection
        client.admin.command('ping')
        print("Pinged your deployment. You successfully connected to MongoDB!")

        # Get the database instance
        _db = client[DB_NAME] # Use the specified database name
        print(f"Connected to database: '{DB_NAME}'")
        return _db

    except Exception as e:
        print(f"ERROR: Could not connect to MongoDB Atlas: {e}")
        # Depending on your app, you might want to exit or handle this differently
        raise # Re-raise the exception to halt execution if connection fails

# --- Accessor Function ---
def get_db():
    """
    Returns the database instance. Connects if not already connected.
    """
    if _db is None:
        # Attempt to connect if called before explicit connection
        # Note: It's generally better to call connect_to_db() explicitly at app startup
        print("Database not connected. Attempting connection...")
        connect_to_db()

    if _db is None:
        # If connection still failed after attempt
        raise ConnectionError("Failed to establish database connection.")

    return _db

# --- Optional: Close connection function (useful for scripts, less for web servers) ---
# def close_db_connection():
#     global _db
#     if _db is not None:
#         # MongoClient doesn't have an explicit close method in modern pymongo
#         # The client manages connection pools. Typically, you let the application exit.
#         # If using specific clients/sessions, they might have close methods.
#         print("MongoDB client does not require explicit closing typically.")
#         _db = None # Reset the global variable if desired