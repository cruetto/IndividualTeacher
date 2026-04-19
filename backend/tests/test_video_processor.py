"""
Video Processor and Embedding tests
"""
import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)) + '/../')

import pytest
from core.embeddings import generate_embeddings, RECOMMENDATION_THRESHOLD, MAX_RECOMMENDATIONS


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
        assert len(embeddings[0]) == 1024  # Correct dimensions
        assert isinstance(embeddings[0], list)
        assert all(isinstance(x, float) for x in embeddings[0])
        
        # Embeddings should be different for different texts
        assert embeddings[0] != embeddings[1]
        assert embeddings[1] != embeddings[2]



if __name__ == "__main__":
    pytest.main([__file__, "-v"])