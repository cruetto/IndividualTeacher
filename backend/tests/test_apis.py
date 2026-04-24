"""
Tests for external API connections: Groq LLM, HuggingFace Embeddings
"""
import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)) + '/../')

import pytest
from core.llm import (
    create_fact_extraction_prompt,
    create_question_from_fact_prompt,
    get_available_groq_models,
    get_llm_client,
)
from core.embeddings import EMBEDDING_DIMENSION, generate_embeddings


RUN_EXTERNAL_API_TESTS = os.environ.get("RUN_EXTERNAL_API_TESTS") == "1"


requires_external_apis = pytest.mark.skipif(
    not RUN_EXTERNAL_API_TESTS,
    reason="External API tests are disabled. Set RUN_EXTERNAL_API_TESTS=1 to run them.",
)


class TestExternalAPIs:
    
    def setup_class(self):
        """Load environment variables"""
        from dotenv import load_dotenv
        load_dotenv()
    
    def test_fact_extraction_prompt_contains_generation_contract(self):
        prompt = create_fact_extraction_prompt(
            "Photosynthesis converts light energy into chemical energy.",
            requested_fact_count=8,
            language="English",
        )

        assert "Generate EXACTLY 8 facts" in prompt
        assert '"facts"' in prompt
        assert "English" in prompt

    def test_question_prompt_contains_difficulty_and_language(self):
        prompt = create_question_from_fact_prompt(
            "Photosynthesis occurs in chloroplasts.",
            difficulty=5,
            language="Lithuanian",
        )

        assert "Difficulty level 5/5" in prompt
        assert "expert level difficulty" in prompt
        assert "Lithuanian" in prompt
        assert '"answers"' in prompt

    def test_available_groq_models_are_curated(self):
        models = get_available_groq_models()

        assert len(models) >= 1
        assert any(model["id"] == "llama-3.3-70b-versatile" for model in models)
        assert all("context_window" in model for model in models)

    @requires_external_apis
    def test_huggingface_embedding_connection(self):
        """Test that we can connect to HuggingFace embedding API"""
        test_text = "connection test"
        embedding = generate_embeddings([test_text])
        assert embedding is not None
        assert len(embedding) == 1

    @requires_external_apis
    def test_huggingface_embedding_dimensions(self):
        """Test embeddings are generated correctly with 1024 dimensions"""
        test_text = "This is a test sentence for embedding generation"
        embedding = generate_embeddings([test_text])
        
        assert len(embedding) == 1
        assert len(embedding[0]) == EMBEDDING_DIMENSION
        assert all(isinstance(x, float) for x in embedding[0])
        
        # Verify embedding is not all zeros
        assert sum(abs(x) for x in embedding[0]) > 0.01

    @requires_external_apis
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

    @requires_external_apis
    def test_groq_connection(self):
        """Test that we can connect to Groq API successfully"""
        client = get_llm_client()
        assert client is not None

    @requires_external_apis
    def test_groq_client_working(self):
        """Test Groq LLM client can respond"""
        client = get_llm_client()
        if client:
            response = client.invoke("Hello, respond with 'OK'")
            assert response is not None
            assert len(response.content) > 0


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
