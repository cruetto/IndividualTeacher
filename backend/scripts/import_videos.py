"""
Unified Video Import Script
Add any number of YouTube videos by ID or URL
"""
import sys
import os
sys.path.append(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))

from video_processor import process_video, extract_video_id
from database import connect_to_db, add_video_embeddings

# Add your videos here (just video IDs or URLs, NO TITLES REQUIRED!)
# Titles are automatically fetched directly from YouTube
VIDEO_LIST = [
    # Test video - Binary Search
    "T98PIp4omUA",
    
    # Add more videos here anytime:
    # "mtvbVLK5xDQ",
    # "Mo4vesaut8g",
    # "__vX2sjlpXU",
    # "PFmuCDHHpwk",
    # "pTB0EiLXUC8",
    # "G3lJAxg1cy8",
    # "0OQJDd3QqQM",
    # "HVsySz-h9r4",
    # "RGOj5yH7evk",
    # "https://www.youtube.com/watch?v=abc123xyz",
]

def main():
    print("=" * 70)
    print("YOUTUBE VIDEO IMPORT FOR MONGODB VECTOR SEARCH")
    print("=" * 70)
    
    connect_to_db()
    print(f"\nFound {len(VIDEO_LIST)} videos to process\n")
    
    success = 0
    total_chunks = 0
    
    for idx, video_input in enumerate(VIDEO_LIST, 1):
        video_id = extract_video_id(video_input)
        
        if not video_id:
            print(f"❌ [{idx}] Invalid video ID or URL: {video_input}")
            continue
        
        print(f"[{idx}/{len(VIDEO_LIST)}] Processing video: {video_id}")
        
        chunks = process_video(video_id)
        
        if chunks:
            added = add_video_embeddings(video_id, chunks[0]['video_title'], chunks)
            print(f"   ✅ Added {added} vector chunks to database\n")
            success += 1
            total_chunks += added
        else:
            print(f"   ⚠️  Skipped video\n")
    
    print("=" * 70)
    print("IMPORT COMPLETED")
    print(f"Successfully imported: {success}/{len(VIDEO_LIST)} videos")
    print(f"Total vector chunks added: {total_chunks}")
    print("=" * 70)

if __name__ == "__main__":
    main()