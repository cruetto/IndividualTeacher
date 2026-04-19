"""
Tests for external API connections: Groq LLM, HuggingFace Embeddings
"""
import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)) + '/../')

import pytest
from core.llm import get_llm_client, create_quiz_prompt, parse_ai_quiz_response
from core.embeddings import generate_embeddings


class TestExternalAPIs:
    
    def setup_class(self):
        """Load environment variables"""
        from dotenv import load_dotenv
        load_dotenv()
    
    def test_huggingface_embedding_connection(self):
        """Test that we can connect to HuggingFace embedding API"""
        test_text = "connection test"
        embedding = generate_embeddings([test_text])
        assert embedding is not None
        assert len(embedding) == 1
    
    def test_huggingface_embedding_dimensions(self):
        """Test embeddings are generated correctly with 1024 dimensions"""
        test_text = "This is a test sentence for embedding generation"
        embedding = generate_embeddings([test_text])
        
        assert len(embedding) == 1
        assert len(embedding[0]) == 1024
        assert all(isinstance(x, float) for x in embedding[0])
        
        # Verify embedding is not all zeros
        assert sum(abs(x) for x in embedding[0]) > 0.01
    
    def test_huggingface_embedding_unique(self):
        """Test different texts produce different embeddings"""
        texts = [
            "What is binary search algorithm?",
            "Explain object oriented programming",
            "How does vector database work?"
        ]
        
        embeddings = generate_embeddings(texts)
        
        assert len(embeddings) == 3
        assert embeddings[0] != embeddings[1]
        assert embeddings[1] != embeddings[2]
    
    def test_groq_connection(self):
        """Test that we can connect to Groq API successfully"""
        client = get_llm_client()
        assert client is not None
    
    def test_groq_client_working(self):
        """Test Groq LLM client can respond"""
        client = get_llm_client()
        if client:
            response = client.invoke("Hello, respond with 'OK'")
            assert response is not None
            assert len(response.content) > 0


if __name__ == "__main__":
    pytest.main([__file__, "-v"])