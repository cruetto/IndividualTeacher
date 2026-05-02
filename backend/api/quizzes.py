import traceback
import uuid
import json
import logging
import time
from flask import Blueprint, jsonify, request
from flask_login import login_required
from bson import ObjectId

from config import get_db, get_current_user_db_id
from core.quiz_generation import generate_smart_quiz

quiz_routes = Blueprint('quizzes', __name__)
logger = logging.getLogger(__name__)


@quiz_routes.route('/api/quizzes', methods=['GET'])
def get_quizzes():
    """Fetches quizzes based on scope: 'public' (userId: null) or 'my' (userId: current user)."""
    try:
        db = get_db()
        quizzes_collection = db.quizzes
        scope = request.args.get('scope', 'public')
        user_db_id = get_current_user_db_id()

        print(f"GET /api/quizzes request. Scope: {scope}, UserID: {user_db_id}")
        query = {}

        if scope == 'public':
            query = {"userId": None}
            print("Fetching public (userId: None) quizzes.")
        elif scope == 'my':
            if not user_db_id:
                return jsonify({"error": "Authentication required to fetch 'my' quizzes."}), 401
            query = {"userId": user_db_id}
            print(f"Fetching quizzes for user {user_db_id}.")
        else:
            return jsonify({"error": "Invalid scope parameter. Use 'public' or 'my'."}), 400

        
        found_quizzes_raw = list(quizzes_collection.find(query))

        processed_quizzes = []
        for quiz in found_quizzes_raw:
            processed_quiz = {}
            for key, value in quiz.items():
                if isinstance(value, ObjectId):
                    processed_quiz[key] = str(value)
                else:
                    processed_quiz[key] = value
            processed_quiz.pop('_id', None)
            processed_quizzes.append(processed_quiz)

        print(f"Found and processed {len(processed_quizzes)} quizzes for scope '{scope}'.")

        return jsonify(processed_quizzes)

    except Exception as e:
        print(f"Error fetching quizzes (scope: {scope}): {e}")
        traceback.print_exc()
        return jsonify({"error": "Failed to fetch quizzes from database"}), 500


@quiz_routes.route('/api/quizzes', methods=['POST'])
@login_required
def add_quiz():
    """Adds a new quiz manually for the logged-in user."""
    user_db_id = get_current_user_db_id()
    print(f"POST /api/quizzes request received (Manual Add). UserID: {user_db_id}")
    try:
        db = get_db()
        quizzes_collection = db.quizzes
        data = request.get_json()

        if not data: return jsonify({"error": "Request body must contain JSON data"}), 400
        if not data.get('title'): return jsonify({"error": "Missing 'title'"}), 400
        if 'questions' not in data or not isinstance(data['questions'], list): data['questions'] = []

        if 'id' not in data or not data['id']: data['id'] = str(uuid.uuid4())
        for q in data['questions']:
            if 'id' not in q or not q['id']: q['id'] = str(uuid.uuid4())
            if 'answers' in q:
                for a in q['answers']:
                    if 'id' not in a or not a['id']: a['id'] = str(uuid.uuid4())

        data['userId'] = user_db_id
        data.pop('_id', None)

        insert_result = quizzes_collection.insert_one(data)
        new_quiz = quizzes_collection.find_one({"id": data['id']}, {'_id': 0})

        if not new_quiz: return jsonify({"error": "Failed to retrieve newly added quiz"}), 500
        print(f"Quiz added manually. ID: {data['id']}, UserID assigned: {user_db_id}")

        return jsonify(new_quiz), 201 

    except Exception as e:
        print(f"Error adding manual quiz: {e}")
        traceback.print_exc()
        return jsonify({"error": "Failed to add quiz manually"}), 500


@quiz_routes.route('/api/quizzes/<quiz_id>', methods=['DELETE'])
@login_required
def delete_quiz(quiz_id):
    """Deletes a quiz owned by the current user."""
    user_db_id = get_current_user_db_id()
    print(f"DELETE /api/quizzes/{quiz_id} request. UserID: {user_db_id}")
    try:
        db = get_db()
        quizzes_collection = db.quizzes
        delete_result = quizzes_collection.delete_one({"id": quiz_id, "userId": user_db_id})

        if delete_result.deleted_count == 1:
            print(f"Successfully deleted quiz {quiz_id} owned by {user_db_id}")
            return '', 204
        else:
            quiz_exists = quizzes_collection.count_documents({"id": quiz_id}) > 0
            if quiz_exists:
                print(f"Permission denied: User {user_db_id} tried to delete quiz {quiz_id} not owned by them.")
                return jsonify({"error": "Permission denied. You do not own this quiz."}), 403
            else:
                print(f"Not found: Quiz {quiz_id} not found for deletion.")
                return jsonify({"error": "Quiz not found"}), 404

    except Exception as e:
        print(f"Error deleting quiz {quiz_id}: {e}")
        traceback.print_exc()
        return jsonify({"error": "Failed to delete quiz"}), 500


@quiz_routes.route('/api/quizzes/<quiz_id>', methods=['PUT'])
@login_required
def update_quiz(quiz_id):
    """Updates a quiz owned by the current user."""
    user_db_id = get_current_user_db_id()
    print(f"PUT /api/quizzes/{quiz_id} request. UserID: {user_db_id}")
    try:
        db = get_db()
        quizzes_collection = db.quizzes
        updated_data = request.get_json()

        if not updated_data: return jsonify({"error": "Request body must contain JSON data"}), 400
        if not updated_data.get('title'): return jsonify({"error": "Missing 'title'"}), 400
        if 'questions' not in updated_data or not isinstance(updated_data['questions'], list): return jsonify({"error": "Missing 'questions' array"}), 400

        updated_data['id'] = quiz_id
        for q in updated_data.get('questions', []):
             if 'id' not in q or not q['id']: q['id'] = str(uuid.uuid4())
             for a in q.get('answers', []):
                 if 'id' not in a or not a['id']: a['id'] = str(uuid.uuid4())

        updated_data.pop('_id', None); updated_data.pop('userId', None)
        replacement_doc = updated_data.copy(); replacement_doc['userId'] = user_db_id
        filter_criteria = {"id": quiz_id, "userId": user_db_id}
        update_result = quizzes_collection.replace_one(filter_criteria, replacement_doc)

        if update_result.matched_count == 1:
            print(f"Quiz {quiz_id} owned by {user_db_id} updated (Modified: {update_result.modified_count == 1}).")
            updated_quiz_from_db = quizzes_collection.find_one(filter_criteria)

            if not updated_quiz_from_db:
                 print(f"Error: Failed to retrieve quiz {quiz_id} after successful update confirmation.")
                 return jsonify({"error": "Failed to retrieve updated quiz after successful update."}), 500

            response_data = {}
            for key, value in updated_quiz_from_db.items():
                if isinstance(value, ObjectId):
                    response_data[key] = str(value)
                else:
                    response_data[key] = value
            response_data.pop('_id', None) 

            return jsonify(response_data), 200 

        else:
            quiz_exists = quizzes_collection.count_documents({"id": quiz_id}) > 0
            if quiz_exists:
                print(f"Permission denied: User {user_db_id} tried to update quiz {quiz_id} owned by someone else.")
                return jsonify({"error": "Permission denied. You do not own this quiz."}), 403
            else:
                print(f"Not found: Quiz {quiz_id} not found for update.")
                return jsonify({"error": "Quiz not found"}), 404 

    except Exception as e:
        print(f"Error updating quiz {quiz_id}: {e}")
        traceback.print_exc()
        return jsonify({"error": "Failed to update quiz"}), 500


@quiz_routes.route('/api/quizzes/<quiz_id>', methods=['GET'])
@login_required
def get_quiz_by_id(quiz_id):
    """Fetches a single quiz by its custom ID, ensuring the user owns it."""
    user_db_id = get_current_user_db_id()
    print(f"GET /api/quizzes/{quiz_id} request. UserID: {user_db_id}")
    try:
        db = get_db()
        quizzes_collection = db.quizzes

        quiz_data_raw = quizzes_collection.find_one(
            {"id": quiz_id, "userId": user_db_id}
        )

        if quiz_data_raw:
            print(f"Found quiz {quiz_id} owned by user {user_db_id}.")

            response_data = {}
            for key, value in quiz_data_raw.items():
                if isinstance(value, ObjectId):
                    response_data[key] = str(value) 
                else:
                    response_data[key] = value
            response_data.pop('_id', None) 

            return jsonify(response_data), 200 
        else:

            print(f"Quiz {quiz_id} not found or not owned by user {user_db_id}.")
            return jsonify({"error": "Quiz not found or permission denied."}), 404 

    except Exception as e:
        print(f"Error fetching quiz {quiz_id}: {e}")
        traceback.print_exc()
        return jsonify({"error": "Failed to fetch quiz data"}), 500


@quiz_routes.route('/api/models', methods=['GET'])
def get_models():
    """Return list of available Groq models"""
    from core.llm import get_available_groq_models
    return jsonify(get_available_groq_models())


def _parse_required_int(value, field_name):
    try:
        return int(value)
    except (TypeError, ValueError):
        raise ValueError(f"Invalid '{field_name}'.")


def _parse_generation_request():
    payload = request.form
    pdf_file = request.files.get('pdf')

    pdf_filename = None
    pdf_bytes = None
    if pdf_file and pdf_file.filename:
        if not pdf_file.filename.lower().endswith('.pdf'):
            raise ValueError("File must be a PDF document")
        pdf_filename = pdf_file.filename
        pdf_bytes = pdf_file.read()
        if not pdf_bytes:
            raise ValueError("PDF file is empty")

    title = str(payload.get('title') or '').strip()
    if not title and pdf_filename:
        title = pdf_filename.rsplit('.', 1)[0]

    topic = str(
        payload.get('topic')
        or payload.get('instructions')
        or ''
    ).strip()

    if not title:
        raise ValueError("Missing 'title'")
    if not topic and not pdf_bytes:
        raise ValueError("Provide topic instructions or upload a PDF document.")

    num_questions = _parse_required_int(payload.get('num_questions'), 'num_questions')
    difficulty = _parse_required_int(payload.get('difficulty', 3), 'difficulty')

    if not 1 <= num_questions <= 150:
        raise ValueError("Invalid 'num_questions' (1-150).")
    if not 1 <= difficulty <= 5:
        raise ValueError("Invalid 'difficulty' (1-5).")

    return {
        "request_id": str(uuid.uuid4())[:8],
        "title": title,
        "topic": topic,
        "num_questions": num_questions,
        "difficulty": difficulty,
        "language": str(payload.get('language') or "English").strip() or "English",
        "source_type": "pdf" if pdf_bytes else "topic",
        "source_document": pdf_filename,
        "pdf_bytes": pdf_bytes,
    }


def _queue_event(progress_queue, payload):
    if payload.get("error"):
        logger.error("Quiz generation stream error: %s", payload["error"])

    progress_queue.put(json.dumps(payload, ensure_ascii=False))


def _prepare_source_content(generation_request, progress_queue=None):
    topic = generation_request["topic"]

    if generation_request["pdf_bytes"]:
        logger.info(
            "[%s] Preparing PDF source '%s'",
            generation_request["request_id"],
            generation_request["source_document"],
        )
        if progress_queue:
            _queue_event(progress_queue, {
                "progress": 10,
                "status": "Processing PDF document"
            })

        from core.pdf_processor import PDFProcessor
        pdf_processor = PDFProcessor()
        document_text = pdf_processor.process_pdf(generation_request["pdf_bytes"])
        logger.info(
            "[%s] PDF source extracted: %s characters",
            generation_request["request_id"],
            len(document_text),
        )

        if progress_queue:
            _queue_event(progress_queue, {
                "progress": 20,
                "status": "PDF content extracted"
            })

        source_parts = []
        if topic:
            source_parts.append(f"TOPIC / INSTRUCTIONS:\n{topic}")
        source_parts.append(f"DOCUMENT CONTENT:\n{document_text}")
        return "\n\n".join(source_parts)

    if progress_queue:
        _queue_event(progress_queue, {
            "progress": 10,
            "status": "Preparing topic instructions"
        })
    logger.info("[%s] Preparing topic-only source", generation_request["request_id"])
    return f"TOPIC / INSTRUCTIONS:\n{topic}"


def _generate_questions_for_request(generation_request, progress_queue=None):
    logger.info(
        "[%s] Starting smart quiz generation: source=%s, questions=%s, difficulty=%s, language=%s",
        generation_request["request_id"],
        generation_request["source_type"],
        generation_request["num_questions"],
        generation_request["difficulty"],
        generation_request["language"],
    )
    started_at = time.monotonic()
    source_content = _prepare_source_content(generation_request, progress_queue)

    def report_progress(progress, status):
        if progress_queue:
            _queue_event(progress_queue, {
                "progress": progress,
                "status": status
            })

    questions = generate_smart_quiz(
        source_content=source_content,
        source_type=generation_request["source_type"],
        question_count=generation_request["num_questions"],
        difficulty=generation_request["difficulty"],
        language=generation_request["language"],
        progress_callback=report_progress,
    )
    logger.info(
        "[%s] Smart quiz generation finished: %s questions in %.1fs",
        generation_request["request_id"],
        len(questions),
        time.monotonic() - started_at,
    )
    return questions


def _build_quiz_document(generation_request, questions, user_db_id):
    quiz_document_data = {
        "id": str(uuid.uuid4()),
        "title": generation_request["title"],
        "topic": generation_request["topic"],
        "source_type": generation_request["source_type"],
        "questions": questions,
        "userId": str(user_db_id) if user_db_id else None,
    }

    if generation_request["source_document"]:
        quiz_document_data["source_document"] = generation_request["source_document"]

    return quiz_document_data


def _save_quiz_for_user(quiz_document_data, user_db_id):
    if not user_db_id:
        logger.info("Generated quiz for guest; skipping database save")
        return

    db = get_db()
    quizzes_collection = db.quizzes
    quiz_document_data_to_save = quiz_document_data.copy()
    quiz_document_data_to_save['userId'] = user_db_id
    quizzes_collection.insert_one(quiz_document_data_to_save)
    logger.info(
        "Saved generated quiz %s for user %s",
        quiz_document_data["id"],
        user_db_id,
    )


def _log_generated_quiz_result(generation_request, quiz_document_data, user_db_id):
    final_result = {
        "request_id": generation_request["request_id"],
        "source_type": generation_request["source_type"],
        "source_document": generation_request["source_document"],
        "title": generation_request["title"],
        "topic": generation_request["topic"],
        "num_questions": generation_request["num_questions"],
        "difficulty": generation_request["difficulty"],
        "language": generation_request["language"],
        "saved_for_authenticated_user": bool(user_db_id),
        "quiz": quiz_document_data,
    }
    logger.info(
        "FINAL_GENERATED_QUIZ_JSON %s",
        json.dumps(final_result, ensure_ascii=False, default=str),
    )




@quiz_routes.route('/api/quizzes/generate-stream', methods=['POST'])
def generate_quiz_stream():
    """Stream quiz generation progress for topic-only and PDF-backed quizzes."""
    from flask import Response
    import queue
    import threading

    user_db_id = get_current_user_db_id() 

    try:
        generation_request = _parse_generation_request()
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    logger.info(
        "[%s] Received quiz generation request: title='%s', source=%s, document=%s",
        generation_request["request_id"],
        generation_request["title"],
        generation_request["source_type"],
        generation_request["source_document"] or "none",
    )

    progress_queue = queue.Queue()

    def generate():
        try:
            logger.info("[%s] Background generation thread started", generation_request["request_id"])
            questions = _generate_questions_for_request(generation_request, progress_queue)
            quiz_document_data = _build_quiz_document(generation_request, questions, user_db_id)
            _save_quiz_for_user(quiz_document_data, user_db_id)
            _log_generated_quiz_result(generation_request, quiz_document_data, user_db_id)

            _queue_event(progress_queue, {
                "progress": 100,
                "status": "Quiz generated",
                "complete": True,
                "quiz": quiz_document_data
            })

        except Exception as e:
            logger.exception("[%s] Quiz generation failed", generation_request["request_id"])
            traceback.print_exc()
            _queue_event(progress_queue, {"error": str(e)})
        finally:
            logger.info("[%s] Background generation thread finished", generation_request["request_id"])
            progress_queue.put(None)

    # Start generation in background thread
    threading.Thread(target=generate, daemon=True).start()

    # Stream events to client
    def stream_response():
        while True:
            msg = progress_queue.get()
            if msg is None:
                break
            yield f"data: {msg}\n\n"
    
    return Response(stream_response(), mimetype='text/event-stream')
