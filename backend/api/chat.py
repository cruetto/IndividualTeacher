import traceback
from flask import Blueprint, jsonify, request

from core.llm import get_llm_client

chat_routes = Blueprint('chat', __name__)


@chat_routes.route('/api/chat', methods=['POST'])
def handle_chat():
    """Handles chat messages, providing context to the AI."""
    groq = get_llm_client()
    if not groq:
        return jsonify({"error": "AI chat service is not configured."}), 503

    try:
        data = request.get_json()
        if not data: return jsonify({"error": "Request body must contain JSON data"}), 400

        user_message = data.get('message')
        context = data.get('context', {}) 

        if not user_message: return jsonify({"error": "Missing 'message'"}), 400

        prompt_parts = ["You are a helpful quiz assistant."]
        if context.get('quizTitle'): prompt_parts.append(f"The user is interacting with the quiz titled '{context['quizTitle']}'.")
        if context.get('questionText'):
            prompt_parts.append(f"The current question is: \"{context['questionText']}\"")
            if context.get('options'):
                 options_str = ", ".join([f"'{opt}'" for opt in context['options']])
                 prompt_parts.append(f"Options: {options_str}.")
     
            if context.get('isReviewMode'):
                 prompt_parts.append("\nThe user is currently reviewing their answer to this question.")
                 user_answer = context.get('userAnswerText')
                 correct_answer = context.get('correctAnswerText')
                 was_correct = context.get('wasCorrect')
                 if user_answer is not None:
                     correctness_str = "correct" if was_correct else "incorrect"
                     prompt_parts.append(f"They previously answered '{user_answer}', which was {correctness_str}.")
                     if not was_correct and correct_answer: prompt_parts.append(f"The correct answer is '{correct_answer}'.")
                 else:
                     prompt_parts.append("They did not answer this question during the quiz.")
                     if correct_answer: prompt_parts.append(f"The correct answer is '{correct_answer}'.")
                 prompt_parts.append("Focus on explaining why the correct answer is right or why their answer was wrong based on their query.")
            else: 
                 prompt_parts.append("\nThe user is actively taking the quiz and asking about this question.")
                 prompt_parts.append("Provide helpful hints or conceptual explanations related ONLY to the question or its options. DO NOT REVEAL THE CORRECT ANSWER directly.")
        else: 
            prompt_parts.append("\nThe user is asking a general question, possibly about the quiz topic.")

        prompt_parts.append(f"\nUser's message: \"{user_message}\"")
        prompt_parts.append("\nAssistant's concise and helpful response:")
        final_prompt = "\n".join(prompt_parts)


        try:
            response = groq.invoke(final_prompt)
            ai_reply = response.content

        except Exception as ai_error:
             print(f"Error calling GROQ API for chat: {ai_error}")
             traceback.print_exc()
             user_message = f"Failed to get reply from AI service: {ai_error}"
             if "api key" in str(ai_error).lower() or "permission denied" in str(ai_error).lower(): user_message = "AI service authentication failed."
             return jsonify({"error": user_message}), 503

        return jsonify({"reply": ai_reply})

    except Exception as e:
        print(f"Unexpected error in /api/chat endpoint: {e}")
        traceback.print_exc()
        return jsonify({"error": "An unexpected server error occurred in chat."}), 500