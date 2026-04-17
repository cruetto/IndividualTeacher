"""
Vector Embedding Service - CLEAN VERSION
NO YOUTUBE CODE, NO EXTERNAL API CALLS
Only pure vector operations used by main runtime application
"""
from sentence_transformers import SentenceTransformer

# Load embedding model once
_model = None

# Configuration
RECOMMENDATION_THRESHOLD = 0.8  # 80% similarity minimum
MAX_RECOMMENDATIONS = 3         # Maximum 3 video segments

def get_embedding_model():
    global _model
    if _model is None:
        print("Loading embedding model (all-MiniLM-L6-v2)...")
        _model = SentenceTransformer('all-MiniLM-L6-v2')
        print("Model loaded successfully")
    return _model

def generate_embeddings(texts):
    """Generate embeddings for list of texts"""
    model = get_embedding_model()
    return model.encode(texts, show_progress_bar=False).tolist()

def filter_recommendations(results):
    """
    Filter recommendation results:
    - Minimum 0.8 similarity threshold
    - Maximum 3 results
    - Sort by similarity
    """
    if not results:
        return []
    
    # Filter by threshold
    filtered = [r for r in results if r.get('similarity', 0) >= RECOMMENDATION_THRESHOLD]
    
    # Sort by highest similarity first
    filtered.sort(key=lambda x: x['similarity'], reverse=True)
    
    # Limit to maximum recommendations
    filtered = filtered[:MAX_RECOMMENDATIONS]
    
    return filtered