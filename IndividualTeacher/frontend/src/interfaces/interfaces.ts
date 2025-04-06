// frontend/src/types.ts
export interface AnswerOption {
    answer_text: string;
    is_correct: boolean;

}

  

export interface Question {
    id: number; // Unique identifier for the question
    // Type to determine how the question is rendered and graded
    type: 'multiple_choice' | 'simple_question' | 'fill_in_the_blank' | string; // Use specific types or string for flexibility
    question_text: string;
    answers: AnswerOption[]; // Array of options, primarily for multiple_choice
   
}



export interface QuizData {
    id: number; // Use string if using UUIDs from backend
    title: string;
    questions: Question[];
    // Optional metadata
    description?: string;
    topic?: string;

}
  

