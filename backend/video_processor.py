"""
Vector Embedding and Video Processing Service
"""
from sentence_transformers import SentenceTransformer
from youtube_transcript_api import YouTubeTranscriptApi
from youtube_transcript_api._errors import TranscriptsDisabled, NoTranscriptFound
import re
import requests

# Load embedding model once
_model = None

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
    """Fetch transcript from YouTube video"""
    try:
        # ✅ MAY 2026 OFFICIAL WORKING FIX
        # YouTube broke old API endpoints. Must use new instance .fetch() method from v1.0+
        ytt_api = YouTubeTranscriptApi()
        fetched_transcript = ytt_api.fetch(video_id, languages=['en'])
        
        # Convert new API format to standard dict format
        transcript = []
        for snippet in fetched_transcript.snippets:
            transcript.append({
                'text': snippet.text,
                'start': snippet.start,
                'duration': snippet.duration
            })
            
        return transcript
    except (TranscriptsDisabled, NoTranscriptFound):
        print(f"❌ No transcript available for video {video_id}")
        return None
    except Exception as e:
        print(f"❌ Failed to fetch transcript for {video_id}:")
        print(e)
        return None

def chunk_transcript(transcript, window_size=30, overlap=10):
    """
    Sliding window chunking with overlap
    Default: 30 second windows, 10 second overlap
    This means chunks advance by 20 seconds each step
    Every transcript position appears in ~2 chunks
    """
    if not transcript:
        return []
    
    chunks = []
    
    # First build full timeline with cumulative text
    timeline = []
    current_text = []
    
    for segment in transcript:
        current_text.append(segment['text'])
        timeline.append({
            'time': segment['start'],
            'end_time': segment['start'] + segment.get('duration', 0),
            'text': segment['text']
        })
    
    if not timeline:
        return []
    
    end_of_video = timeline[-1]['end_time']
    
    # Sliding window implementation
    window_start = 0.0
    step = window_size - overlap
    
    while window_start < end_of_video:
        window_end = window_start + window_size
        
        # Collect all segments that intersect with this window
        window_text = []
        actual_start = None
        
        for entry in timeline:
            # Check if segment overlaps with current window
            if entry['end_time'] > window_start and entry['time'] < window_end:
                window_text.append(entry['text'])
                if actual_start is None:
                    actual_start = entry['time']
        
        if window_text:
            chunks.append({
                'text': ' '.join(window_text).strip(),
                'start': window_start,
                'end': window_end
            })
        
        window_start += step
    
    return chunks

def process_video(video_id, video_title=None):
    """Process full video: fetch transcript, chunk, generate embeddings"""
    # Automatically fetch video title if not provided
    if video_title is None:
        print(f"   📡 Fetching video title from YouTube...")
        fetched_title = get_youtube_video_title(video_id)
        if fetched_title:
            video_title = fetched_title
            print(f"   ✅ Title: {video_title}")
        else:
            video_title = f"Video {video_id}"
            print(f"   ⚠️  Using default title")

    transcript = get_youtube_transcript(video_id)
    if not transcript:
        return None
    
    chunks = chunk_transcript(transcript)
    if not chunks:
        return None
    
    # Generate embeddings for all chunks
    texts = [chunk['text'] for chunk in chunks]
    embeddings = generate_embeddings(texts)
    
    # Prepare final documents
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

def get_youtube_video_title(video_id):
    """Fetch video title from YouTube using public oEmbed API (no API key required)"""
    try:
        url = f"https://www.youtube.com/oembed?url=http://www.youtube.com/watch?v={video_id}&format=json"
        response = requests.get(url, timeout=10)
        if response.status_code == 200:
            data = response.json()
            return data.get('title')
        return None
    except Exception as e:
        print(f"⚠️  Could not fetch title for {video_id}: {e}")
        return None


def search_youtube_videos(query: str, limit: int = 3):
    """Search YouTube for videos matching query"""
    try:
        from youtubesearchpython import VideosSearch
        search = VideosSearch(query, limit=limit)
        results = search.result()
        
        videos = []
        for video in results['result']:
            videos.append({
                'video_id': video['id'],
                'title': video['title'],
                'channel': video['channel']['name']
            })
        
        return videos
        
    except Exception as e:
        print(f"⚠️  YouTube search failed: {e}")
        return []


def extract_video_id(url_or_id):
    """Extract video ID from YouTube URL or return as-is if already ID"""
    if len(url_or_id) == 11 and re.match(r'^[a-zA-Z0-9_-]+$', url_or_id):
        return url_or_id
    
    # Match youtube.com/watch?v=ID pattern
    match = re.search(r'(?:v=|\/)([a-zA-Z0-9_-]{11})', url_or_id)
    if match:
        return match.group(1)
    
    return None
