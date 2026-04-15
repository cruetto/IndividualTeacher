"""
Tests for YouTube Crawler and automatic knowledge base system
"""
import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)) + '/../')

import pytest
from unittest.mock import Mock, patch
from database import video_exists
from scripts.crawl_youtube import search_videos


class TestCrawler:
    
    def test_video_exists_function(self):
        """Test database video existence check works"""
        # Test with non-existent video
        assert video_exists("this_video_does_not_exist_123") == False
    
    @patch('scripts.crawl_youtube.VideosSearch')
    def test_youtube_search_mocked(self, mock_videos_search):
        """Test YouTube search handling"""
        
        # Mock response
        mock_instance = Mock()
        mock_instance.result.return_value = {
            'result': [
                {
                    'id': 'test1234567',
                    'title': 'Test Video Title',
                    'channel': {'name': 'Test Channel'},
                    'viewCount': {'short': '100K views'},
                    'duration': '10:00'
                }
            ]
        }
        mock_videos_search.return_value = mock_instance
        
        videos = search_videos("test query", limit=1)
        
        assert len(videos) == 1
        assert videos[0]['video_id'] == 'test1234567'
        assert videos[0]['title'] == 'Test Video Title'
        mock_videos_search.assert_called_once_with("test query", limit=1)
    
    def test_crawler_config_values(self):
        """Verify crawler has safe limits configured"""
        from scripts.crawl_youtube import MAX_VIDEOS_PER_RUN, MAX_RESULTS_PER_TOPIC
        
        # Should be limited to safe values for testing
        assert MAX_VIDEOS_PER_RUN == 5
        assert MAX_RESULTS_PER_TOPIC == 15
        assert MAX_VIDEOS_PER_RUN < 100


if __name__ == "__main__":
    pytest.main([__file__, "-v"])