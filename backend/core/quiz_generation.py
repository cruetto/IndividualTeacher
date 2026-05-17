import ast
import json
import logging
import re
import time
import uuid
from typing import Any, Callable

from core.llm import get_llm_client


ProgressCallback = Callable[[int, str], None]


ORIGINS = {"existing_task", "document_content", "topic_generation"}
logger = logging.getLogger(__name__)
LLM_JSON_ERROR = "The AI response was not valid JSON."
LLM_RESPONSE_EXCERPT_CHARS = 500
LOG_PREVIEW_CHARS = 240
MAX_DISTRACTOR_BATCH_SIZE = 5
RATE_LIMIT_RETRY_ATTEMPTS = 4
RATE_LIMIT_WAIT_BUFFER_SECONDS = 1.5
MAX_RATE_LIMIT_SLEEP_SECONDS = 60


def strip_llm_json(content: str) -> str:
    """Remove common Markdown fencing around LLM JSON responses."""
    cleaned = content.strip()

    if cleaned.startswith("```"):
        first_newline = cleaned.find("\n")
        cleaned = cleaned[first_newline + 1:] if first_newline != -1 else cleaned[3:]

    if cleaned.endswith("```"):
        cleaned = cleaned[:-3]

    return cleaned.strip()


def _parse_json_candidate(candidate: str) -> Any:
    candidate = candidate.strip()
    if not candidate:
        raise ValueError(LLM_JSON_ERROR)

    candidates = [
        candidate,
        re.sub(r",(\s*[}\]])", r"\1", candidate),
    ]

    for current_candidate in dict.fromkeys(candidates):
        try:
            return json.loads(current_candidate)
        except json.JSONDecodeError:
            pass

        try:
            parsed = ast.literal_eval(current_candidate)
        except (SyntaxError, ValueError):
            continue

        if isinstance(parsed, (dict, list)):
            return parsed

    raise ValueError(LLM_JSON_ERROR)


def _find_balanced_json_candidates(content: str) -> list[str]:
    candidates = []
    opening_pairs = {"{": "}", "[": "]"}
    closing_chars = set(opening_pairs.values())

    for start_index, char in enumerate(content):
        if char not in opening_pairs:
            continue

        stack = [opening_pairs[char]]
        in_string = False
        string_quote = ""
        escaped = False

        for index in range(start_index + 1, len(content)):
            current = content[index]

            if in_string:
                if escaped:
                    escaped = False
                elif current == "\\":
                    escaped = True
                elif current == string_quote:
                    in_string = False
                continue

            if current in {'"', "'"}:
                in_string = True
                string_quote = current
                continue

            if current in opening_pairs:
                stack.append(opening_pairs[current])
                continue

            if current in closing_chars:
                if not stack or current != stack[-1]:
                    break
                stack.pop()
                if not stack:
                    candidates.append(content[start_index:index + 1])
                    break

    return candidates


def _iter_llm_json_candidates(content: str):
    cleaned = strip_llm_json(content)
    yield cleaned

    for match in re.finditer(r"```(?:json)?\s*(.*?)```", content, flags=re.IGNORECASE | re.DOTALL):
        yield match.group(1).strip()

    decoder = json.JSONDecoder()
    for source in (cleaned, content):
        for index, char in enumerate(source):
            if char not in "[{":
                continue

            try:
                parsed, end_index = decoder.raw_decode(source[index:])
            except json.JSONDecodeError:
                continue

            if isinstance(parsed, (dict, list)):
                yield source[index:index + end_index]

    for source in (cleaned, content):
        yield from _find_balanced_json_candidates(source)


def parse_llm_json(content: str) -> Any:
    """Parse LLM JSON, including responses wrapped with short prose or fences."""
    if not isinstance(content, str):
        raise ValueError(LLM_JSON_ERROR)

    seen_candidates = set()
    for candidate in _iter_llm_json_candidates(content):
        if candidate in seen_candidates:
            continue
        seen_candidates.add(candidate)

        try:
            return _parse_json_candidate(candidate)
        except ValueError:
            continue

    raise ValueError(LLM_JSON_ERROR)


def _response_content(response: Any) -> str:
    content = getattr(response, "content", response)
    if isinstance(content, str):
        return content
    return str(content)


def _llm_response_excerpt(content: str) -> str:
    single_line = " ".join(content.split())
    if len(single_line) <= LLM_RESPONSE_EXCERPT_CHARS:
        return single_line
    return f"{single_line[:LLM_RESPONSE_EXCERPT_CHARS]}..."


def _text_preview(content: str, max_chars: int = LOG_PREVIEW_CHARS) -> str:
    single_line = " ".join(str(content).split())
    if len(single_line) <= max_chars:
        return single_line
    return f"{single_line[:max_chars]}..."


def _estimate_tokens(content: str) -> int:
    return max(1, len(content) // 4)


def _rate_limit_retry_seconds(exc: Exception) -> float | None:
    message = str(exc)
    if "rate_limit" not in message.lower() and exc.__class__.__name__ != "RateLimitError":
        return None

    match = re.search(r"try again in ([0-9.]+)s", message, flags=re.IGNORECASE)
    if not match:
        return 30

    try:
        return float(match.group(1))
    except ValueError:
        return 30


def _invoke_llm_with_rate_limit_wait(llm: Any, prompt: str, context: str) -> Any:
    for attempt in range(1, RATE_LIMIT_RETRY_ATTEMPTS + 1):
        try:
            return llm.invoke(prompt)
        except Exception as exc:
            retry_seconds = _rate_limit_retry_seconds(exc)
            if retry_seconds is None or attempt == RATE_LIMIT_RETRY_ATTEMPTS:
                raise

            sleep_seconds = min(
                max(retry_seconds + RATE_LIMIT_WAIT_BUFFER_SECONDS, 1),
                MAX_RATE_LIMIT_SLEEP_SECONDS,
            )
            logger.warning(
                "%s LLM request hit rate limit; waiting %.1fs before retry %s/%s",
                context,
                sleep_seconds,
                attempt,
                RATE_LIMIT_RETRY_ATTEMPTS - 1,
            )
            time.sleep(sleep_seconds)

    raise RuntimeError("LLM request failed after rate-limit retries")


def _invoke_llm_json(
    llm: Any,
    prompt: str,
    context: str,
    validate: Callable[[Any], None] | None = None,
) -> Any:
    logger.info(
        "%s LLM request payload: prompt_chars=%s approx_prompt_tokens=%s",
        context,
        len(prompt),
        _estimate_tokens(prompt),
    )
    response = _invoke_llm_with_rate_limit_wait(llm, prompt, context)
    content = _response_content(response)

    try:
        parsed = parse_llm_json(content)
        if validate:
            validate(parsed)
        return parsed
    except ValueError as exc:
        logger.warning(
            "%s LLM response was not usable; retrying once. Error: %s. Response excerpt: %s",
            context,
            exc,
            _llm_response_excerpt(content),
        )

    retry_prompt = "\n\n".join([
        prompt,
        "Your previous response was not valid or did not match the required schema.",
        "Return only valid JSON matching the requested shape.",
        "Do not include Markdown fences, prose, comments, or trailing commas.",
    ])
    logger.info(
        "%s LLM retry payload: prompt_chars=%s approx_prompt_tokens=%s",
        context,
        len(retry_prompt),
        _estimate_tokens(retry_prompt),
    )
    retry_response = _invoke_llm_with_rate_limit_wait(llm, retry_prompt, f"{context} retry")
    retry_content = _response_content(retry_response)

    try:
        parsed = parse_llm_json(retry_content)
        if validate:
            validate(parsed)
        return parsed
    except ValueError as exc:
        logger.error(
            "%s LLM retry was not usable. Error: %s. Response excerpt: %s",
            context,
            exc,
            _llm_response_excerpt(retry_content),
        )
        raise ValueError(str(exc))


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
10. Use ONLY the field names shown in the schema below.
11. The response must be valid JSON accepted by json.loads: double quotes, lowercase true/false/null, no trailing commas.
12. Do not wrap the response in Markdown. Do not include prose before or after the JSON.
13. Return one top-level object that starts with {{ and ends with }}.

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

Question count for this batch: {len(question_plans)}
Difficulty level: {difficulty}/5
Difficulty rule: {difficulty_rules}
Output language: {language}

QUESTION PLANS:
{plans_json}

Instructions:
1. Return EXACTLY {len(question_plans)} final multiple-choice questions, one for every plan.
2. Preserve the meaning of each plan's question_text and correct_answer.
3. Create exactly 3 incorrect distractors for each question.
4. Each question must have exactly 4 answers total.
5. Exactly one answer must have "is_correct": true.
6. Do not make distractors partially correct.
7. Avoid duplicate answer text inside the same question.
8. ALL visible text must be in {language}.
9. Use ONLY these field names: questions, question_text, answers, answer_text, is_correct.
10. The response must be valid JSON accepted by json.loads: double quotes, lowercase true/false/null, no trailing commas.
11. Do not wrap the response in Markdown. Do not include prose before or after the JSON.
12. Return one top-level object that starts with {{ and ends with }}.

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


def _iter_batches(items: list[dict], batch_size: int):
    for start in range(0, len(items), batch_size):
        yield start // batch_size + 1, start, items[start:start + batch_size]


def _question_plan_log_preview(question_plans: list[dict]) -> list[dict]:
    return [
        {
            "index": index + 1,
            "concept": _text_preview(plan.get("concept", ""), 60),
            "question": _text_preview(plan.get("question_text", ""), 120),
            "answer": _text_preview(plan.get("correct_answer", ""), 80),
        }
        for index, plan in enumerate(question_plans[:3])
    ]


def normalize_generated_questions(raw_data: Any, desired_count: int | None = None) -> list[dict]:
    if isinstance(raw_data, dict):
        raw_questions = (
            raw_data.get("questions")
            or raw_data.get("quiz_questions")
            or raw_data.get("multiple_choice_questions")
            or raw_data.get("items")
            or []
        )
        if not raw_questions and isinstance(raw_data.get("quiz"), dict):
            raw_questions = raw_data["quiz"].get("questions") or []
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
            or raw_question.get("prompt")
            or raw_question.get("stem")
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


def _validate_generated_question_count(raw_data: Any, expected_count: int) -> None:
    questions = normalize_generated_questions(raw_data, expected_count)
    if len(questions) != expected_count:
        raise ValueError(
            f"The AI returned {len(questions)} usable quiz questions; expected {expected_count}."
        )


def _correct_answer_marker(raw_question: dict) -> str:
    return str(
        raw_question.get("correct_answer")
        or raw_question.get("correctAnswer")
        or raw_question.get("correct")
        or raw_question.get("correct_option")
        or raw_question.get("correctOption")
        or raw_question.get("correct_choice")
        or raw_question.get("correctChoice")
        or ""
    ).strip()


def _correct_index_marker(raw_question: dict) -> int | None:
    raw_index = (
        raw_question.get("correct_index")
        if "correct_index" in raw_question
        else raw_question.get("correctIndex")
    )
    try:
        return int(raw_index)
    except (TypeError, ValueError):
        return None


def _is_correct_flag(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().casefold() in {"true", "yes", "y", "1", "correct"}
    if isinstance(value, (int, float)):
        return value == 1
    return False


def _candidate_text_and_label(candidate: Any) -> tuple[str, str]:
    if isinstance(candidate, dict):
        answer_text = str(
            candidate.get("answer_text")
            or candidate.get("text")
            or candidate.get("answer")
            or candidate.get("option")
            or candidate.get("choice")
            or candidate.get("content")
            or candidate.get("value")
            or ""
        ).strip()
        label = str(
            candidate.get("label")
            or candidate.get("key")
            or candidate.get("letter")
            or candidate.get("id")
            or ""
        ).strip()

        if not answer_text and len(candidate) == 1:
            label, value = next(iter(candidate.items()))
            return str(value).strip(), str(label).strip()

        return answer_text, label

    return str(candidate).strip(), ""


def _candidate_marked_correct(candidate: Any) -> bool:
    if not isinstance(candidate, dict):
        return False
    return (
        _is_correct_flag(candidate.get("is_correct"))
        or _is_correct_flag(candidate.get("correct"))
        or _is_correct_flag(candidate.get("isCorrect"))
    )


def _answer_matches_marker(answer_text: str, label: str, marker: str, index: int, correct_index: int | None) -> bool:
    if correct_index is not None and correct_index in {index, index + 1}:
        return True
    if not marker:
        return False

    normalized_marker = marker.casefold()
    return normalized_marker in {
        answer_text.casefold(),
        label.casefold(),
        f"{label}. {answer_text}".strip().casefold(),
        f"{label}) {answer_text}".strip().casefold(),
    }


def _normalize_answers(raw_question: dict) -> list[dict]:
    raw_answers = (
        raw_question.get("answers")
        or raw_question.get("options")
        or raw_question.get("choices")
        or raw_question.get("answer_choices")
        or raw_question.get("answerChoices")
    )
    correct_answer = _correct_answer_marker(raw_question)
    correct_index = _correct_index_marker(raw_question)
    distractors = raw_question.get("distractors") or raw_question.get("incorrect_answers")

    answer_candidates = []
    if isinstance(raw_answers, dict):
        answer_candidates.extend(
            {"label": label, "answer_text": answer}
            for label, answer in raw_answers.items()
        )
    elif isinstance(raw_answers, list):
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

    for index, candidate in enumerate(answer_candidates):
        answer_text, label = _candidate_text_and_label(candidate)
        is_correct = (
            _candidate_marked_correct(candidate)
            or _answer_matches_marker(answer_text, label, correct_answer, index, correct_index)
        )

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
    logger.info(
        "Question-plan input summary: source_chars=%s approx_source_tokens=%s source_preview=%s",
        len(source_content),
        _estimate_tokens(source_content),
        _text_preview(source_content),
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
    parsed = _invoke_llm_json(
        llm,
        prompt,
        "Question-plan",
        validate=lambda data: normalize_question_plans(data, requested_question_count),
    )
    logger.info("Question-plan LLM call finished in %.1fs", time.monotonic() - started_at)
    plans = normalize_question_plans(parsed, requested_question_count)
    if len(plans) != requested_question_count:
        logger.warning(
            "Normalized %s question plans, requested %s",
            len(plans),
            requested_question_count,
        )
    else:
        logger.info("Normalized %s question plans", len(plans))
    logger.info(
        "Question-plan output preview: %s",
        json.dumps(_question_plan_log_preview(plans), ensure_ascii=False),
    )
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

    questions = []
    total_batches = (len(question_plans) + MAX_DISTRACTOR_BATCH_SIZE - 1) // MAX_DISTRACTOR_BATCH_SIZE

    for batch_number, start_index, batch_plans in _iter_batches(question_plans, MAX_DISTRACTOR_BATCH_SIZE):
        batch_context = f"Distractor batch {batch_number}/{total_batches}"
        logger.info(
            "%s input summary: global_start=%s batch_size=%s plan_preview=%s",
            batch_context,
            start_index + 1,
            len(batch_plans),
            json.dumps(_question_plan_log_preview(batch_plans), ensure_ascii=False),
        )
        prompt = create_distractor_generation_prompt(batch_plans, difficulty, language)
        started_at = time.monotonic()
        logger.info("Calling LLM for final questions and distractors: %s", batch_context)
        parsed = _invoke_llm_json(
            llm,
            prompt,
            batch_context,
            validate=lambda data, expected=len(batch_plans): _validate_generated_question_count(data, expected),
        )
        logger.info("%s LLM call finished in %.1fs", batch_context, time.monotonic() - started_at)
        batch_questions = normalize_generated_questions(parsed, len(batch_plans))
        logger.info(
            "%s normalized %s questions; first_question=%s",
            batch_context,
            len(batch_questions),
            _text_preview(batch_questions[0]["question_text"]) if batch_questions else "none",
        )
        questions.extend(batch_questions)

    logger.info("Normalized %s final quiz questions across %s batches", len(questions), total_batches)
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
