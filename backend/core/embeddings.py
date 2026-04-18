"""
Vector Embedding Service - CLEAN VERSION
NO YOUTUBE CODE, NO EXTERNAL API CALLS
Only pure vector operations used by main runtime application
"""
import threading
from sentence_transformers import SentenceTransformer

# Load embedding model once
model = None
model_loading = False
model_ready = False

# Cluster caching
cached_clusters = None
cached_cluster_names = None
clusters_dirty = True

# Configuration
RECOMMENDATION_THRESHOLD = 0.8  # 80% similarity minimum
MAX_RECOMMENDATIONS = 3         # Maximum 3 video segments


def load_model_background():
    """Load embedding model in separate background thread during server initialization"""
    global model, model_loading, model_ready
    
    if model_loading or model_ready:
        return
    
    model_loading = True
    
    def background_loader():
        global model, model_ready, model_loading
        try:
            print("\n=== Background loading embedding model ===")
            print("This will happen in parallel while server is running")
            print("Server will respond to requests immediately while model loads")
            model = SentenceTransformer('all-MiniLM-L6-v2')
            model_ready = True
            print("Embedding model loaded successfully in background")
            print("Clustering and recommendation features now active")
            
            # Run automatic clustering in background
            cluster_thread = threading.Thread(target=run_full_clustering, daemon=True)
            cluster_thread.start()
        except Exception as e:
            print(f"Failed to load embedding model: {e}")
        finally:
            model_loading = False
    
    thread = threading.Thread(target=background_loader, daemon=True)
    thread.start()
    print("Started background model loading thread")


def generate_embeddings(texts):
    """Generate embeddings for list of texts"""
    global model
    if model is None:
        print("Loading embedding model (all-MiniLM-L6-v2)...")
        model = SentenceTransformer('all-MiniLM-L6-v2')
        print("Model loaded successfully")
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


# Global cluster cache
clusters = None
cluster_names = None


def run_full_clustering():
    """Run full clustering and naming automatically after server starts"""
    global clusters, cluster_names

    try:
        from core.database import get_db
        db = get_db()

        # Fetch all user quizzes
        quizzes = list(db.quizzes.find({"userId": {"$ne": None}}))
        titles = [q['title'] for q in quizzes]

        if not titles:
            return

        print(f"Running automatic clustering on {len(titles)} user quizzes")

        clusters = cluster_quiz_titles(titles)

        # Generate names with GROQ
        from core.llm import get_llm_client
        groq = get_llm_client()
        cluster_names = {}

        if groq:
            # Group titles by cluster
            cluster_titles = {}
            for idx, cluster_id in enumerate(clusters):
                if cluster_id not in cluster_titles:
                    cluster_titles[cluster_id] = []
                cluster_titles[cluster_id].append(titles[idx])

            for cluster_id, titles_in_cluster in cluster_titles.items():
                try:
                    prompt = f"Give a VERY SHORT category name for these quiz titles. ONLY RETURN 1 TO 3 WORDS MAXIMUM. ABSOLUTELY NO EXTRA TEXT, NO DASHES, NO PUNCTUATION, JUST THE NAME:\n"
                    prompt += "\n".join([f"- {t}" for t in titles_in_cluster])
                    response = groq.invoke(prompt)
                    if response.content:
                        name = response.content.strip().strip('"\'').title()
                        # Force maximum 3 words - split and take first 3 only
                        name_words = name.split()
                        if len(name_words) > 3:
                            name = ' '.join(name_words[:3])
                        cluster_names[cluster_id] = name
                except:
                    pass

        print("Automatic clustering completed successfully. Clusters ready.")

    except Exception as e:
        print(f"Automatic clustering failed: {e}")


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