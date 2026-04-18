#!/usr/bin/env python3
"""
Import embeddings from jamescalam/youtube-transcriptions dataset
ONLY this dataset is used. No legacy code.
Each entry has proper start / end time ranges.
"""
import sys
import os
import json
import gzip
import requests
from typing import List, Dict, Optional, Iterator

sys.path.append(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from database import connect_to_db, add_video_embeddings, video_exists
from video_processor import generate_embeddings


def check_video_exists(video_id: str) -> bool:
    """Fast video availability check"""
    try:
        return requests.head(
            f"https://www.youtube.com/oembed?url=http://www.youtube.com/watch?v={video_id}",
            timeout=3,
            allow_redirects=False
        ).status_code == 200
    except Exception:
        return False


def stream_dataset(dataset_dir: str) -> Iterator[Dict]:
    """Stream segments directly from dataset JSONL files"""
    print(f"Looking for files in: {dataset_dir}")
    print(f"Files found: {os.listdir(dataset_dir)}")

    for filename in sorted(os.listdir(dataset_dir)):
        print(f"Checking file: {filename}")
        if not filename.endswith('.jsonl'):
            continue

        filepath = os.path.join(dataset_dir, filename)
        print(f"\n✅ Processing file: {filename}")

        with open(filepath, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue

                entry = json.loads(line)
                yield entry


def main():
    dataset_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "youtube-transcriptions")

    print("=" * 70)
    print("YOUTUBE TRANSCRIPTIONS IMPORTER")
    print("=" * 70)

    db = connect_to_db()
    video_chunks = db['video_chunks']
    
    # Get distinct video ids directly - no external function dependencies
    existing_videos = video_chunks.distinct("video_id")
    print(f"📊 Currently in database: {len(existing_videos)} videos")
    if existing_videos:
        print(f"✅ Already imported: {', '.join(existing_videos)}")
    print("-" * 70)

    success = 0
    skipped = 0
    total_segments = 0

    current_video = None
    current_segments = []

    for entry in stream_dataset(dataset_dir):
        video_id = entry['video_id']

        # When switching video, process previous one
        if current_video and video_id != current_video:
            # Check if already in database first
            if video_exists(current_video):
                video_title = entry.get('title', current_video)
                print(f"⏭️  {current_video} | {video_title}: already imported")
                current_segments = []
                current_video = video_id
                current_segments.append(entry)
                continue
                
            if check_video_exists(current_video):
                texts = [seg['text'] for seg in current_segments]
                embeddings = generate_embeddings(texts)

                documents = []
                for seg, emb in zip(current_segments, embeddings):
                    documents.append({
                        'video_id': current_video,
                        'video_title': entry.get('title', f"Video {current_video}"),
                        'text': seg['text'],
                        'start': seg['start'],
                        'end': seg['end'],
                        'embedding': emb
                    })

                added = add_video_embeddings(current_video, documents[0]['video_title'], documents)
                print(f"✅ {current_video} | {documents[0]['video_title']}: added {added} segments")
                total_segments += added
                success += 1
            else:
                print(f"⚠️  {current_video} | {entry.get('title', current_video)}: video unavailable")
                skipped += 1

            current_segments = []

        current_video = video_id
        current_segments.append(entry)

    # Process last video
    if current_video and current_segments:
        if not video_exists(current_video) and check_video_exists(current_video):
            texts = [seg['text'] for seg in current_segments]
            embeddings = generate_embeddings(texts)

            documents = []
            for seg, emb in zip(current_segments, embeddings):
                documents.append({
                    'video_id': current_video,
                    'video_title': entry.get('title', f"Video {current_video}"),
                    'text': seg['text'],
                    'start': seg['start'],
                    'end': seg['end'],
                    'embedding': emb
                })

            add_video_embeddings(current_video, documents[0]['video_title'], documents)
            success += 1

    print("\n" + "=" * 70)
    print("IMPORT COMPLETE")
    print(f"Success: {success} videos")
    print(f"Skipped: {skipped} unavailable videos")
    print(f"Total segments: {total_segments}")
    print("=" * 70)


if __name__ == "__main__":
    main()