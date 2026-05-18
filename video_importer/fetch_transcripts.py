#!/usr/bin/env python3
"""
Step 1: Fetch and cache YouTube transcripts
This script downloads transcripts into MongoDB, but does not generate embeddings
Run this first to collect all transcripts before processing embeddings
"""
import sys
import os
import json
import time
import random
from typing import List, Dict, Optional
from youtube_transcript_api import YouTubeTranscriptApi
from youtube_transcript_api._errors import (
    IpBlocked,
    NoTranscriptFound,
    RequestBlocked,
    TranscriptsDisabled,
    VideoUnavailable,
)

MIN_FETCH_DELAY_SECONDS = int(os.getenv("TRANSCRIPT_MIN_DELAY_SECONDS", "40"))
MAX_FETCH_DELAY_SECONDS = int(os.getenv("TRANSCRIPT_MAX_DELAY_SECONDS", "100"))


class YouTubeIpBlocked(Exception):
    """Raised when YouTube blocks the current IP."""

def load_video_catalog() -> List[Dict]:
    """Load curated video list from JSON catalog"""
    catalog_path = os.path.join(os.path.dirname(__file__), "video_catalog.json")
    with open(catalog_path, 'r', encoding='utf-8') as f:
        return json.load(f)

sys.path.append(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from backend.core.database import get_db

def get_transcript_collection():
    """Get youtube_transcripts MongoDB collection"""
    db = get_db()
    collection = db['youtube_transcripts']
    
    # Create index if not exists
    collection.create_index("video_id", unique=True)
    
    return collection

def transcript_exists(collection, video_id: str) -> bool:
    """Check if transcript already exists in database"""
    return collection.count_documents({"video_id": video_id}) > 0

def save_transcript(collection, transcript_data: Dict) -> None:
    """Save transcript to database"""
    collection.replace_one(
        {"video_id": transcript_data['video_id']},
        transcript_data,
        upsert=True
    )

def fetch_single_transcript(video_id: str) -> Optional[Dict]:
    """Fetch transcript for single video"""
    try:
        ytt_api = YouTubeTranscriptApi()
        transcript = ytt_api.fetch(video_id, languages=['en'])
        
        return {
            "video_id": video_id,
            "language": transcript.language_code,
            "transcript": transcript.to_raw_data()
        }
            
    except (TranscriptsDisabled, VideoUnavailable, NoTranscriptFound) as e:
        print(f"❌ {type(e).__name__}")
        return None
    except (IpBlocked, RequestBlocked) as e:
        raise YouTubeIpBlocked(type(e).__name__) from e
    except Exception as e:
        print(f"❌ Failed: {type(e).__name__}: {str(e)[:100]}")
        return None

def wait_before_next_request() -> None:
    delay = random.randint(MIN_FETCH_DELAY_SECONDS, MAX_FETCH_DELAY_SECONDS)
    print(f"⏳ Waiting {delay}s before next YouTube request")
    time.sleep(delay)

def main():
    print("=" * 70)
    print("STEP 1: FETCH YOUTUBE TRANSCRIPTS")
    print("=" * 70)
    
    videos = load_video_catalog()
    
    collection = get_transcript_collection()
    cached_count = collection.count_documents({})
    
    print(f"\n📋 Found {len(videos)} videos in catalog")
    print(f"💾 Database already has {cached_count} saved transcripts")
    print(f"⏱️  YouTube delay: {MIN_FETCH_DELAY_SECONDS}-{MAX_FETCH_DELAY_SECONDS}s")
    
    success = 0
    skipped = 0
    failed = 0
    
    for idx, video in enumerate(videos, 1):
        video_id = video['video_id']
        title = video['title']
        
        print(f"\n[{idx}/{len(videos)}] {video_id}")
        print(f"📺 {title}")
        
        if transcript_exists(collection, video_id):
            print(f"✅ Already in database, skipping")
            skipped += 1
            continue
        
        print(f"🔍 Fetching transcript...")
        try:
            transcript_data = fetch_single_transcript(video_id)
        except YouTubeIpBlocked as e:
            print(f"🛑 YouTube blocked this IP ({e}). Stop now, change IP or wait, then rerun.")
            failed += 1
            break
        
        if transcript_data:
            save_transcript(collection, transcript_data)
            print(f"💾 Saved to database ({len(transcript_data['transcript'])} segments)")
            success += 1
        else:
            failed += 1
        
        if idx < len(videos):
            wait_before_next_request()
    
    total_count = collection.count_documents({})
    
    print("\n" + "=" * 70)
    print("FETCH COMPLETE")
    print(f"✅ New transcripts downloaded: {success}")
    print(f"⏭️  Already in database: {skipped}")
    print(f"❌ Failed: {failed}")
    print(f"💾 Total in database: {total_count}")
    print("=" * 70)
    print("\nNow run process_embeddings.py to embed into vector search")

if __name__ == "__main__":
    main()
