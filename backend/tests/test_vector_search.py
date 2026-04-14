"""
Essential tests for Video Recommendation Vector System
"""
import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

import pytest
from database import connect_to_db, find_similar_videos
from video_processor import generate_embeddings, extract_video_id

class TestVectorSystem:
    
    def setup_class(self):
        """Connect to database once before all tests"""
        connect_to_db()
    
    def test_embedding_generation(self):
        """Test that embeddings are generated correctly"""
        texts = [
            "What is the time complexity of binary search?",
            "Big O notation describes algorithm performance",
            "Object oriented programming uses classes and objects"
        ]
        
        embeddings = generate_embeddings(texts)
        
        assert len(embeddings) == 3
        assert len(embeddings[0]) == 384  # all-MiniLM-L6-v2 dimensions
        assert isinstance(embeddings[0], list)
        
        # Verify embeddings are different for different texts
        assert embeddings[0] != embeddings[1]
        assert embeddings[1] != embeddings[2]
    
    def test_video_id_extraction(self):
        """Test YouTube ID extraction from URLs and raw IDs"""
        
        # Test raw video ID
        assert extract_video_id("__vX2sjlpXU") == "__vX2sjlpXU"
        
        # Test standard youtube.com URL
        assert extract_video_id("https://www.youtube.com/watch?v=__vX2sjlpXU") == "__vX2sjlpXU"
        
        # Test youtu.be short URL
        assert extract_video_id("https://youtu.be/__vX2sjlpXU") == "__vX2sjlpXU"
        
        # Test URL with extra parameters
        assert extract_video_id("https://www.youtube.com/watch?v=__vX2sjlpXU&t=123s") == "__vX2sjlpXU"
        
        # Test invalid input
        assert extract_video_id("invalid") is None
    
    def test_vector_search_functional(self):
        """Test that MongoDB vector search returns results"""
        
        # Test query about Big O notation
        query_embedding = generate_embeddings(["What is Big O notation?"])[0]
        results = find_similar_videos(query_embedding, limit=3)
        
        # Should get results back
        assert len(results) > 0
        
        # Verify result structure
        first_result = results[0]
        assert 'video_id' in first_result
        assert 'video_title' in first_result
        assert 'text' in first_result
        assert 'start' in first_result
        assert 'score' in first_result
        
        # Verify score is between 0 and 1
        assert 0 <= first_result['score'] <= 1
    
    def test_vector_search_relevance(self):
        """Test that vector search returns relevant results"""
        
        # Search for SQL JOIN related content
        join_embedding = generate_embeddings(["How do SQL joins work?"])[0]
        join_results = find_similar_videos(join_embedding, limit=3)
        
        # Search for Git related content
        git_embedding = generate_embeddings(["What is git version control?"])[0]
        git_results = find_similar_videos(git_embedding, limit=3)
        
        # Results should be different for different topics
        join_titles = {r['video_title'] for r in join_results}
        git_titles = {r['video_title'] for r in git_results}
        
        # There should be minimal overlap between result sets
        overlap = join_titles.intersection(git_titles)
        assert len(overlap) <= 1
        
        # SQL results should contain join videos
        assert any('join' in title.lower() for title in join_titles)
        
        # Git results should contain git videos
        assert any('git' in title.lower() for title in git_titles)
    
    def test_database_connection(self):
        """Test database connection is working"""
        from database import get_video_count
        videos = get_video_count()
        
        # Should have all 11 imported videos
        assert len(videos) >= 11


if __name__ == "__main__":
    pytest.main([__file__, "-v"])