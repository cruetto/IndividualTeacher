import threading
from sentence_transformers import SentenceTransformer

_model = None
_model_lock = threading.Lock()

cached_clusters = None
cached_cluster_names = None
clusters_dirty = True

RECOMMENDATION_THRESHOLD = 0.8
MAX_RECOMMENDATIONS = 3


def load_model_background():
    def loader():
        get_model()
        run_full_clustering()
    
    thread = threading.Thread(target=loader, daemon=True)
    thread.start()


def get_model():
    global _model
    
    if _model is None:
        with _model_lock:
            if _model is None:
                _model = SentenceTransformer('all-MiniLM-L6-v2')
    
    return _model


def generate_embeddings(texts):
    model = get_model()
    
    if isinstance(texts, str):
        texts = [texts]
    
    cleaned = [t.strip() for t in texts if t and t.strip()]
    
    return model.encode(cleaned, show_progress_bar=False).tolist()


def filter_recommendations(results):
    if not results:
        return []
    
    filtered = [r for r in results if r.get('similarity', 0) >= RECOMMENDATION_THRESHOLD]
    filtered.sort(key=lambda x: x['similarity'], reverse=True)
    
    return filtered[:MAX_RECOMMENDATIONS]


clusters = None
cluster_names = None


def run_full_clustering():
    global clusters, cluster_names

    try:
        from core.database import get_db
        db = get_db()

        quizzes = list(db.quizzes.find({"userId": {"$ne": None}}))
        titles = [q['title'] for q in quizzes]

        if not titles:
            return

        clusters = cluster_quiz_titles(titles)

        from core.llm import get_llm_client
        groq = get_llm_client()
        cluster_names = {}

        if groq:
            cluster_titles = {}
            for idx, cluster_id in enumerate(clusters):
                cluster_titles.setdefault(cluster_id, []).append(titles[idx])

            for cluster_id, titles_in_cluster in cluster_titles.items():
                try:
                    prompt = f"Give a VERY SHORT category name for these quiz titles. ONLY RETURN 1 TO 3 WORDS MAXIMUM. ABSOLUTELY NO EXTRA TEXT, NO DASHES, NO PUNCTUATION, JUST THE NAME:\n"
                    prompt += "\n".join([f"- {t}" for t in titles_in_cluster])
                    response = groq.invoke(prompt)
                    if response.content:
                        name = response.content.strip().strip('"\'').title()
                        name_words = name.split()
                        if len(name_words) > 3:
                            name = ' '.join(name_words[:3])
                        cluster_names[cluster_id] = name
                except:
                    pass

    except Exception:
        pass


def cluster_quiz_titles(quiz_titles):
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
    
    if len(wcss) >= 3:
        deltas = np.diff(wcss)
        relative_improvement = deltas / wcss[:-1]
        
        candidates = np.where(relative_improvement < 0.15)[0]
        
        if len(candidates) > 0:
            optimal_k = candidates[0] + 2
        else:
            second_deltas = np.diff(deltas)
            optimal_k = np.argmax(second_deltas) + 2
        
        min_clusters = max(2, int(len(quiz_titles) / 8))
        max_clusters = min(max_k, int(len(quiz_titles) / 3))
        
        optimal_k = max(optimal_k, min_clusters)
        optimal_k = min(optimal_k, max_clusters)
    else:
        optimal_k = len(wcss)
    
    final_kmeans = KMeans(n_clusters=optimal_k, n_init=10, random_state=42)
    clusters = final_kmeans.fit_predict(X)
    
    return clusters.tolist()