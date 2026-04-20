import os
import requests
from dotenv import load_dotenv
import numpy as np
from huggingface_hub import InferenceClient

# Load environment variables
load_dotenv()

HF_API_TOKEN = os.environ.get("HF_TOKEN")
EMBEDDING_MODEL = "BAAI/bge-m3"
EMBEDDING_DIMENSION = 1024

# Initialize official Hugging Face Inference Client once
client = InferenceClient(model=EMBEDDING_MODEL, token=HF_API_TOKEN)

cached_clusters = None
cached_cluster_names = None
clusters_dirty = True
quiz_count_when_clustered = 0




def generate_embeddings(texts):
    """
    Generate embeddings using OFFICIAL Hugging Face InferenceClient
    Correct supported API method as per documentation
    """
    if isinstance(texts, str):
        texts = [texts]
    
    cleaned = [t.strip() for t in texts if t and t.strip()]
    
    # BATCH ALL TEXTS IN ONE SINGLE API CALL - 100x FASTER
    embeddings = client.feature_extraction(cleaned)
    
    # Normalize vectors to unit length (required for BGE-M3)
    normalized = []
    for emb in embeddings:
        norm = np.linalg.norm(emb)
        normalized.append((np.array(emb) / norm).tolist())
    
    return normalized


clusters = None
cluster_names = None


def run_full_clustering():
    global clusters, cluster_names, quiz_count_when_clustered

    try:
        print(f"Starting clustering...")
        from core.database import get_db
        db = get_db()

        quizzes = list(db.quizzes.find({"userId": {"$ne": None}}))
        titles = [q['title'] for q in quizzes]

        if not titles:
            return 0
            
        # Only run clustering if number of quizzes changed
        if quiz_count_when_clustered == len(titles) and clusters is not None:
            return len(set(clusters))

        clusters = cluster_quiz_titles(titles)
        cluster_count = len(set(clusters))

        from core.llm import get_llm_client
        llm_client = get_llm_client()
        cluster_names = {}

        if llm_client:
            cluster_titles = {}
            for idx, cluster_id in enumerate(clusters):
                cluster_titles.setdefault(cluster_id, []).append(titles[idx])

            for cluster_id, titles_in_cluster in cluster_titles.items():
                try:
                    prompt = f"Give a VERY SHORT category name for these quiz titles. ONLY RETURN 1 TO 3 WORDS MAXIMUM. ABSOLUTELY NO EXTRA TEXT, NO DASHES, NO PUNCTUATION, JUST THE NAME:\n"
                    prompt += "\n".join([f"- {t}" for t in titles_in_cluster])
                    response = llm_client.invoke(prompt)
                    if response.content:
                        name = response.content.strip().strip('"\'').title()
                        name_words = name.split()
                        if len(name_words) > 3:
                            name = ' '.join(name_words[:3])
                        cluster_names[cluster_id] = name
                except Exception as e:
                    pass
        
        # Remember how many quizzes we clustered
        quiz_count_when_clustered = len(titles)
        print(f"Clustering completed, {cluster_count} clusters created")
        
        return cluster_count

    except Exception as e:
        print(f"Clustering FAILED: {str(e)}")
        import traceback
        traceback.print_exc()


def cluster_quiz_titles(quiz_titles):
    if len(quiz_titles) <= 1:
        return [0] * len(quiz_titles)
    
    # Step 1: Generate semantic embeddings using BGE-M3
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
        
        candidates = np.where(relative_improvement < 0.25)[0]
        
        if len(candidates) > 0:
            optimal_k = candidates[0] + 2
        else:
            second_deltas = np.diff(deltas)
            optimal_k = np.argmax(second_deltas) + 2
        
        min_clusters = max(2, int(len(quiz_titles) / 6))
        max_clusters = min(max_k, int(len(quiz_titles) / 2.5))
        
        optimal_k = max(optimal_k, min_clusters)
        optimal_k = min(optimal_k, max_clusters)
    else:
        optimal_k = len(wcss)
    
    final_kmeans = KMeans(n_clusters=optimal_k, n_init=10, random_state=42)
    clusters = final_kmeans.fit_predict(X)
    
    return clusters.tolist()