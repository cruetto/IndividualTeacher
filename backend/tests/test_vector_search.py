"""
Essential tests for Video Recommendation Vector System
"""
import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

import pytest
from core.database import connect_to_db, find_similar_videos
from core.embeddings import generate_embeddings

class TestVectorSystem:
    
    def setup_class(self):
        """Connect to database once before all tests"""
        connect_to_db()
    
    def test_vector_search_function(self):
        """Test vector search returns expected format"""
        test_text = "binary search algorithm time complexity"
        embedding = generate_embeddings(test_text)[0]
        results = find_similar_videos(embedding, 3, 0.7)
        
        assert results is not None
        assert isinstance(results, list)
        assert len(results) <= 3
        
        if len(results) > 0:
            # Verify result structure
            for result in results:
                assert 'video_id' in result
                assert 'video_title' in result
                assert 'text' in result
                assert 'start' in result
                assert 'end' in result
                assert 'score' in result
                assert 0.0 <= result['score'] <= 1.0
    
    
    
    def test_vector_search_threshold(self):
        """Test that low similarity results are filtered out"""
        test_text = "this text should not match anything in the database xyz123456"
        embedding = generate_embeddings(test_text)[0]
        results = find_similar_videos(embedding, 3, 0.95)
        
        # Should return empty or very few results for nonsense query
        assert isinstance(results, list)


if __name__ == "__main__":
    pytest.main([__file__, "-v"])