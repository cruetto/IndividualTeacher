import React from 'react';
import { QuestionRecommendations } from '../interfaces/recommendations';

interface Props {
    recommendations: QuestionRecommendations;
}

const VideoRecommendations: React.FC<Props> = ({ recommendations }) => {
    
    const formatTime = (seconds: number): string => {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const getScoreColor = (score: number): string => {
        if (score > 0.8) return 'bg-success';
        if (score > 0.6) return 'bg-primary';
        if (score > 0.4) return 'bg-warning text-dark';
        return 'bg-secondary';
    };

    return (
        <div 
            className="mt-4" 
            style={{ 
                width: '160%', 
                marginLeft: 'auto',
                marginRight: 'auto',
                transform: 'translateX(calc(-50% + 300px))'
            }}
        >
            {recommendations.recommendations.length === 0 ? (
                <div className="card text-center py-5">
                    <div className="card-body">
                        <h5 className="text-muted mb-3">No recommended videos available</h5>
                        <p className="text-muted small mb-0">
                            We couldn't find matching video explanations for this question at the moment.
                        </p>
                    </div>
                </div>
            ) : (
                <div className="list-group">
                    {recommendations.recommendations.map((rec, idx) => (
                        <div key={idx} className="list-group-item px-3 py-3 mb-2">
                            
                            <div className="row gx-3">
                                
                                {/* Left side: Video Player */}
                                <div className="col-md-5">
                                    <div className="ratio ratio-16x9">
                                        <iframe
                                            src={`https://www.youtube.com/embed/${rec.video_id}?start=${Math.floor(rec.start_time)}`}
                                            title={rec.video_title}
                                            frameBorder="0"
                                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                            allowFullScreen
                                        ></iframe>
                                    </div>
                                </div>

                                {/* Right side: Information */}
                                <div className="col-md-7">
                                    <div className="fw-bold">{rec.video_title}</div>
                                    <div className="text-muted small mt-1">
                                        ⏱️ {formatTime(rec.start_time)} — {formatTime(rec.end_time)}
                                    </div>
                                    <div className="mt-2 text-muted small">
                                        {rec.text}
                                    </div>
                                    <div className="mt-2 text-end">
                                        <span className={`badge ${getScoreColor(rec.relevance_score)} rounded-pill`}>
                                            {Math.round(rec.relevance_score * 100)}% match
                                        </span>
                                    </div>
                                </div>
                                
                            </div>

                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default VideoRecommendations;
