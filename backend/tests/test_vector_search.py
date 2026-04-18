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
    
    
    
    def test_database_connection(self):
        """Test database connection is working"""
        from core.database import get_video_count
        videos = get_video_count()
        
        # Should have all 11 imported videos
        assert len(videos) >= 11


if __name__ == "__main__":
    pytest.main([__file__, "-v"])