import traceback
from flask import Blueprint, jsonify, request
from flask_login import login_required

from config import get_current_user_db_id
from core.embeddings import generate_embeddings, cluster_quiz_titles
from core.database import find_similar_videos, video_exists, add_video_embeddings, get_video_count
from core.llm import get_llm_client

RECOMMENDATION_THRESHOLD = 0.8
MAX_RECOMMENDATIONS = 3


recommendation_routes = Blueprint('recommendations', __name__)


@recommendation_routes.route('/api/recommendations', methods=['POST'])
def get_recommendations():
    """
    Smart video recommendation system
    - First tries local database
    - If not enough good results: automatically searches YouTube
    - Imports new videos on demand
    - Returns best matches
    """
    try:
        data = request.get_json()
        if not data or 'incorrect_questions' not in data:
            return jsonify({"error": "Missing 'incorrect_questions' array"}), 400
        
        incorrect_questions = data['incorrect_questions']
        all_recommendations = {}
        
        
        question_texts = []
        for q in incorrect_questions:
            embed_text = f"{q.get('question_text', '')}"
            if q.get('correct_answer'):
                embed_text += f"\nCorrect Answer: {q.get('correct_answer', '')}"
            if q.get('user_answer'):
                embed_text += f"\nUser answered incorrectly: {q.get('user_answer', '')}"
            question_texts.append(embed_text)
        
        embeddings = generate_embeddings(question_texts)
        
        for idx, question in enumerate(incorrect_questions):
            question_id = question.get('id')
            
            
            recommendations = find_similar_videos(embeddings[idx], limit=MAX_RECOMMENDATIONS, min_score=RECOMMENDATION_THRESHOLD)
            
            
            formatted_recommendations = []
            for rec in recommendations:
                formatted_recommendations.append({
                    'video_id': rec['video_id'],
                    'video_title': rec['video_title'],
                    'text': rec['text'],
                    'start_time': rec['start'],
                    'end_time': rec['end'],
                    'youtube_url': f"https://www.youtube.com/watch?v={rec['video_id']}&t={int(rec['start'])}",
                    'relevance_score': round(rec['score'], 4)
                })
            
            all_recommendations[question_id] = {
                'question_text': question.get('question_text', ''),
                'recommendations': formatted_recommendations
            }
            
        
        return jsonify(all_recommendations)
    
    except Exception as e:
        print(f"Error getting recommendations: {e}")
        traceback.print_exc()
        return jsonify({"error": "Failed to get recommendations"}), 500


@recommendation_routes.route('/api/recommendations/library/add', methods=['POST'])
@login_required
def add_video_to_library():
    """Admin endpoint to add new YouTube video to recommendation library"""
    try:
        data = request.get_json()
        if not data or 'video_url' not in data or 'title' not in data:
            return jsonify({"error": "Missing 'video_url' or 'title'"}), 400
        
        from core.embeddings import add_youtube_video
        from core.embeddings import extract_youtube_video_id
        
        video_id = extract_youtube_video_id(data['video_url'])
        if not video_id:
            return jsonify({"error": "Invalid YouTube URL"}), 400
        
        chunks_added = add_youtube_video(video_id, data['title'])
        
        return jsonify({
            "message": f"Added {chunks_added} chunks for video",
            "chunks_added": chunks_added,
            "video_id": video_id
        })
    
    except Exception as e:
        print(f"Error adding video: {e}")
        traceback.print_exc()
        return jsonify({"error": "Failed to add video"}), 500


@recommendation_routes.route('/api/recommendations/library/stats', methods=['GET'])
def get_library_stats():
    """Get statistics about video recommendation library"""
    try:
        stats = get_video_count()
        return jsonify(stats)
    except Exception as e:
        return jsonify({"error": "Failed to get library stats"}), 500


# Global cluster cache per user
_cluster_cache = {}  # user_id -> { clusters: [], names: {}, hash: str }

def get_list_hash(items: list) -> str:
    """Generate stable hash for list comparison"""
    import hashlib
    return hashlib.sha256('\n'.join(items).encode()).hexdigest()


@recommendation_routes.route('/api/cluster-quizzes/clusterize', methods=['POST'])
def cluster_quizzes_full():
    """
    FULL CLUSTERIZATION ENDPOINT
    Heavy operation: Generate embeddings, run KMeans, generate LLM names
    Run this ONLY when quiz list actually changes
    """
    try:
        data = request.get_json()
        titles = data.get('titles', [])
        
        user_id = get_current_user_db_id() or "guest"
        
        print(f"[CLUSTER FULL] Request received for user: {user_id}")
        print(f"[CLUSTER FULL] Received {len(titles)} quiz titles to cluster")
        
        if len(titles) < 2:
            print(f"[CLUSTER FULL] Not enough quizzes to cluster")
            result = {
                "clusters": [0] * len(titles),
                "count": 1,
                "names": {0: "Quizzes"},
                "hash": get_list_hash(titles)
            }
            _cluster_cache[user_id] = result
            return jsonify(result)
        
        from core.embeddings import cluster_quiz_titles
        from core.llm import get_llm_client
        
        # Generate fresh clusters just for this exact list
        clusters = cluster_quiz_titles(titles)
        
        print(f"[CLUSTER FULL] Generated clusters: {clusters}")
        
        cluster_count = len(set(clusters))
        cluster_names = {}
        
        # Generate names for these specific clusters
        llm_client = get_llm_client()
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
                    print(f"[CLUSTER FULL] Error naming cluster {cluster_id}: {e}")
        
        print(f"[CLUSTER FULL] cluster names: {cluster_names}")
        
        result = {
            "status": "ready",
            "clusters": clusters,
            "count": cluster_count,
            "names": cluster_names,
            "hash": get_list_hash(titles)
        }
        
        # Cache this result permanently for this user
        _cluster_cache[user_id] = result
        
        return jsonify(result)
    
    except Exception as e:
        print(f"Error getting clusters: {e}")
        traceback.print_exc()
        return jsonify({"error": "Failed to get clusters"}), 500


@recommendation_routes.route('/api/cluster-quizzes/extract', methods=['POST'])
def cluster_quizzes_extract():
    """
    EXTRACT ONLY ENDPOINT
    INSTANT OPERATION: Return already cached clusters from memory
    Run this when user toggles cluster switch
    Returns status=missing if no cache exists - client should call /clusterize then
    """
    try:
        data = request.get_json()
        titles = data.get('titles', [])
        
        user_id = get_current_user_db_id() or "guest"
        
        current_hash = get_list_hash(titles)
        
        if user_id in _cluster_cache and _cluster_cache[user_id]['hash'] == current_hash:
            print(f"[CLUSTER EXTRACT] Returning cached result for user {user_id}")
            return jsonify(_cluster_cache[user_id])
        else:
            return jsonify({"status": "missing"})
            
    except Exception as e:
        print(f"Error extracting clusters: {e}")
        traceback.print_exc()
        return jsonify({"error": "Failed to get clusters"}), 500
