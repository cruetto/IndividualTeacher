import React, { useState } from 'react';
import { VideoRecommendation, QuestionRecommendations } from '../interfaces/recommendations';

interface Props {
    recommendations: QuestionRecommendations;
}

const VideoRecommendations: React.FC<Props> = ({ recommendations }) => {
    const [expandedVideo, setExpandedVideo] = useState<string | null>(null);
    
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

    const toggleVideo = (id: string) => {
        setExpandedVideo(expandedVideo === id ? null : id);
    };

    return (
        // ✅ Adjust maxWidth to make it wider or narrower. This will always stay perfectly centered.
        <div 
            className="mt-4" 
            style={{ 
                maxWidth: '800px', 
                marginLeft: 'auto',
                marginRight: 'auto',
                transform: 'translateX(calc(-50% + 300px))' // ✅ Smart centering inside quiz container
            }}
        >
            {recommendations.recommendations.length === 0 ? null : (
                <div className="list-group">
                    {recommendations.recommendations.map((rec, idx) => (
                        <div key={idx} className="list-group-item px-3 py-3">
                            
                            <div 
                                className="row gx-3 align-items-center"
                                onClick={() => toggleVideo(`${rec.video_id}-${rec.start_time}`)}
                                style={{ cursor: 'pointer' }}
                            >
                                
                                {/* Thumbnail / Video preview */}
                                <div className="col-3 col-md-2">
                                    <img 
                                        src={`https://i.ytimg.com/vi/${rec.video_id}/hqdefault.jpg`}
                                        alt={rec.video_title}
                                        className="img-fluid rounded"
                                        style={{ objectFit: 'cover', height: '55px', width: '100%' }}
                                    />
                                </div>

                                {/* Main content */}
                                <div className="col-7 col-md-8">
                                    <div className="fw-bold small">{rec.video_title}</div>
                                    <div className="text-muted small">
                                        <span>⏱️ {formatTime(rec.start_time)} — {formatTime(rec.end_time)}</span>
                                    </div>
                                    <div className="mt-1 text-muted small">
                                        {rec.text.length > 75 
                                            ? `${rec.text.substring(0, 75)}...` 
                                            : rec.text}
                                    </div>
                                </div>

                                {/* Match percentage */}
                                <div className="col-2 col-md-2 text-end">
                                    <span className={`badge ${getScoreColor(rec.relevance_score)} rounded-pill`}>
                                        {Math.round(rec.relevance_score * 100)}%
                                    </span>
                                </div>
                                
                            </div>

                            {/* Embedded YouTube Player */}
                            {expandedVideo === `${rec.video_id}-${rec.start_time}` && (
                                <div className="mt-3 ratio ratio-16x9">
                                    <iframe
                                        src={`https://www.youtube.com/embed/${rec.video_id}?start=${Math.floor(rec.start_time)}&autoplay=1`}
                                        title={rec.video_title}
                                        frameBorder="0"
                                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                        allowFullScreen
                                    ></iframe>
                                </div>
                            )}

                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default VideoRecommendations;