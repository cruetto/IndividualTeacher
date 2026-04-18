"""
Video Processor and Embedding tests
"""
import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)) + '/../')

import pytest
from core.embeddings import generate_embeddings, filter_recommendations, RECOMMENDATION_THRESHOLD, MAX_RECOMMENDATIONS


class TestVideoProcessor:
    
    def test_embedding_generation(self):
        """Test embedding generation works correctly"""
        texts = [
            "Binary search runs in O(log n) time",
            "SQL JOIN combines rows from multiple tables",
            "Git is a distributed version control system"
        ]
        
        embeddings = generate_embeddings(texts)
        
        assert len(embeddings) == 3
        assert len(embeddings[0]) == 384  # Correct dimensions
        assert isinstance(embeddings[0], list)
        assert all(isinstance(x, float) for x in embeddings[0])
        
        # Embeddings should be different for different texts
        assert embeddings[0] != embeddings[1]
        assert embeddings[1] != embeddings[2]

    def test_filter_recommendations(self):
        """Test recommendation filtering logic"""
        
        # Test empty input
        assert filter_recommendations(None) == []
        assert filter_recommendations([]) == []
        
        # Create test results with varying similarity
        test_results = [
            {'similarity': 0.95, 'video_id': '1'},
            {'similarity': 0.85, 'video_id': '2'},
            {'similarity': 0.80, 'video_id': '3'},
            {'similarity': 0.75, 'video_id': '4'},
            {'similarity': 0.60, 'video_id': '5'},
        ]
        
        filtered = filter_recommendations(test_results)
        
        # Should filter out everything below threshold
        assert len(filtered) == 3
        assert all(r['similarity'] >= RECOMMENDATION_THRESHOLD for r in filtered)
        
        # Should be sorted descending
        assert filtered[0]['similarity'] == 0.95
        assert filtered[1]['similarity'] == 0.85
        assert filtered[2]['similarity'] == 0.80
        
        # Test maximum limit
        many_results = []
        for i in range(10):
            many_results.append({'similarity': 0.9 + i*0.005, 'video_id': str(i)})
        
        limited = filter_recommendations(many_results)
        assert len(limited) == MAX_RECOMMENDATIONS


if __name__ == "__main__":
    pytest.main([__file__, "-v"])