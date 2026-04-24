

export interface AnswerOption {
    id: string;
    answer_text: string;
    is_correct: boolean;
}

export interface Question {
    id: string;
    question_text: string;
    type: 'multiple_choice';
    answers: AnswerOption[];
}

export interface QuizData {
    id: string;
    title: string;
    topic?: string;
    questions: Question[];
    userId?: string | null;

}


export interface DisplayAnswer extends AnswerOption { originalIndex: number; }
export interface DisplayQuestion extends Omit<Question, 'answers'> {
    originalIndex: number;
    answers: DisplayAnswer[];
}


export interface User {
    id: string;
    email: string;
    name: string;
    picture?: string;
}


export type AllUserAnswers = Record<string, number[]>;


export interface ChatContext {
    quizTitle?: string;
    questionText?: string;
    options?: string[];
    isReviewMode?: boolean;
    userAnswerText?: string | null;
    correctAnswerText?: string;
    wasCorrect?: boolean;
}