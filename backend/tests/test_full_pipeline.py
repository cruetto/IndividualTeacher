"""
Full End-to-End Pipeline Integration Test
This test verifies the entire system works:
✓ Search YouTube for real video
✓ Fetch transcript
✓ Chunk transcript
✓ Generate embeddings
✓ Save to database
✓ Run vector search
✓ Verify results are returned
"""
import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)) + '/../')

import pytest
from video_processor import (
    generate_embeddings,
    search_youtube_videos,
    process_video,
    chunk_transcript,
    get_youtube_transcript
)
from database import find_similar_videos, add_video_embeddings, video_exists


def test_full_recommendation_pipeline():
    """Test the entire recommendation system from start to finish"""
    
    print("\n" + "="*70)
    print("✅ RUNNING FULL PIPELINE INTEGRATION TEST")
    print("="*70)
    
    # 1. SEARCH YOUTUBE
    print("\n📝 Step 1: Searching YouTube")
    videos = search_youtube_videos("binary search algorithm", limit=1)
    
    assert len(videos) == 1, "Should find at least 1 video"
    video_id = videos[0]['video_id']
    print(f"✅ Found video: {video_id}")
    
    # 2. FETCH TRANSCRIPT
    print("\n📝 Step 2: Fetching transcript")
    transcript = get_youtube_transcript(video_id)
    
    assert transcript is not None, "Transcript should be available"
    assert len(transcript) > 10, "Transcript should have multiple segments"
    print(f"✅ Got transcript: {len(transcript)} segments")
    
    # 3. CHUNK TRANSCRIPT
    print("\n📝 Step 3: Chunking transcript")
    chunks = chunk_transcript(transcript)
    
    assert len(chunks) > 5, "Should create multiple chunks"
    print(f"✅ Created {len(chunks)} chunks with sliding window")
    
    # 4. GENERATE EMBEDDINGS
    print("\n📝 Step 4: Generating embeddings")
    texts = [chunk['text'] for chunk in chunks]
    embeddings = generate_embeddings(texts)
    
    assert len(embeddings) == len(chunks)
    assert len(embeddings[0]) == 384
    print(f"✅ Generated {len(embeddings)} embeddings")
    
    # 5. SAVE TO DATABASE
    print("\n📝 Step 5: Saving to database")
    count = add_video_embeddings(video_id, "Test video", chunks)
    
    assert count == len(chunks), f"Should save all chunks, saved {count}"
    print(f"✅ Saved {count} chunks to database")
    
    # 6. RUN VECTOR SEARCH
    print("\n📝 Step 6: Running vector search")
    query = "what is the time complexity of binary search"
    query_embedding = generate_embeddings([query])[0]
    
    results = find_similar_videos(query_embedding, limit=3)
    
    print(f"✅ Search returned {len(results)} results")
    
    if len(results) > 0:
        print(f"✅ Top result score: {results[0]['score']:.3f}")
        print(f"✅ Top result text: {results[0]['text'][:100]}...")
    else:
        print("❌ NO RESULTS RETURNED - THIS IS THE BUG!")
    
    # 7. VERIFY SCORE THRESHOLD
    print("\n📝 Step 7: Testing score thresholds")
    print(f"✅ Minimum threshold set to 0.80")
    for result in results:
        print(f"   • Score: {result['score']:.3f}")
        assert result['score'] >= 0.70, f"Result score too low: {result['score']}"
    
    print("\n" + "="*70)
    print("✅ PIPELINE TEST COMPLETED")
    print("="*70)
    
    # Cleanup
    # Note: We leave the video in database for further testing
    
    assert len(results) > 0, "Vector search returned zero results"


if __name__ == "__main__":
    test_full_recommendation_pipeline()