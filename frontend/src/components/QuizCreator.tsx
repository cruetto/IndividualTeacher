
import React, { useState } from 'react';
import { Form, Button, Container, Row, Col, Alert, Spinner } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import { QuizData } from '../interfaces/interfaces';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL as string;

interface Props {

  onQuizCreated: (newQuiz: QuizData | null) => void;
}

const QuizCreator: React.FC<Props> = ({ onQuizCreated }) => {
    const [title, setTitle] = useState('');
    const [topic, setTopic] = useState('');
    const [numQuestions, setNumQuestions] = useState(5);
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
        if (numQuestions < 1 || numQuestions > 150) { setError("Number of questions must be between 1 and 150."); return; }

        setIsLoading(true);
        setGenerationProgress(0);
        setGenerationStatus("");

        try {
            const formData = new FormData();
            formData.append('title', title.trim());
            formData.append('topic', topic.trim());
            formData.append('difficulty', difficulty.toString());
            formData.append('language', language);
            formData.append('num_questions', numQuestions.toString());
            if (pdfFile) {
                formData.append('pdf', pdfFile);
            }

            const streamResponse = await fetch(`${API_BASE_URL}/api/quizzes/generate-stream`, {
                method: 'POST',
                credentials: 'include',
                body: formData
            });

            if (!streamResponse.ok) {
                const errorText = await streamResponse.text();
                let parsedError: { error?: string } | null = null;
                try {
                    parsedError = JSON.parse(errorText);
                } catch {
                    parsedError = null;
                }
                throw new Error(parsedError?.error || errorText || "Failed to create quiz via AI.");
            }

            const reader = streamResponse.body?.getReader();
            if (!reader) {
                throw new Error("No quiz generation stream received");
            }

            const decoder = new TextDecoder();
            let buffer = '';
            const finalQuizRef: { current: QuizData | null } = { current: null };

            const processStreamEvent = (eventText: string) => {
                if (!eventText.startsWith('data: ')) {
                    return;
                }

                const data = JSON.parse(eventText.substring(6));

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
                    finalQuizRef.current = data.quiz;
                }
            };

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const events = buffer.split('\n\n');
                buffer = events.pop() || '';

                for (const eventText of events) {
                    processStreamEvent(eventText);
                }
            }

            if (buffer.trim()) {
                processStreamEvent(buffer.trim());
            }

            if (!finalQuizRef.current) {
                throw new Error("No quiz data received");
            }

            const newQuizData = finalQuizRef.current;
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
            if (err instanceof Error) {
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
                        Enter a title and topic instructions, optionally with a PDF document.
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
                                value={numQuestions}
                                onChange={(e) => {
                                    setNumQuestions(parseInt(e.target.value, 10));
                                }}
                                disabled={isLoading}
                            >
                                {Array.from({length: 150}, (_, i) => i + 1).map(n => (
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
