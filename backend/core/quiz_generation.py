import json
import logging
import time
import uuid
from typing import Any, Callable

from core.llm import get_llm_client


ProgressCallback = Callable[[int, str], None]


ORIGINS = {"existing_task", "document_content", "topic_generation"}
logger = logging.getLogger(__name__)


def strip_llm_json(content: str) -> str:
    """Remove common Markdown fencing around LLM JSON responses."""
    cleaned = content.strip()

    if cleaned.startswith("```"):
        first_newline = cleaned.find("\n")
        cleaned = cleaned[first_newline + 1:] if first_newline != -1 else cleaned[3:]

    if cleaned.endswith("```"):
        cleaned = cleaned[:-3]

    return cleaned.strip()


def parse_llm_json(content: str) -> Any:
    """Parse LLM JSON, including responses wrapped with short prose or fences."""
    cleaned = strip_llm_json(content)

    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        object_start = cleaned.find("{")
        object_end = cleaned.rfind("}")
        array_start = cleaned.find("[")
        array_end = cleaned.rfind("]")

        candidates = []
        if object_start != -1 and object_end != -1 and object_end > object_start:
            candidates.append(cleaned[object_start:object_end + 1])
        if array_start != -1 and array_end != -1 and array_end > array_start:
            candidates.append(cleaned[array_start:array_end + 1])

        for candidate in candidates:
            try:
                return json.loads(candidate)
            except json.JSONDecodeError:
                continue

    raise ValueError("The AI response was not valid JSON.")


def create_question_plan_prompt(
    source_content: str,
    source_type: str,
    requested_question_count: int,
    difficulty: int,
    language: str,
) -> str:
    return f"""
You are creating a quiz plan for an educational application.

Source type: {source_type}
Requested number of questions: {requested_question_count}
Target difficulty: {difficulty}/5
Output language: {language}

SOURCE MATERIAL:
{source_content}

Instructions:
1. Return EXACTLY {requested_question_count} question plans.
2. If the source already contains exercises, tasks, questions, or worked examples, adapt them into quiz question plans instead of extracting generic facts.
3. If the source is explanatory learning material, create question plans from the most important concepts.
4. If the source is only a topic or short instruction, generate plans from reliable general knowledge about that topic.
5. Each plan must include one clear question and the correct answer before distractors are created.
6. Keep questions answerable from the source when a PDF/document source is provided.
7. Use source_reference such as "Page 2", "Image 1 on Page 3", or "Topic" when possible.
8. Use origin values only from: existing_task, document_content, topic_generation.
9. ALL text in question_text and correct_answer must be in {language}.
10. Return JSON only.

Return this exact JSON shape:
{{
  "question_plans": [
    {{
      "question_text": "Question text here",
      "correct_answer": "Correct answer here",
      "source_reference": "Page 1 or Topic",
      "concept": "Short concept name",
      "origin": "existing_task"
    }}
  ]
}}
""".strip()


def create_distractor_generation_prompt(
    question_plans: list[dict],
    difficulty: int,
    language: str,
) -> str:
    difficulty_rules = [
        "Distractors should be obviously wrong and easy to reject.",
        "Distractors should be clearly incorrect but related to the same topic.",
        "Distractors should be plausible for a learner with partial understanding.",
        "Distractors should be very similar to the correct answer and test careful understanding.",
        "Distractors should be expert-level, highly plausible, and hard to distinguish.",
    ][difficulty - 1]

    plans_json = json.dumps(question_plans, ensure_ascii=False, indent=2)

    return f"""
Create final multiple-choice quiz questions from these question plans.

Difficulty level: {difficulty}/5
Difficulty rule: {difficulty_rules}
Output language: {language}

QUESTION PLANS:
{plans_json}

Instructions:
1. Return one final multiple-choice question for every plan.
2. Preserve the meaning of each plan's question_text and correct_answer.
3. Create exactly 3 incorrect distractors for each question.
4. Each question must have exactly 4 answers total.
5. Exactly one answer must have "is_correct": true.
6. Do not make distractors partially correct.
7. Avoid duplicate answer text inside the same question.
8. ALL visible text must be in {language}.
9. Return JSON only.

Return this exact JSON shape:
{{
  "questions": [
    {{
      "question_text": "Question text here",
      "answers": [
        {{ "answer_text": "Correct answer", "is_correct": true }},
        {{ "answer_text": "Distractor 1", "is_correct": false }},
        {{ "answer_text": "Distractor 2", "is_correct": false }},
        {{ "answer_text": "Distractor 3", "is_correct": false }}
      ]
    }}
  ]
}}
""".strip()


def normalize_question_plans(raw_data: Any, desired_count: int | None = None) -> list[dict]:
    if isinstance(raw_data, dict):
        raw_plans = (
            raw_data.get("question_plans")
            or raw_data.get("plans")
            or raw_data.get("questions")
            or []
        )
    elif isinstance(raw_data, list):
        raw_plans = raw_data
    else:
        raw_plans = []

    normalized = []
    for raw_plan in raw_plans:
        if not isinstance(raw_plan, dict):
            continue

        question_text = str(
            raw_plan.get("question_text")
            or raw_plan.get("question")
            or ""
        ).strip()
        correct_answer = str(
            raw_plan.get("correct_answer")
            or raw_plan.get("answer")
            or ""
        ).strip()

        if not question_text or not correct_answer:
            continue

        origin = str(raw_plan.get("origin") or "").strip()
        if origin not in ORIGINS:
            origin = "document_content"

        normalized.append({
            "question_text": question_text,
            "correct_answer": correct_answer,
            "source_reference": str(raw_plan.get("source_reference") or "Source").strip(),
            "concept": str(raw_plan.get("concept") or "General concept").strip(),
            "origin": origin,
        })

        if desired_count is not None and len(normalized) >= desired_count:
            break

    if not normalized:
        raise ValueError("The AI did not return usable question plans.")

    return normalized


def normalize_generated_questions(raw_data: Any, desired_count: int | None = None) -> list[dict]:
    if isinstance(raw_data, dict):
        raw_questions = raw_data.get("questions") or []
    elif isinstance(raw_data, list):
        raw_questions = raw_data
    else:
        raw_questions = []

    normalized_questions = []
    seen_question_texts = set()

    for raw_question in raw_questions:
        if not isinstance(raw_question, dict):
            continue

        question_text = str(
            raw_question.get("question_text")
            or raw_question.get("question")
            or ""
        ).strip()
        if not question_text:
            continue

        question_key = question_text.casefold()
        if question_key in seen_question_texts:
            continue

        answers = _normalize_answers(raw_question)
        if len(answers) != 4:
            continue

        normalized_questions.append({
            "id": str(uuid.uuid4()),
            "type": "multiple_choice",
            "question_text": question_text,
            "answers": answers,
        })
        seen_question_texts.add(question_key)

        if desired_count is not None and len(normalized_questions) >= desired_count:
            break

    if not normalized_questions:
        raise ValueError("The AI did not return usable quiz questions.")

    return normalized_questions


def _normalize_answers(raw_question: dict) -> list[dict]:
    raw_answers = raw_question.get("answers")
    correct_answer = raw_question.get("correct_answer")
    distractors = raw_question.get("distractors")

    answer_candidates = []
    if isinstance(raw_answers, list):
        answer_candidates.extend(raw_answers)
    elif correct_answer and isinstance(distractors, list):
        answer_candidates.append({"answer_text": correct_answer, "is_correct": True})
        answer_candidates.extend(
            {"answer_text": distractor, "is_correct": False}
            for distractor in distractors
        )

    correct = None
    incorrect = []
    seen_answer_texts = set()

    for candidate in answer_candidates:
        if isinstance(candidate, dict):
            answer_text = str(
                candidate.get("answer_text")
                or candidate.get("text")
                or candidate.get("answer")
                or ""
            ).strip()
            is_correct = bool(candidate.get("is_correct"))
        else:
            answer_text = str(candidate).strip()
            is_correct = False

        if not answer_text:
            continue

        answer_key = answer_text.casefold()
        if answer_key in seen_answer_texts:
            continue
        seen_answer_texts.add(answer_key)

        answer = {
            "id": str(uuid.uuid4()),
            "answer_text": answer_text,
            "is_correct": is_correct,
        }

        if is_correct and correct is None:
            correct = answer
        elif not is_correct:
            incorrect.append(answer)

    if correct is None or len(incorrect) < 3:
        return []

    return [correct] + incorrect[:3]


def generate_question_plans(
    source_content: str,
    source_type: str,
    requested_question_count: int,
    difficulty: int,
    language: str,
) -> list[dict]:
    logger.info(
        "Creating question plans: source=%s, requested=%s, difficulty=%s, language=%s",
        source_type,
        requested_question_count,
        difficulty,
        language,
    )
    llm = get_llm_client(model="llama-3.3-70b-versatile", temperature=0.2, top_p=0.8)
    if not llm:
        raise RuntimeError("LLM client not available")

    prompt = create_question_plan_prompt(
        source_content,
        source_type,
        requested_question_count,
        difficulty,
        language,
    )
    started_at = time.monotonic()
    logger.info("Calling LLM for question plans")
    response = llm.invoke(prompt)
    logger.info("Question-plan LLM call finished in %.1fs", time.monotonic() - started_at)
    parsed = parse_llm_json(response.content)
    plans = normalize_question_plans(parsed, requested_question_count)
    logger.info("Normalized %s question plans", len(plans))
    return plans


def generate_questions_from_plans(
    question_plans: list[dict],
    difficulty: int,
    language: str,
) -> list[dict]:
    logger.info(
        "Creating final answer options for %s question plans: difficulty=%s, language=%s",
        len(question_plans),
        difficulty,
        language,
    )
    llm = get_llm_client(model="llama-3.3-70b-versatile", temperature=0.7, top_p=0.9)
    if not llm:
        raise RuntimeError("LLM client not available")

    prompt = create_distractor_generation_prompt(question_plans, difficulty, language)
    started_at = time.monotonic()
    logger.info("Calling LLM for final questions and distractors")
    response = llm.invoke(prompt)
    logger.info("Distractor LLM call finished in %.1fs", time.monotonic() - started_at)
    parsed = parse_llm_json(response.content)
    questions = normalize_generated_questions(parsed, len(question_plans))
    logger.info("Normalized %s final quiz questions", len(questions))
    return questions


def generate_smart_quiz(
    source_content: str,
    source_type: str,
    question_count: int,
    difficulty: int = 3,
    language: str = "English",
    progress_callback: ProgressCallback | None = None,
) -> list[dict]:
    logger.info(
        "Smart quiz pipeline started: source=%s, questions=%s, difficulty=%s, language=%s",
        source_type,
        question_count,
        difficulty,
        language,
    )
    if progress_callback:
        progress_callback(30, "Analyzing source and planning questions")

    question_plans = generate_question_plans(
        source_content=source_content,
        source_type=source_type,
        requested_question_count=question_count,
        difficulty=difficulty,
        language=language,
    )

    if progress_callback:
        progress_callback(60, f"Created {len(question_plans)} question plans")
        progress_callback(75, "Creating answer options and distractors")

    questions = generate_questions_from_plans(question_plans, difficulty, language)

    if progress_callback:
        progress_callback(95, f"Finalized {len(questions)} quiz questions")

    logger.info("Smart quiz pipeline completed with %s questions", len(questions))
    return questions
