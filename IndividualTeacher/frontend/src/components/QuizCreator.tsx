// frontend/src/components/QuizCreator.tsx
import React, { useState } from 'react';
import { Form, Button, Container, Row, Col, Alert, Spinner } from 'react-bootstrap';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { QuizData } from '../interfaces/interfaces'; // Adjust path if needed

const API_BASE_URL = 'http://localhost:5001'; // Ensure this matches backend

interface Props {
  onQuizCreated: () => void; // Callback to notify App.tsx to refresh list
}

const QuizCreator: React.FC<Props> = ({ onQuizCreated }) => {
    const [title, setTitle] = useState('');
    const [topic, setTopic] = useState('');
    const [numQuestions, setNumQuestions] = useState(5); // Default number
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const navigate = useNavigate();

    const handleGenerateQuiz = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault(); // Prevent default form submission
        setError(null);
        setSuccessMessage(null); // Clear previous success message

        if (!title.trim()) { setError("Please provide a title."); return; }
        if (!topic.trim()) { setError("Please provide a topic."); return; }
        if (numQuestions < 1 || numQuestions > 20) { setError("Number of questions must be between 1 and 20."); return; }

        setIsLoading(true);

        try {
            console.log(`Sending request to generate quiz: Title='${title}', Topic='${topic}', NumQuestions=${numQuestions}`);

            // Make POST request to the backend endpoint
            // The backend now returns the full created quiz object
            const response = await axios.post<QuizData>(`${API_BASE_URL}/api/quizzes/generate`, {
                title: title.trim(),
                topic: topic.trim(),
                num_questions: numQuestions, // Match backend expected key
            });

            console.log("Quiz generated successfully by backend:", response.data);
            setSuccessMessage(`Quiz "${response.data.title}" created successfully! Redirecting...`);
            onQuizCreated(); // Notify App.tsx to refresh the quiz list & potentially select new one

            // Clear form
            setTitle('');
            setTopic('');
            setNumQuestions(5);

            // Navigate back to the main page after a short delay
            setTimeout(() => navigate('/'), 2000); // Navigate after 2 seconds

        } catch (err) {
            console.error("Error creating quiz:", err);
            let message = 'Failed to create quiz via AI.';
            if (axios.isAxiosError(err)) {
                // Prefer backend error message if available
                message = err.response?.data?.error || `Network error or backend unavailable (${err.message})`;
            } else if (err instanceof Error) {
                message = err.message;
            }
            setError(message);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Container className="mt-4"> {/* Reduced top margin slightly */}
            <Row className="justify-content-md-center">
                <Col md={8} lg={7}> {/* Adjusted column size slightly */}
                    <h2 className="mb-3 text-center">Create Quiz with AI</h2>
                    <p className="text-center text-muted mb-4">
                        Enter a title and topic. The AI will generate multiple-choice questions based on the topic.
                    </p>

                    {/* Place messages above the form */}
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
                            <Form.Label>Topic for AI</Form.Label>
                            <Form.Control
                                type="text"
                                placeholder="e.g., Planets, orbits, Kepler's laws"
                                value={topic}
                                onChange={(e) => setTopic(e.target.value)}
                                required
                                disabled={isLoading}
                            />
                            <Form.Text className="text-muted">
                                Be reasonably specific for better results.
                            </Form.Text>
                        </Form.Group>

                        <Form.Group className="mb-3" controlId="numQuestions">
                            <Form.Label>Number of Questions</Form.Label>
                            <Form.Control
                                type="number"
                                value={numQuestions}
                                onChange={(e) => setNumQuestions(parseInt(e.target.value, 10) || 1)}
                                min="1"
                                max="20" // Keep reasonable limits
                                required
                                disabled={isLoading}
                            />
                        </Form.Group>

                        <div className="d-grid"> {/* Makes button full width */}
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
}

export default QuizCreator;