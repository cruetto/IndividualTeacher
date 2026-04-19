import os
import json
import uuid
from langchain_core.output_parsers import JsonOutputParser

_llm_client = None
json_parser = JsonOutputParser()


def get_llm_client():
    """
    Initializes and returns a single instance of the LLM client.
    """
    global _llm_client
    if _llm_client is None:
        print("--- Initializing LLM (Llama 3.3 via Groq) client ---")
        try:
            from langchain_groq import ChatGroq
            
            groq_api_key = os.environ.get("GROQ_API_KEY")
            if not groq_api_key:
                print("WARNING: GROQ_API_KEY is not set.")
                return None
            
            _llm_client = ChatGroq(
                model="llama-3.3-70b-versatile",
                temperature=0,
                api_key=groq_api_key,
                timeout=30,
                max_retries=2
            )
            
            print("--- LLM client initialized successfully. ---")
        except Exception as e:
            print(f"Error initializing LLM client: {e}")
            return None
    return _llm_client


def create_quiz_prompt(topic: str, num_questions: int) -> str:
    """Generates the precise prompt for the LLMs, requesting JSON output for quizzes."""
    prompt = f"""
Generate exactly {num_questions} multiple-choice quiz questions about the topic: "{topic}".

Format the output STRICTLY as a single JSON object. This object must contain ONE key named "questions".
The value of "questions" MUST be a JSON array where each element is a question object.

Each question object in the array MUST have the following fields:
- "id": A unique UUID string generated for this question (e.g., using Python's uuid.uuid4()).
- "type": The string "multiple_choice".
- "question_text": The string containing the question text.
- "answers": A JSON array containing exactly 4 answer option objects.

Each answer option object in the "answers" array MUST have the following fields:
- "id": A unique UUID string generated for this answer option (e.g., using Python's uuid.uuid4()).
- "answer_text": The string containing the answer text.
- "is_correct": A boolean value (true for ONLY ONE answer per question, false for the others).

Example of a single question object within the "questions" array:
{{
  "id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "type": "multiple_choice",
  "question_text": "What is the powerhouse of the cell?",
  "answers": [
    {{ "id": "a1b2c3d4-...", "answer_text": "Nucleus", "is_correct": false }},
    {{ "id": "e5f6g7h8-...", "answer_text": "Ribosome", "is_correct": false }},
    {{ "id": "i9j0k1l2-...", "answer_text": "Mitochondrion", "is_correct": true }},
    {{ "id": "m3n4o5p6-...", "answer_text": "Chloroplast", "is_correct": false }}
  ]
}}

Ensure the entire output is only the valid JSON object with the "questions" key and its array value. Do not include any other text, explanations, or markdown formatting like ```json ... ```. Generate unique UUIDs for all 'id' fields.
"""
    return prompt.strip()


def parse_ai_quiz_response(ai_response_content):
    """Parse and validate AI quiz generation response"""
    if ai_response_content.startswith("```json"): ai_response_content = ai_response_content[7:]
    if ai_response_content.endswith("```"): ai_response_content = ai_response_content[:-3]
    ai_response_content = ai_response_content.strip();
    
    if not ai_response_content: 
        raise ValueError("AI returned empty content after cleaning.")
    
    generated_data = json.loads(ai_response_content)
    
    if not isinstance(generated_data, dict) or "questions" not in generated_data: 
        raise ValueError("AI JSON missing 'questions' key.")
    
    if not isinstance(generated_data["questions"], list): 
        raise ValueError("'questions' field is not a list.")

    validated_questions = []
    
    for q_data in generated_data["questions"]:
         if isinstance(q_data, dict) and q_data.get("question_text") and isinstance(q_data.get("answers"), list):
              q_data['id'] = q_data.get('id', str(uuid.uuid4())); 
              q_data['type'] = q_data.get('type', 'multiple_choice'); 
              q_data['question_text'] = str(q_data['question_text'])
              
              valid_answers = []
              for a_data in q_data.get("answers", []):
                  if isinstance(a_data, dict) and a_data.get("answer_text") is not None:
                      a_data['id'] = a_data.get('id', str(uuid.uuid4())); 
                      a_data['answer_text'] = str(a_data['answer_text']); 
                      a_data['is_correct'] = bool(a_data.get('is_correct', False))
                      valid_answers.append(a_data)
              
              q_data['answers'] = valid_answers
              if valid_answers: 
                  validated_questions.append(q_data)
         else: 
             print(f"Warning: Skipping invalid question structure: {q_data}")
    
    if not validated_questions: 
        raise ValueError("AI response parsed, but no valid questions found after validation.")
    
    return validated_questions