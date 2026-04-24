#!/usr/bin/env python3
"""
Step 2: Process cached transcripts and embed into database
This script only reads cached transcripts, generates embeddings and stores in database
No YouTube API calls are made by this script

✅ Uses LOCAL BGE-M3 embedding model (no API limits, no costs)
✅ 100% vector compatible with Hugging Face Cloud API
✅ Backend continues using API unchanged
"""
import sys
import os
import json
import time
import numpy as np
from typing import List, Dict, Optional

sys.path.append(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from backend.core.database import connect_to_db, add_video_embeddings, video_exists

# ✅ EXCLUSIVELY use local BGE-M3 embedding model - NO API CALLS EVER
from sentence_transformers import SentenceTransformer

EMBEDDING_MODEL = "BAAI/bge-m3"
print(f"✅ Loading local embedding model: {EMBEDDING_MODEL}")
model = SentenceTransformer(EMBEDDING_MODEL)
print("✅ Model loaded successfully, running completely offline")

def generate_embeddings(texts):
    """
    Generate embeddings locally using Sentence Transformers
    Exactly same vectors as Hugging Face API
    """
    if isinstance(texts, str):
        texts = [texts]
    
    cleaned = [t.strip() for t in texts if t and t.strip()]
    
    embeddings = model.encode(cleaned, normalize_embeddings=True)
    
    # Return as standard python lists for database compatibility
    return embeddings.tolist()


MAX_CHUNK_DURATION = 10  # Maximum seconds per chunk

def load_video_catalog() -> List[Dict]:
    """Load curated video list from JSON catalog"""
    catalog_path = os.path.join(os.path.dirname(__file__), "video_catalog.json")
    with open(catalog_path, 'r', encoding='utf-8') as f:
        return json.load(f)

def get_transcript_collection():
    """Get youtube_transcripts MongoDB collection"""
    from backend.core.database import get_db
    db = get_db()
    return db['youtube_transcripts']

def get_cached_transcript(video_id: str) -> Optional[Dict]:
    """Get transcript from database cache"""
    collection = get_transcript_collection()
    return collection.find_one({"video_id": video_id}, {'_id': False})

def chunk_transcript(transcript_segments: List[Dict]) -> List[Dict]:
    """
    ✅ New chunking algorithm:
    1. Chunk by accumulated duration, max 20 seconds per chunk
    2. Uses actual segment timings instead of word count
    3. Creates trigram context: every chunk includes previous + current + next
    4. No overlapping timings, continuous context window
    """
    # First pass: build base chunks grouped by 20 seconds maximum
    base_chunks = []
    current_chunk = []
    current_duration = 0
    
    for segment in transcript_segments:
        segment_duration = segment['duration']
        
        if current_duration + segment_duration > MAX_CHUNK_DURATION and current_chunk:
            base_chunks.append({
                "start": current_chunk[0]['start'],
                "end": current_chunk[-1]['start'] + current_chunk[-1]['duration'],
                "text": ' '.join([s['text'] for s in current_chunk]),
                "segments": current_chunk
            })
            current_chunk = []
            current_duration = 0
        
        current_chunk.append(segment)
        current_duration += segment_duration
    
    # Add final remaining chunk
    if current_chunk:
        base_chunks.append({
            "start": current_chunk[0]['start'],
            "end": current_chunk[-1]['start'] + current_chunk[-1]['duration'],
            "text": ' '.join([s['text'] for s in current_chunk]),
            "segments": current_chunk
        })
    
    # Second pass: build trigram chunks with surrounding context
    final_chunks = []
    for i, chunk in enumerate(base_chunks):
        # Collect context: previous (if exists) + current + next (if exists)
        context_parts = []
        
        if i > 0:
            context_parts.append(base_chunks[i-1]['text'])
        
        context_parts.append(chunk['text'])
        
        if i < len(base_chunks) - 1:
            context_parts.append(base_chunks[i+1]['text'])
        
        # Create final trigram enhanced chunk
        final_chunks.append({
            "start": chunk['start'],
            "end": chunk['end'],
            "text": ' '.join(context_parts)
        })
    
    return final_chunks

def process_single_video(video_info: Dict) -> bool:
    """Process single cached video into database"""
    video_id = video_info['video_id']
    title = video_info['title']
    
    print(f"\n🔍 Processing: {video_id} | {title}")
    
    # Skip if already in database
    if video_exists(video_id):
        print(f"⏭️  Already in database, skipping")
        return False
    
    # Get from database cache
    transcript_data = get_cached_transcript(video_id)
    if not transcript_data:
        print(f"⚠️  Not found in transcript cache, run fetch_transcripts.py first")
        return False
    
    print(f"📝 Got {len(transcript_data['transcript'])} segments from cache")
    
    # Chunk transcript
    chunks = chunk_transcript(transcript_data['transcript'])
    print(f"✂️  Split into {len(chunks)} chunks")
    
    # Generate embeddings
    texts = [chunk['text'] for chunk in chunks]
    embeddings = generate_embeddings(texts)
    
    # Prepare documents for database
    documents = []
    for chunk, embedding in zip(chunks, embeddings):
        documents.append({
            "video_id": video_id,
            "video_title": title,
            "topic": video_info.get('topic'),
            "channel": video_info.get('channel'),
            "text": chunk['text'],
            "start": chunk['start'],
            "end": chunk['end'],
            "embedding": embedding
        })
    
    # Store in database
    added = add_video_embeddings(video_id, title, documents)
    print(f"✅ Successfully imported: {added} chunks stored")
    
    return True

def main():
    print("=" * 70)
    print("STEP 2: PROCESS EMBEDDINGS INTO DATABASE")
    print("=" * 70)
    
    # Connect to database
    connect_to_db()
    
    videos = load_video_catalog()
    collection = get_transcript_collection()
    cached_count = collection.count_documents({})
    
    print(f"\n📋 Found {len(videos)} videos in catalog")
    print(f"💾 Transcript cache contains {cached_count} transcripts")
    
    success = 0
    skipped = 0
    failed = 0
    
    for idx, video in enumerate(videos, 1):
        print(f"\n[{idx}/{len(videos)}]", end=" ")
        
        if process_single_video(video):
            success += 1
        elif video_exists(video['video_id']):
            skipped += 1
        else:
            failed += 1
        
        # Small delay between videos
        if idx < len(videos):
            time.sleep(0.2)
    
    print("\n" + "=" * 70)
    print("PROCESSING COMPLETE")
    print(f"✅ Successfully imported: {success} new videos")
    print(f"⏭️  Already imported: {skipped} videos")
    print(f"❌ Failed: {failed} videos")
    print("=" * 70)

if __name__ == "__main__":
    main()