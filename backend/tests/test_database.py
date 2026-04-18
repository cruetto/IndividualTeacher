"""
Database connection and core operations tests
"""
import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)) + '/../')

import pytest
from core.database.database import connect_to_db, add_video_embeddings, get_video_count


class TestDatabase:
    
    def test_database_connection(self):
        """Test that we can connect to MongoDB successfully"""
        db = connect_to_db()
        assert db is not None
        assert db.name == 'Quizzes'
    
    
    def test_add_video_embeddings_cleanup(self):
        """Test that existing videos are properly deleted before re-import"""
        
        test_chunks = [{
            'video_id': 'TEST_VIDEO_ID',
            'video_title': 'Test Video',
            'text': 'This is test video content',
            'start': 0.0,
            'end': 10.0,
            'embedding': [0.1] * 384
        }]
        
        # Insert test video
        count = add_video_embeddings('TEST_VIDEO_ID', 'Test Video', test_chunks)
        assert count == 1
        
        # Insert again (should delete first, then insert)
        count = add_video_embeddings('TEST_VIDEO_ID', 'Test Video', test_chunks)
        assert count == 1
        
        # Cleanup test data
        from core.database.database import video_chunks
        video_chunks.delete_many({'video_id': 'TEST_VIDEO_ID'})


if __name__ == "__main__":
    pytest.main([__file__, "-v"])