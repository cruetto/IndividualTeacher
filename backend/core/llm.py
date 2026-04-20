import os
import json
import uuid
from langchain_core.output_parsers import JsonOutputParser

_llm_client = None
json_parser = JsonOutputParser()


def get_llm_client(model: str = "llama-3.3-70b-versatile", temperature: float = 0.7, top_p: float = 0.9):
    """
    Returns LLM client with configurable parameters.
    """
    try:
        from langchain_groq import ChatGroq
        
        groq_api_key = os.environ.get("GROQ_API_KEY")
        if not groq_api_key:
            print("WARNING: GROQ_API_KEY is not set.")
            return None
        
        return ChatGroq(
            model=model,
            temperature=temperature,
            model_kwargs={
                "top_p": top_p
            },
            api_key=groq_api_key,
            timeout=30,
            max_retries=2
        )
    except Exception as e:
        print(f"Error initializing LLM client: {e}")
        return None


def get_available_groq_models():
    """Curated list of FREE working models only - no dynamic API calls"""
    return [
        {
            "id": "llama-3.3-70b-versatile",
            "name": "Meta / Llama 3.3 70B Versatile",
            "context_window": 131072,
            "max_completion_tokens": 32768
        },
        {
            "id": "llama-3.1-8b-instant",
            "name": "Meta / Llama 3.1 8B Instant",
            "context_window": 131072,
            "max_completion_tokens": 131072
        },
        {
            "id": "meta-llama/llama-4-scout-17b-16e-instruct",
            "name": "Meta / Llama 4 Scout 17B",
            "context_window": 131072,
            "max_completion_tokens": 8192
        }
    ]


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# NEW V2 QUIZ GENERATION SYSTEM - TWO STEP PIPELINE
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def create_fact_extraction_prompt(source: str, requested_fact_count: int) -> str:
    """Prompt for step 1: Extract or generate facts sorted by importance"""
    return f"""
Extract all important facts and knowledge points from the following content.
If the content is just a topic name instead of text, generate accurate general knowledge facts about that topic.

Content:
{source}

Instructions:
1. Generate EXACTLY {requested_fact_count} facts
2. Extract EVERY SINGLE testable fact from this content
3. Do not skip anything. Extract absolutely everything that can be tested.
4. Each fact must be a single clear standalone statement
5. Every fact must contain actual testable knowledge
6. Do not add any explanations, comments or extra text

Return ONLY a JSON object with single key "facts" containing array of strings.
Example output:
{{
  "facts": [
    "First most important fact here",
    "Second important fact here",
    "Third fact here"
  ]
}}
""".strip()


def create_question_from_fact_prompt(fact: str, difficulty: int) -> str:
    """Prompt for step 2: Generate single question from one individual fact"""
    difficulty_rules = [
        "Distractors are obviously wrong, very different from correct answer",
        "Distractors are clearly incorrect",
        "Distractors are somewhat plausible",
        "Distractors are very similar to correct answer, hard to distinguish",
        "Distractors are almost identical, expert level difficulty"
    ][difficulty-1]

    return f"""
Create one multiple choice question based EXCLUSIVELY on this fact:
FACT: {fact}

Instructions:
- The correct answer must be exactly the information from the fact
- Create 3 incorrect distractors following difficulty rules
- Difficulty level {difficulty}/5: {difficulty_rules}
- Do not mention the word "fact" in the question
- Create natural question that tests knowledge of this fact

Return ONLY a JSON object following this structure:
{{
  "question_text": "Question text here",
  "answers": [
    {{ "answer_text": "Correct answer", "is_correct": true }},
    {{ "answer_text": "Distractor 1", "is_correct": false }},
    {{ "answer_text": "Distractor 2", "is_correct": false }},
    {{ "answer_text": "Distractor 3", "is_correct": false }}
  ]
}}
""".strip()


def extract_facts(source: str, target_question_count: int | None = None) -> list[str]:
    """Extract facts from source text or topic name"""
    
    if target_question_count is None:
        # Auto mode: Extract EVERYTHING, maximum possible facts
        requested_facts = 150
    else:
        requested_facts = max(int(target_question_count * 1.6), 8)
    
    llm = get_llm_client(temperature=0.2)
    if not llm:
        raise RuntimeError("LLM client not available")
    
    prompt = create_fact_extraction_prompt(source, requested_facts)
    response = llm.invoke(prompt)
    
    content = response.content.strip()
    
    print(f"\n📥 LLM RESPONSE FOR FACTS:\n{repr(content[:1500])}\n{'...' if len(content) > 1500 else ''}\n")
    
    # Fix for markdown code blocks with no language specified
    if content.startswith("```"):
        content = content.split('\n', 1)[1] if '\n' in content else content[3:]
    if content.endswith("```"):
        content = content[:-3]
    
    if content.startswith("```json"): content = content[7:]
    if content.endswith("```"): content = content[:-3]
    
    content = content.strip()
    
    try:
        result = json.loads(content)
        return result.get("facts", [])
    except json.JSONDecodeError:
        # Fallback: extract facts manually if LLM didn't return proper JSON
        print(f"⚠️ JSON decode failed, attempting manual fact extraction")
        facts = []
        for line in content.split('\n'):
            line = line.strip()
            if line and not line.startswith('{') and not line.startswith('[') and not line.startswith('}') and not line.startswith(']'):
                if len(line) > 20:
                    facts.append(line)
        return facts[:requested_facts]


def generate_question_for_fact(fact: str, difficulty: int = 3) -> dict:
    """Generate single question from one individual fact"""
    llm = get_llm_client(temperature=0.7)
    if not llm:
        raise RuntimeError("LLM client not available")
    
    prompt = create_question_from_fact_prompt(fact, difficulty)
    response = llm.invoke(prompt)
    
    content = response.content.strip()
    if content.startswith("```json"): content = content[7:]
    if content.endswith("```"): content = content[:-3]
    
    question_data = json.loads(content.strip())
    
    question_data['id'] = str(uuid.uuid4())
    question_data['type'] = 'multiple_choice'
    
    for answer in question_data['answers']:
        answer['id'] = str(uuid.uuid4())
    
    return question_data


def generate_quiz(source: str, question_count: int | None = None, difficulty: int = 3) -> list[dict]:
    """
    Two Step Quiz Generation Pipeline
    
    Args:
        source: PDF text OR topic name
        question_count: Number of questions, or None for Auto detect mode
        difficulty: 1-5 difficulty level (applies to distractors)
    
    Returns:
        List of quiz questions
    """
    facts = extract_facts(source, question_count)
    
    print(f"\n✅ Extracted {len(facts)} total facts from source")
    
    if question_count is not None:
        facts = facts[:question_count]
        print(f"✅ Selected top {len(facts)} best facts for quiz")
    
    questions = []
    for fact in facts:
        try:
            questions.append(generate_question_for_fact(fact, difficulty))
        except Exception:
            continue
    
    return questions


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# BACKWARDS COMPATIBILITY STUBS - FOR EXISTING API
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def create_quiz_prompt(topic: str, num_questions: int, difficulty: int = 3) -> str:
    """Deprecated: Stub for backwards compatibility"""
    return ""

def parse_ai_quiz_response(ai_response_content):
    """Deprecated: Stub for backwards compatibility"""
    return []
