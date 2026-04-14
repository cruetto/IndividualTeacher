"""
Video Processor and Embedding tests
"""
import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)) + '/../')

import pytest
from video_processor import generate_embeddings, extract_video_id, chunk_transcript


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
    
    def test_video_id_extraction(self):
        """Test YouTube ID extraction from all URL formats"""
        
        test_cases = [
            ("__vX2sjlpXU", "__vX2sjlpXU"),
            ("https://www.youtube.com/watch?v=__vX2sjlpXU", "__vX2sjlpXU"),
            ("https://youtube.com/watch?v=__vX2sjlpXU", "__vX2sjlpXU"),
            ("https://youtu.be/__vX2sjlpXU", "__vX2sjlpXU"),
            ("https://www.youtube.com/watch?v=__vX2sjlpXU&t=123s", "__vX2sjlpXU"),
            ("https://m.youtube.com/watch?v=__vX2sjlpXU", "__vX2sjlpXU"),
            ("invalid", None),
            ("https://google.com", None),
            ("", None)
        ]
        
        for input_value, expected in test_cases:
            assert extract_video_id(input_value) == expected
    
    def test_transcript_chunking(self):
        """Test transcript is split into proper timed chunks"""
        
        sample_transcript = [
            {'start': 0.0, 'duration': 10.0, 'text': 'First part'},
            {'start': 10.0, 'duration': 10.0, 'text': 'Second part'},
            {'start': 20.0, 'duration': 10.0, 'text': 'Third part'},
            {'start': 30.0, 'duration': 10.0, 'text': 'Fourth part'},
            {'start': 40.0, 'duration': 10.0, 'text': 'Fifth part'},
            {'start': 50.0, 'duration': 10.0, 'text': 'Sixth part'},
        ]
        
        chunks = chunk_transcript(sample_transcript, chunk_size=45)
        
        assert len(chunks) == 2
        
        # First chunk should be 0-50 seconds
        assert chunks[0]['start'] == 0.0
        assert chunks[0]['end'] >= 45
        
        # Second chunk should be remainder
        assert chunks[1]['start'] == 50.0
        
        # All text should be preserved
        full_text = ' '.join([c['text'] for c in chunks])
        assert 'First part' in full_text
        assert 'Sixth part' in full_text
    
    def test_transcript_chunking_edge_cases(self):
        """Test chunking edge cases"""
        
        # Empty transcript
        assert chunk_transcript([]) == []
        
        # Single segment
        single = [{'start': 0.0, 'duration': 5.0, 'text': 'Test'}]
        chunks = chunk_transcript(single)
        assert len(chunks) == 1
        assert chunks[0]['start'] == 0.0


if __name__ == "__main__":
    pytest.main([__file__, "-v"])