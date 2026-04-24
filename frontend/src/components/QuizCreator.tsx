
import React, { useState } from 'react';
import { Form, Button, Container, Row, Col, Alert, Spinner } from 'react-bootstrap';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { QuizData } from '../interfaces/interfaces';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL as string;

interface Props {

  onQuizCreated: (newQuiz: QuizData | null) => void;
}

const QuizCreator: React.FC<Props> = ({ onQuizCreated }) => {
    const [title, setTitle] = useState('');
    const [topic, setTopic] = useState('');
    const [numQuestions, setNumQuestions] = useState<number | null>(5);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const [pdfFile, setPdfFile] = useState<File | null>(null);
    const [difficulty, setDifficulty] = useState(3);
    const [language, setLanguage] = useState("Lithuanian");
    const [generationProgress, setGenerationProgress] = useState(0);
    const [generationStatus, setGenerationStatus] = useState("");
    const navigate = useNavigate();


    const handleGenerateQuiz = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setError(null);
        setSuccessMessage(null);


        if (!title.trim()) { setError("Please provide a title."); return; }
        if (!pdfFile && !topic.trim()) { setError("Please provide either topic instructions or upload a PDF document."); return; }
        if (numQuestions !== null && (numQuestions < 1 || numQuestions > 100)) { setError("Number of questions must be between 1 and 100."); return; }

        setIsLoading(true);
        setGenerationProgress(0);
        setGenerationStatus("");

        try {
            let response;

            if (pdfFile) {
                console.log(`Generating quiz with topic + PDF: ${pdfFile.name}`);
                const formData = new FormData();
                formData.append('pdf', pdfFile);
                formData.append('title', title.trim());
                formData.append('topic', topic.trim());
                formData.append('language', language);
                if (numQuestions !== null) {
                    formData.append('num_questions', numQuestions.toString());
                }

                response = await axios.post<QuizData>(
                    `${API_BASE_URL}/api/quizzes/generate-from-pdf`,
                    formData,
                    { 
                        headers: { 'Content-Type': 'multipart/form-data' },
                        withCredentials: true,
                        onDownloadProgress: (progressEvent) => {
                            if (progressEvent.total) {
                                const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
                                setGenerationProgress(percent);
                            }
                        }
                    }
                );
            } else {
                console.log(`Sending request to generate quiz: Title='${title}', Topic='${topic}', NumQuestions=${numQuestions}`);


                const streamResponse = await fetch(`${API_BASE_URL}/api/quizzes/generate-stream`, {
                    method: 'POST',
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        title: title.trim(),
                        topic: topic.trim(),
                        num_questions: numQuestions,
                        difficulty: difficulty,
                        language: language
                    })
                });

                const reader = streamResponse.body?.getReader();
                const decoder = new TextDecoder();
                let buffer = '';
                let finalQuiz: any = null;

                if (reader) {
                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;

                        buffer += decoder.decode(value, { stream: true });
                        const lines = buffer.split('\n\n');
                        buffer = lines.pop() || '';

                        for (const line of lines) {
                            if (line.startsWith('data: ')) {
                                const data = JSON.parse(line.substring(6));

                                if (data.error) {
                                    throw new Error(data.error);
                                }

                                if (data.progress !== undefined) {
                                    setGenerationProgress(data.progress);
                                }

                                if (data.status) {
                                    setGenerationStatus(data.status);
                                }

                                if (data.complete) {
                                    finalQuiz = data.quiz;
                                }
                            }
                        }
                    }
                }

                if (!finalQuiz) {
                    throw new Error("No quiz data received");
                }

                response = { data: finalQuiz };
            }

            const newQuizData = response.data;
            console.log("Quiz generated successfully by backend:", newQuizData);

            setSuccessMessage(`Quiz "${newQuizData.title}" created successfully! Redirecting...`);
            onQuizCreated(newQuizData);


            setTimeout(() => {
                if (newQuizData) {
                    navigate('/');
                }
            }, 1000);


        } catch (err) {
            console.error("Error creating quiz:", err);
            let message = 'Failed to create quiz via AI.';
            if (axios.isAxiosError(err)) {
                message = err.response?.data?.error || `Network error or backend unavailable (${err.message})`;
            } else if (err instanceof Error) {
                message = err.message;
            }
            setError(message);
             onQuizCreated(null);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Container className="mt-4">
            <Row className="justify-content-md-center">
                <Col md={8} lg={7}>
                    <h2 className="mb-3 text-center">Create Quiz with AI</h2>
                    <p className="text-center text-muted mb-4">
                        Enter a title and topic. The AI will generate multiple-choice questions based on the topic.
                    </p>


                    {error && <Alert variant="danger" onClose={() => setError(null)} dismissible>{error}</Alert>}
                    {successMessage && <Alert variant="success">{successMessage}</Alert>}

                    <Form onSubmit={handleGenerateQuiz}>

                        <Form.Group className="mb-3" controlId="quizTitle">
                            <Form.Label>Quiz Title</Form.Label>
                            <Form.Control
                                type="text"
                                placeholder="e.g., Introduction to Solar System"
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                required
                                disabled={isLoading}
                            />
                        </Form.Group>

        <Form.Group className="mb-3" controlId="quizTopic">
            <Form.Label>Topic / Instructions</Form.Label>
            <Form.Control
                type="text"
                as="textarea"
                rows={3}
                placeholder="Describe what should the quiz be about. You can also upload a PDF document below."
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                disabled={isLoading}
            />
            <Form.Text className="text-muted">
                Optional: Instructions, focus areas or additional context. You can leave this empty if only using PDF.
            </Form.Text>
        </Form.Group>

        <Form.Group className="mb-3" controlId="pdfFile">
            <Form.Label>PDF Document (Optional)</Form.Label>
            <Form.Control
                type="file"
                accept=".pdf"
                onChange={(e) => {
                    const target = e.target as HTMLInputElement;
                    setPdfFile(target.files ? target.files[0] : null);
                }}
                disabled={isLoading}
            />
            <Form.Text className="text-muted">
                Optional: Upload a PDF document. Text, images, diagrams and charts will be automatically analyzed.
            </Form.Text>
            {pdfFile && (
                <div className="mt-2 text-success">
                    Selected: {pdfFile.name} ({(pdfFile.size / 1024 / 1024).toFixed(2)} MB)
                </div>
            )}
        </Form.Group>


                        <Form.Group className="mb-3" controlId="numQuestions">
                            <Form.Label>Number of Questions</Form.Label>
                            <Form.Select
                                value={numQuestions === null ? "auto" : numQuestions}
                                onChange={(e) => {
                                    const val = e.target.value;
                                    if (val === "auto") {
                                        setNumQuestions(null);
                                    } else {
                                        setNumQuestions(parseInt(val, 10));
                                    }
                                }}
                                disabled={isLoading}
                            >
                                <option value="auto">Auto (Extract all facts)</option>
                                {Array.from({length: 100}, (_, i) => i + 1).map(n => (
                                    <option key={n} value={n}>{n} Questions</option>
                                ))}
                            </Form.Select>
                        </Form.Group>

                        <Form.Group className="mb-3">
                            <Form.Label>Difficulty: {difficulty}/5</Form.Label>
                            <Form.Range
                                value={difficulty}
                                onChange={(e) => setDifficulty(parseInt(e.target.value))}
                                min={1}
                                max={5}
                                disabled={isLoading}
                            />
                            <div className="d-flex justify-content-between text-muted small">
                                <span>Very Easy</span>
                                <span>Normal</span>
                                <span>Expert</span>
                            </div>
                        </Form.Group>

                        <Form.Group className="mb-3" controlId="language">
                            <Form.Label>Output Language</Form.Label>
                            <Form.Select
                                value={language}
                                onChange={(e) => setLanguage(e.target.value)}
                                disabled={isLoading}
                            >
                                <option value="Lithuanian">Lietuvių</option>
                                <option value="English">English</option>
                            </Form.Select>
                        </Form.Group>

                        {isLoading && (
                            <div className="mb-3">
                                <div className="d-flex justify-content-between mb-1">
                                    <span className="text-muted small">{generationStatus}</span>
                                    <span className="text-muted small">{Math.round(generationProgress)}%</span>
                                </div>
                                <div className="progress" style={{height: '8px'}}>
                                    <div
                                        className="progress-bar progress-bar-striped progress-bar-animated"
                                        role="progressbar"
                                        style={{width: `${generationProgress}%`}}
                                        aria-valuenow={generationProgress}
                                        aria-valuemin={0}
                                        aria-valuemax={100}
                                    >
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className="d-grid">
                            <Button variant="primary" type="submit" disabled={isLoading}>
                                {isLoading ? (
                                    <>
                                        <Spinner as="span" animation="border" size="sm" role="status" aria-hidden="true"/>
                                        <span className="ms-2">Generating Quiz...</span>
                                    </>
                                ) : (
                                    'Generate & Save Quiz'
                                )}
                            </Button>
                        </div>
                    </Form>
                </Col>
            </Row>
        </Container>
    );
};

export default QuizCreator;
