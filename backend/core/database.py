from pymongo import MongoClient
from pymongo.errors import ConnectionFailure, PyMongoError
from pymongo.operations import SearchIndexModel
import os
from dotenv import load_dotenv

load_dotenv()

client = None
db = None
video_chunks = None

VIDEO_EMBEDDING_INDEX = "video_embedding_index"
EMBEDDING_DIMENSIONS = 1024


def ensure_video_embedding_index():
    """Create the MongoDB Vector Search index if the deployment supports it."""
    try:
        for index in video_chunks.list_search_indexes():
            if index.get("name") == VIDEO_EMBEDDING_INDEX:
                return

        search_index = SearchIndexModel(
            name=VIDEO_EMBEDDING_INDEX,
            type="vectorSearch",
            definition={
                "fields": [
                    {
                        "type": "vector",
                        "path": "embedding",
                        "numDimensions": EMBEDDING_DIMENSIONS,
                        "similarity": "cosine",
                    }
                ]
            },
        )
        video_chunks.create_search_index(search_index)
        print(f"Created vector search index: {VIDEO_EMBEDDING_INDEX}")
    except PyMongoError as e:
        print(f"Could not ensure vector search index '{VIDEO_EMBEDDING_INDEX}': {e}")

def connect_to_db():
    global client, db, video_chunks
    try:
        MONGO_URI = os.getenv('MONGODB_URI')
        if not MONGO_URI:
            raise ValueError("MONGODB_URI not found in environment variables")
            
        client = MongoClient(MONGO_URI)
        client.admin.command('ping')
        print("Pinged your deployment. You successfully connected to MongoDB!")
        
        db = client['Quizzes']
        video_chunks = db['video_chunks']
        ensure_video_embedding_index()
            
        print("Connected to database: 'Quizzes'")
        return db
    except ConnectionFailure:
        print("MongoDB connection failed")
        raise
    except Exception as e:
        print(f"Database connection error: {e}")
        raise

def add_video_embeddings(video_id, video_title, chunks):
    """Store video chunks with embeddings into MongoDB"""
    if video_chunks is None:
        connect_to_db()
    
    # Delete existing chunks for this video first
    video_chunks.delete_many({"video_id": video_id})
    
    # Insert new chunks
    result = video_chunks.insert_many(chunks)
    
    return len(result.inserted_ids)

def find_similar_videos(embedding, limit, min_score):
    """
    Find similar video chunks using vector search
    min_score: 0.0 = NO FILTER, return all matches
    Set min_score=0 to always return maximum possible results
    """
    if video_chunks is None:
        connect_to_db()
    
    results = video_chunks.aggregate([
        {
            "$vectorSearch": {
                "queryVector": embedding,
                "path": "embedding",
                "numCandidates": limit * 10,
                "limit": limit,
                "index": VIDEO_EMBEDDING_INDEX
            }
        },
        {
            "$project": {
                "embedding": 0,
                "score": {"$meta": "vectorSearchScore"}
            }
        }
    ])
    
    # Filter out low quality matches
    good_results = []
    for result in results:
        if result['score'] >= min_score:
            good_results.append(result)
    
    return good_results

def get_video_count():
    if video_chunks is None:
        connect_to_db()
    return video_chunks.distinct("video_id")

def video_exists(video_id):
    """Check if video is already in database"""
    if video_chunks is None:
        connect_to_db()
    return video_chunks.count_documents({"video_id": video_id}) > 0


def get_db():
    global db
    if db is None:
        connect_to_db()
    return db
