"""
Vector Embedding and Video Processing Service
"""
from sentence_transformers import SentenceTransformer
from youtube_transcript_api import YouTubeTranscriptApi
from youtube_transcript_api._errors import TranscriptsDisabled, NoTranscriptFound
import re

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
        transcript = YouTubeTranscriptApi.get_transcript(video_id, languages=['en'])
        return transcript
    except (TranscriptsDisabled, NoTranscriptFound):
        print(f"❌ No transcript available for video {video_id}")
        return None
    except Exception as e:
        print(f"❌ Failed to fetch transcript for {video_id}:")
        print(e)
        return None

def chunk_transcript(transcript, chunk_size=45):
    """Split transcript into timed chunks"""
    if not transcript:
        return []
    
    chunks = []
    current_chunk = []
    current_start = None
    
    for segment in transcript:
        if current_start is None:
            current_start = segment['start']
        
        current_chunk.append(segment['text'])
        end_time = segment['start'] + segment.get('duration', 0)
        
        if end_time - current_start >= chunk_size:
            chunks.append({
                'text': ' '.join(current_chunk).strip(),
                'start': current_start,
                'end': end_time
            })
            current_chunk = []
            current_start = None
    
    if current_chunk and current_start is not None:
        chunks.append({
            'text': ' '.join(current_chunk).strip(),
            'start': current_start,
            'end': end_time
        })
    
    return chunks

def process_video(video_id, video_title=None):
    """Process full video: fetch transcript, chunk, generate embeddings"""
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

def extract_video_id(url_or_id):
    """Extract video ID from YouTube URL or return as-is if already ID"""
    if len(url_or_id) == 11 and re.match(r'^[a-zA-Z0-9_-]+$', url_or_id):
        return url_or_id
    
    # Match youtube.com/watch?v=ID pattern
    match = re.search(r'(?:v=|\/)([a-zA-Z0-9_-]{11})', url_or_id)
    if match:
        return match.group(1)
    
    return None