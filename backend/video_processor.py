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


def cluster_quiz_titles(quiz_titles):
    """
    Cluster quiz titles using semantic embeddings and K-Means
    Automatically detects optimal number of clusters using Elbow Method
    Returns list of cluster assignments matching input order
    """
    if len(quiz_titles) <= 1:
        return [0] * len(quiz_titles)
    
    # Step 1: Generate semantic embeddings using existing model
    embeddings = generate_embeddings(quiz_titles)
    
    # Step 2: Find optimal number of clusters with Elbow Method
    from sklearn.cluster import KMeans
    import numpy as np
    
    X = np.array(embeddings)
    
    # Calculate WCSS for k from 1 to min(10, n-1)
    max_k = min(10, len(quiz_titles) - 1)
    wcss = []
    
    for k in range(1, max_k + 1):
        kmeans = KMeans(n_clusters=k, n_init=10, random_state=42)
        kmeans.fit(X)
        wcss.append(kmeans.inertia_)
    
    # Find elbow point (max difference in slope)
    if len(wcss) >= 3:
        # Calculate second derivative
        deltas = np.diff(wcss)
        second_deltas = np.diff(deltas)
        elbow_k = np.argmax(second_deltas) + 2
        
        # Target 4 quizzes per cluster - balanced sweet spot
        target_cluster_size = 4
        preferred_k = max(2, min(max_k, int(len(quiz_titles) / target_cluster_size)))
        
        # Use value between elbow and preferred count
        optimal_k = round((elbow_k + preferred_k) / 2)
        optimal_k = max(optimal_k, 2)
        optimal_k = min(optimal_k, max_k)
    else:
        optimal_k = len(wcss)
    
    # Step 3: Run final K-Means with optimal k
    final_kmeans = KMeans(n_clusters=optimal_k, n_init=10, random_state=42)
    clusters = final_kmeans.fit_predict(X)
    
    return clusters.tolist()
