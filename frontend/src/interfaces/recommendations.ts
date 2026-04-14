export interface VideoRecommendation {
    video_id: string;
    video_title: string;
    text: string;
    start_time: number;
    end_time: number;
    youtube_url: string;
    relevance_score: number;
}

export interface QuestionRecommendations {
    question_text: string;
    recommendations: VideoRecommendation[];
}

export interface RecommendationsResponse {
    [questionId: string]: QuestionRecommendations;
}