"""
Vector Embedding and Video Processing Service
Clean version - No automatic YouTube scraping
"""
from sentence_transformers import SentenceTransformer
import re
import requests
import time
import os

# Load embedding model once
_model = None

# Configuration
RECOMMENDATION_THRESHOLD = 0.8  # 80% similarity minimum
MAX_RECOMMENDATIONS = 3         # Maximum 3 video segments
FETCH_DELAY_SECONDS = 15        # Delay between manual transcript fetches

def get_embedding_model():
    global _model
    if _model is None:
        print("Loading embedding model (all-MiniLM-L6-v2)...")
        _model = SentenceTransformer('all-MiniLM-L6-v2')
        print("✅ Model loaded")
    return _model

def generate_embeddings(texts):
    """Generate embeddings for list of texts"""
    model = get_embedding_model()
    return model.encode(texts, show_progress_bar=False).tolist()

def get_youtube_transcript(video_id):
    """
    Manually fetch transcript for single video ID
    Includes 15 second delay between calls to avoid rate limits
    """
    try:
        import yt_dlp
        
        print(f"📡 Fetching transcript for: {video_id}")
        print(f"⏳ Waiting {FETCH_DELAY_SECONDS} seconds...")
        time.sleep(FETCH_DELAY_SECONDS)
        
        ydl_opts = {
            'quiet': True,
            'no_warnings': True,
            'skip_download': True,
            'writesubtitles': True,
            'writeautomaticsub': True,
            'subtitleslangs': ['en'],
            'subtitlesformat': 'json3',
        }

        # Use cookies if available
        cookie_path = os.path.join(os.path.dirname(__file__), 'cookies.txt')
        if os.path.exists(cookie_path):
            ydl_opts['cookiefile'] = cookie_path

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(f"https://www.youtube.com/watch?v={video_id}", download=False)
            
            if not info or 'subtitles' not in info:
                return None
            
            if 'en' not in info['subtitles']:
                if 'en-automatic' in info['subtitles']:
                    lang = 'en-automatic'
                else:
                    return None
            else:
                lang = 'en'
            
            subtitle_url = info['subtitles'][lang][0]['url']
            subtitles = ydl.urlopen(subtitle_url).read().decode('utf-8')
            
            import json
            data = json.loads(subtitles)
            
            transcript = []
            for event in data.get('events', []):
                if 'segs' in event:
                    text = ' '.join([seg['utf8'] for seg in event['segs'] if 'utf8' in seg]).strip()
                    if text:
                        transcript.append({
                            'text': text,
                            'start': event['tStartMs'] / 1000,
                            'duration': event['dDurationMs'] / 1000
                        })
            
            print(f"✅ Transcript fetched: {len(transcript)} segments")
            return transcript
            
    except Exception as e:
        print(f"❌ Failed: {e}")
        return None

def chunk_transcript(transcript, window_size=30, overlap=10):
    """
    Sliding window chunking with overlap
    Default: 30 second windows, 10 second overlap
    """
    if not transcript:
        return []
    
    chunks = []
    timeline = []
    
    for segment in transcript:
        timeline.append({
            'time': segment['start'],
            'end_time': segment['start'] + segment.get('duration', 0),
            'text': segment['text']
        })
    
    if not timeline:
        return []
    
    end_of_video = timeline[-1]['end_time']
    window_start = 0.0
    step = window_size - overlap
    
    while window_start < end_of_video:
        window_end = window_start + window_size
        
        window_text = []
        for entry in timeline:
            if entry['end_time'] > window_start and entry['time'] < window_end:
                window_text.append(entry['text'])
        
        if window_text:
            chunks.append({
                'text': ' '.join(window_text).strip(),
                'start': window_start,
                'end': window_end
            })
        
        window_start += step
    
    return chunks

def process_video(video_id, video_title=None):
    """Process single video manually: fetch transcript, chunk, generate embeddings"""
    transcript = get_youtube_transcript(video_id)
    if not transcript:
        return None
    
    chunks = chunk_transcript(transcript)
    if not chunks:
        return None
    
    texts = [chunk['text'] for chunk in chunks]
    embeddings = generate_embeddings(texts)
    
    documents = []
    for chunk, embedding in zip(chunks, embeddings):
        documents.append({
            'video_id': video_id,
            'video_title': video_title or f"Video {video_id}",
            'text': chunk['text'],
            'start': chunk['start'],
            'end': chunk['end'],
            'embedding': embedding
        })
    
    return documents

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

def extract_video_id(url_or_id):
    """Extract video ID from YouTube URL or return as-is if already ID"""
    if len(url_or_id) == 11 and re.match(r'^[a-zA-Z0-9_-]+$', url_or_id):
        return url_or_id
    
    match = re.search(r'(?:v=|\/)([a-zA-Z0-9_-]{11})', url_or_id)
    if match:
        return match.group(1)
    
    return None