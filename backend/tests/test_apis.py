"""
Tests for external API connections: Groq LLM, HuggingFace Embeddings
"""
import io
import json
import sys
import os
from types import SimpleNamespace
sys.path.append(os.path.dirname(os.path.abspath(__file__)) + '/../')

import pytest
from flask import Flask
import api.quizzes as quiz_api
from api.quizzes import quiz_routes
from core.pdf_processor import PDFProcessor
from core.quiz_generation import (
    create_distractor_generation_prompt,
    create_question_plan_prompt,
    normalize_generated_questions,
    normalize_question_plans,
    parse_llm_json,
)
from core.llm import (
    get_available_groq_models,
    get_llm_client,
)
from core.embeddings import EMBEDDING_DIMENSION, generate_embeddings


RUN_EXTERNAL_API_TESTS = os.environ.get("RUN_EXTERNAL_API_TESTS") == "1"


requires_external_apis = pytest.mark.skipif(
    not RUN_EXTERNAL_API_TESTS,
    reason="External API tests are disabled. Set RUN_EXTERNAL_API_TESTS=1 to run them.",
)


def _sample_question():
    return {
        "id": "question-1",
        "type": "multiple_choice",
        "question_text": "What is 2 + 2?",
        "answers": [
            {"id": "answer-1", "answer_text": "4", "is_correct": True},
            {"id": "answer-2", "answer_text": "3", "is_correct": False},
            {"id": "answer-3", "answer_text": "5", "is_correct": False},
            {"id": "answer-4", "answer_text": "6", "is_correct": False},
        ],
    }


def _stream_events(response):
    body = response.get_data(as_text=True)
    return [
        json.loads(line.removeprefix("data: "))
        for line in body.splitlines()
        if line.startswith("data: ")
    ]


class _FailingCompletions:
    def __init__(self):
        self.calls = 0

    def create(self, **kwargs):
        self.calls += 1
        raise RuntimeError("model_decommissioned")


class TestExternalAPIs:
    
    def setup_class(self):
        """Load environment variables"""
        from dotenv import load_dotenv
        load_dotenv()
    
    def test_available_groq_models_are_curated(self):
        models = get_available_groq_models()

        assert len(models) >= 1
        assert any(model["id"] == "llama-3.3-70b-versatile" for model in models)
        assert all("context_window" in model for model in models)

    def test_question_plan_prompt_prefers_adapting_existing_tasks(self):
        prompt = create_question_plan_prompt(
            "1. Solve 2 + 2. 2. Name the capital of Lithuania.",
            source_type="pdf",
            requested_question_count=6,
            difficulty=4,
            language="Lithuanian",
        )

        assert "EXACTLY 6 question plans" in prompt
        assert "adapt them into quiz question plans" in prompt
        assert "existing_task" in prompt
        assert "Lithuanian" in prompt

    def test_distractor_prompt_uses_whole_batch(self):
        prompt = create_distractor_generation_prompt(
            [
                {
                    "question_text": "What is 2 + 2?",
                    "correct_answer": "4",
                    "source_reference": "Page 1",
                    "concept": "Addition",
                    "origin": "existing_task",
                }
            ],
            difficulty=5,
            language="English",
        )

        assert "QUESTION PLANS" in prompt
        assert "exactly 3 incorrect distractors" in prompt
        assert "expert-level" in prompt
        assert '"questions"' in prompt

    def test_parse_llm_json_handles_fenced_json(self):
        parsed = parse_llm_json('```json\n{"question_plans": []}\n```')

        assert parsed == {"question_plans": []}

    def test_parse_llm_json_rejects_malformed_json(self):
        with pytest.raises(ValueError):
            parse_llm_json("not json at all")

    def test_normalize_question_plans_keeps_required_contract(self):
        plans = normalize_question_plans({
            "question_plans": [{
                "question": "What is 2 + 2?",
                "answer": "4",
                "source_reference": "Page 1",
                "concept": "Addition",
                "origin": "unknown",
            }]
        })

        assert plans == [{
            "question_text": "What is 2 + 2?",
            "correct_answer": "4",
            "source_reference": "Page 1",
            "concept": "Addition",
            "origin": "document_content",
        }]

    def test_normalize_generated_questions_adds_ids_and_validates_answers(self):
        questions = normalize_generated_questions({
            "questions": [{
                "question_text": "What is 2 + 2?",
                "answers": [
                    {"answer_text": "4", "is_correct": True},
                    {"answer_text": "3", "is_correct": False},
                    {"answer_text": "5", "is_correct": False},
                    {"answer_text": "6", "is_correct": False},
                ]
            }]
        })

        assert len(questions) == 1
        assert questions[0]["id"]
        assert questions[0]["type"] == "multiple_choice"
        assert len(questions[0]["answers"]) == 4
        assert sum(answer["is_correct"] for answer in questions[0]["answers"]) == 1
        assert all(answer["id"] for answer in questions[0]["answers"])

    def test_generate_stream_accepts_topic_form_data(self, monkeypatch):
        captured_request = {}

        def fake_generate(generation_request, progress_queue=None):
            captured_request.update(generation_request)
            return [_sample_question()]

        monkeypatch.setattr(quiz_api, "_generate_questions_for_request", fake_generate)
        monkeypatch.setattr(quiz_api, "_save_quiz_for_user", lambda *args: None)
        monkeypatch.setattr(quiz_api, "get_current_user_db_id", lambda: None)

        app = Flask(__name__)
        app.register_blueprint(quiz_routes)

        response = app.test_client().post(
            "/api/quizzes/generate-stream",
            data={
                "title": "Math quiz",
                "topic": "addition",
                "num_questions": "2",
                "difficulty": "5",
                "language": "English",
            },
        )
        events = _stream_events(response)
        complete_event = next(event for event in events if event.get("complete"))

        assert response.status_code == 200
        assert captured_request["source_type"] == "topic"
        assert captured_request["num_questions"] == 2
        assert captured_request["difficulty"] == 5
        assert complete_event["quiz"]["source_type"] == "topic"
        assert complete_event["quiz"]["questions"] == [_sample_question()]

    def test_generate_stream_accepts_pdf_form_data(self, monkeypatch):
        captured_request = {}

        def fake_generate(generation_request, progress_queue=None):
            captured_request.update(generation_request)
            return [_sample_question()]

        monkeypatch.setattr(quiz_api, "_generate_questions_for_request", fake_generate)
        monkeypatch.setattr(quiz_api, "_save_quiz_for_user", lambda *args: None)
        monkeypatch.setattr(quiz_api, "get_current_user_db_id", lambda: None)

        app = Flask(__name__)
        app.register_blueprint(quiz_routes)

        response = app.test_client().post(
            "/api/quizzes/generate-stream",
            data={
                "title": "PDF quiz",
                "topic": "adapt existing tasks",
                "num_questions": "3",
                "difficulty": "4",
                "language": "Lithuanian",
                "pdf": (io.BytesIO(b"%PDF-1.4 fake"), "tasks.pdf"),
            },
        )
        events = _stream_events(response)
        complete_event = next(event for event in events if event.get("complete"))

        assert response.status_code == 200
        assert captured_request["source_type"] == "pdf"
        assert captured_request["source_document"] == "tasks.pdf"
        assert captured_request["pdf_bytes"] == b"%PDF-1.4 fake"
        assert captured_request["difficulty"] == 4
        assert complete_event["quiz"]["source_type"] == "pdf"
        assert complete_event["quiz"]["source_document"] == "tasks.pdf"

    def test_generate_stream_requires_explicit_question_count(self, monkeypatch):
        monkeypatch.setattr(quiz_api, "get_current_user_db_id", lambda: None)

        app = Flask(__name__)
        app.register_blueprint(quiz_routes)

        response = app.test_client().post(
            "/api/quizzes/generate-stream",
            data={
                "title": "Math quiz",
                "topic": "addition",
                "difficulty": "3",
                "language": "English",
            },
        )

        assert response.status_code == 400
        assert response.get_json()["error"] == "Invalid 'num_questions'."

    def test_legacy_pdf_endpoint_is_removed(self):
        app = Flask(__name__)
        app.register_blueprint(quiz_routes)

        response = app.test_client().post(
            "/api/quizzes/generate-from-pdf",
            data={
                "title": "PDF quiz",
                "topic": "addition",
                "num_questions": "3",
                "difficulty": "3",
                "language": "English",
                "pdf": (io.BytesIO(b"%PDF-1.4 fake"), "tasks.pdf"),
            },
        )

        assert response.status_code == 405

    def test_pdf_image_description_fails_fast(self):
        completions = _FailingCompletions()
        processor = PDFProcessor.__new__(PDFProcessor)
        processor.vision_model = "broken-vision-model"
        processor.client = SimpleNamespace(
            chat=SimpleNamespace(completions=completions)
        )

        with pytest.raises(RuntimeError) as exc_info:
            processor._describe_image(b"fake image bytes", 1, 2)

        message = str(exc_info.value)
        assert completions.calls == 1
        assert "Visual description failed for page 2" in message
        assert "broken-vision-model" in message
        assert "model_decommissioned" in message

    def test_pdf_image_description_does_not_retry_rate_limit(self):
        class RateLimitedCompletions:
            def __init__(self):
                self.calls = 0

            def create(self, **kwargs):
                self.calls += 1
                raise RuntimeError("Error code: 429 - rate_limit_exceeded. Please try again in 250ms.")

        completions = RateLimitedCompletions()
        processor = PDFProcessor.__new__(PDFProcessor)
        processor.vision_model = "rate-limited-vision-model"
        processor.client = SimpleNamespace(
            chat=SimpleNamespace(completions=completions)
        )

        with pytest.raises(RuntimeError) as exc_info:
            processor._describe_image(b"fake image bytes", "page", 1)

        assert completions.calls == 1
        assert "rate_limit_exceeded" in str(exc_info.value)

    def test_pdf_process_skips_failed_page_visual_description(self, monkeypatch):
        class FakePage:
            def get_text(self, sort=True):
                return "Visible PDF text"

            def get_images(self, full=True):
                return []

        class FakeDoc:
            def __iter__(self):
                return iter([FakePage()])

            def __len__(self):
                return 1

            def close(self):
                pass

        processor = PDFProcessor.__new__(PDFProcessor)
        processor.vision_model = "broken-vision-model"
        processor.max_image_size = 20 * 1024 * 1024
        monkeypatch.setattr("core.pdf_processor.fitz.open", lambda **kwargs: FakeDoc())
        monkeypatch.setattr(
            processor,
            "_describe_page_visuals",
            lambda doc, page, page_num: (_ for _ in ()).throw(RuntimeError("vision failed")),
        )

        document_text = processor.process_pdf(b"%PDF fake")

        assert "Visible PDF text" in document_text
        assert "VISUAL DESCRIPTION" not in document_text

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
