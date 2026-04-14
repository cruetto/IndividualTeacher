from pymongo import MongoClient
from pymongo.errors import ConnectionFailure
import os
from dotenv import load_dotenv

load_dotenv()

client = None
db = None
video_chunks = None

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
        
        # Create vector search index if not exists
        try:
            video_chunks.create_index([("embedding", "cosmosSearch")], 
                                      name="video_embedding_index",
                                      cosmosSearchOptions={
                                          "kind": "vector-ivf",
                                          "numLists": 100,
                                          "similarity": "COS",
                                          "dimensions": 384
                                      })
        except:
            # Index already exists
            pass
            
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

def find_similar_videos(embedding, limit=5):
    """Find similar video chunks using vector search"""
    if video_chunks is None:
        connect_to_db()
    
    results = video_chunks.aggregate([
        {
            "$vectorSearch": {
                "queryVector": embedding,
                "path": "embedding",
                "numCandidates": limit * 10,
                "limit": limit,
                "index": "video_embedding_index"
            }
        },
        {
            "$project": {
                "embedding": 0,
                "score": {"$meta": "vectorSearchScore"}
            }
        }
    ])
    
    return list(results)

def get_video_count():
    if video_chunks is None:
        connect_to_db()
    return video_chunks.distinct("video_id")