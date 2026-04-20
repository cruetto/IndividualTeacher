// frontend/src/components/QuizCreator.tsx
import React, { useState } from 'react';
import { Form, Button, Container, Row, Col, Alert, Spinner } from 'react-bootstrap';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { QuizData } from '../interfaces/interfaces'; // Adjust path if needed

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL as string; // Backend URL

interface Props {
  // Expects the new quiz data, or null if creation failed unexpectedly before getting data
  onQuizCreated: (newQuiz: QuizData | null) => void;
}

const QuizCreator: React.FC<Props> = ({ onQuizCreated }) => {
    const [title, setTitle] = useState('');
    const [topic, setTopic] = useState('');
    const [numQuestions, setNumQuestions] = useState(5); // Default number
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const [pdfFile, setPdfFile] = useState<File | null>(null);
    const [mode, setMode] = useState<'text' | 'pdf'>('text');
    const navigate = useNavigate();

    const handleGenerateQuiz = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault(); // Prevent default form submission
        setError(null);
        setSuccessMessage(null); // Clear previous success message

        // Basic validation
        if (!title.trim()) { setError("Please provide a title."); return; }
        if (!pdfFile && !topic.trim()) { setError("Please provide either topic instructions or upload a PDF document."); return; }
        if (numQuestions < 1 || numQuestions > 20) { setError("Number of questions must be between 1 and 20."); return; }

        setIsLoading(true);

        try {
            let response;

            if (pdfFile) {
                console.log(`Generating quiz with topic + PDF: ${pdfFile.name}`);
                const formData = new FormData();
                formData.append('pdf', pdfFile);
                formData.append('title', title.trim());
                formData.append('topic', topic.trim());
                formData.append('num_questions', numQuestions.toString());

                response = await axios.post<QuizData>(
                    `${API_BASE_URL}/api/quizzes/generate-from-pdf`,
                    formData,
                    { headers: { 'Content-Type': 'multipart/form-data' } }
                );
            } else {
                console.log(`Sending request to generate quiz: Title='${title}', Topic='${topic}', NumQuestions=${numQuestions}`);

                // Make POST request to the backend endpoint
                response = await axios.post<QuizData>(`${API_BASE_URL}/api/quizzes/generate`, {
                    title: title.trim(),
                    topic: topic.trim(),
                    num_questions: numQuestions,
                });
            }

            const newQuizData = response.data; // The backend returns the created quiz
            console.log("Quiz generated successfully by backend:", newQuizData);

            setSuccessMessage(`Quiz "${newQuizData.title}" created successfully! Redirecting...`);
            onQuizCreated(newQuizData); // Notify App.tsx and pass the data

           
            setTimeout(() => {
                if (newQuizData) { // Check if still valid before navigating
                    navigate('/'); // Navigate home
                }
            }, 1000); // Small delay (e.g., 100ms)
            // navigate('/'); 

        } catch (err) {
            console.error("Error creating quiz:", err);
            let message = 'Failed to create quiz via AI.';
            if (axios.isAxiosError(err)) {
                message = err.response?.data?.error || `Network error or backend unavailable (${err.message})`;
            } else if (err instanceof Error) {
                message = err.message;
            }
            setError(message);
             onQuizCreated(null); // Notify App creation failed (or didn't return data)
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
};

export default QuizCreator;