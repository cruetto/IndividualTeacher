// frontend/src/components/QuizEditor.tsx
import React, { useState, useEffect} from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Container, Form, Button, ListGroup, Card, InputGroup, Spinner, Alert, Row, Col } from 'react-bootstrap';
import { QuizData, Question, AnswerOption } from '../interfaces/interfaces'; // Adjust path
import { v4 as uuidv4 } from 'uuid'; // For generating new IDs

const API_BASE_URL = 'http://localhost:5001';

interface Props {
    onQuizUpdated: () => void;
}

const QuizEditor: React.FC<Props> = ({ onQuizUpdated }) => {
    const { quizId } = useParams<{ quizId: string }>();
    const navigate = useNavigate();

    // Removed 'quiz' state, only keep the editing copy
    const [editingQuiz, setEditingQuiz] = useState<QuizData | null>(null);
    const [selectedQuestionId, setSelectedQuestionId] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // --- Fetch Quiz Data ---
        // --- Fetch Specific Quiz Data ---
        useEffect(() => {
            const fetchQuiz = async () => {
                setIsLoading(true);
                setError(null);
                setSelectedQuestionId(null); // Reset selection on load
                setEditingQuiz(null);       // Reset editing data on load
    
                if (!quizId) {
                    setError("No Quiz ID provided in URL.");
                    setIsLoading(false);
                    return; // Exit early if no quizId
                }
                try {
                     console.log(`Fetching specific quiz for edit: ${quizId}`);
                     // --- Call the NEW backend endpoint to get a single quiz by ID ---
                     const response = await axios.get<QuizData>(
                         `${API_BASE_URL}/api/quizzes/${quizId}`, // Use the specific ID route
                         { withCredentials: true } // IMPORTANT: Send cookies for authentication
                     );
                     const foundQuiz = response.data; // Directly get the quiz data
    
                    // Backend should have returned 404/403 if not found/owned, but check data just in case
                    if (foundQuiz && foundQuiz.id === quizId) { // Check if we got data and it matches
                        console.log("Found quiz:", JSON.stringify(foundQuiz, null, 2));
                        // Create a deep copy for the editing state to avoid modifying original reference
                        setEditingQuiz(JSON.parse(JSON.stringify(foundQuiz)));
                        // Select the first question by default if available
                        if (foundQuiz.questions.length > 0) {
                            setSelectedQuestionId(foundQuiz.questions[0].id);
                            console.log("Selected first question ID:", foundQuiz.questions[0].id);
                        } else {
                             console.log("Quiz has no questions initially.");
                        }
                    } else {
                         // This case might indicate an unexpected backend response (e.g., 200 OK with no data)
                        setError(`Received unexpected data for quiz ID ${quizId}.`);
                         console.error(`Backend response issue for ID: ${quizId}`, foundQuiz);
                    }
                } catch (err) {
                    // Handle errors from the API call
                    console.error("Error fetching quiz for edit:", err);
                     let message = "Failed to load quiz data for editing.";
                     if (axios.isAxiosError(err)) {
                         // Provide more specific error messages based on status code
                         if (err.response?.status === 404) {
                             message = `Quiz not found, or you don't have permission to edit it.`;
                         } else if (err.response?.status === 401) {
                             message = "Authentication required to edit quizzes. Please log in.";
                             // Optional: redirect to login or prompt login here
                         } else if (err.response?.status === 403) {
                              message = "Permission denied to edit this quiz.";
                         } else {
                             // Use backend error message if available, otherwise Axios message
                             message = err.response?.data?.error || err.message;
                         }
                     } else if (err instanceof Error) {
                         // Handle generic JavaScript errors
                          message = err.message;
                     }
                     setError(message); // Set the error state to display to the user
                } finally {
                    // Ensure loading state is turned off regardless of success/failure
                    setIsLoading(false);
                }
            };
    
            fetchQuiz(); // Execute the fetch function
    
        // Re-run this effect only if the quizId from the URL parameters changes
        }, [quizId]);

    // --- State Update Handlers (Focus on Immutability) ---

    const handleQuizTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newTitle = e.target.value;
        setEditingQuiz(prev => prev ? { ...prev, title: newTitle } : null);
    };

    const handleQuestionSelect = (questionId: string) => {
        console.log("Selected Question ID:", questionId);
        setSelectedQuestionId(questionId);
    };

    // Update question text for the selected question
    const handleQuestionTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newText = e.target.value;
        if (!selectedQuestionId) return;

        setEditingQuiz(prev => {
            if (!prev) return null;
            return {
                ...prev, // Spread previous quiz data
                questions: prev.questions.map(q => { // Create new questions array
                    if (q.id === selectedQuestionId) {
                        // Create new question object if it's the selected one
                        return { ...q, question_text: newText };
                    }
                    return q; // Return unchanged question object otherwise
                })
            };
        });
    };

    // Update answer text for a specific answer within the selected question
    const handleAnswerTextChange = (answerId: string, newText: string) => {
        if (!selectedQuestionId) return;
        console.log(`Changing answer text for A_ID: ${answerId} in Q_ID: ${selectedQuestionId} to: ${newText}`);

        setEditingQuiz(prev => {
            if (!prev) return null;
            return {
                ...prev,
                questions: prev.questions.map(q => { // New questions array
                    if (q.id === selectedQuestionId) {
                        return { // New selected question object
                            ...q,
                            answers: q.answers.map(a => { // New answers array
                                if (a.id === answerId) {
                                    // New answer object if it's the target
                                    return { ...a, answer_text: newText };
                                }
                                return a; // Unchanged answer object
                            })
                        };
                    }
                    return q; // Unchanged question object
                })
            };
        });
    };

    // Toggle the 'is_correct' status for a specific answer
    const handleCorrectAnswerToggle = (answerId: string) => {
        if (!selectedQuestionId) return;
        console.log(`Toggling correct for A_ID: ${answerId} in Q_ID: ${selectedQuestionId}`);

        setEditingQuiz(prev => {
            if (!prev) return null;
            return {
                ...prev,
                questions: prev.questions.map(q => { // New questions array
                    if (q.id === selectedQuestionId) {
                        return { // New selected question object
                            ...q,
                            answers: q.answers.map(a => { // New answers array
                                if (a.id === answerId) {
                                    // New answer object with toggled status
                                    console.log(`  Found answer ${a.id}, toggling is_correct from ${a.is_correct} to ${!a.is_correct}`);
                                    return { ...a, is_correct: !a.is_correct };
                                }
                                return a; // Unchanged answer
                            })
                        };
                    }
                    return q; // Unchanged question
                })
            };
        });
    };

    // Add a new blank answer to the selected question
    const handleAddAnswer = () => {
        if (!selectedQuestionId) return;
        const newAnswer: AnswerOption = {
            id: uuidv4(), // Generate new UUID
            answer_text: '', // Start blank
            is_correct: false,
        };
        console.log(`Adding new answer ${newAnswer.id} to Q_ID: ${selectedQuestionId}`);

        setEditingQuiz(prev => {
            if (!prev) return null;
            return {
                ...prev,
                questions: prev.questions.map(q => { // New questions array
                    if (q.id === selectedQuestionId) {
                        return { // New selected question object
                            ...q,
                            answers: [...q.answers, newAnswer] // New answers array with added answer
                        };
                    }
                    return q; // Unchanged question
                })
            };
        });
    };

    // Delete a specific answer from the selected question
    const handleDeleteAnswer = (answerIdToDelete: string) => {
         if (!selectedQuestionId) return;
         console.log(`Deleting answer A_ID: ${answerIdToDelete} from Q_ID: ${selectedQuestionId}`);

         setEditingQuiz(prev => {
             if (!prev) return null;
             return {
                 ...prev,
                 questions: prev.questions.map(q => { // New questions array
                     if (q.id === selectedQuestionId) {
                         // Ensure we don't delete the very last answer (optional rule)
                         if (q.answers.length <= 1) {
                            console.warn("Cannot delete the last answer option.");
                            return q; // Return question unchanged
                         }
                         return { // New selected question object
                             ...q,
                             answers: q.answers.filter(a => a.id !== answerIdToDelete) // New filtered answers array
                         };
                     }
                     return q; // Unchanged question
                 })
             };
         });
    };

    // Add a new blank question to the quiz
    const handleAddQuestion = () => {
         const newQuestion: Question = {
             id: uuidv4(),
             question_text: '', // Start blank
             type: 'multiple_choice',
             answers: [ // Start with one blank answer
                 { id: uuidv4(), answer_text: '', is_correct: false }
             ]
         };
         console.log(`Adding new question Q_ID: ${newQuestion.id}`);

         setEditingQuiz(prev => prev ? {
             ...prev,
             questions: [...prev.questions, newQuestion] // New questions array with added question
         } : null);

         // Automatically select the new question
         setSelectedQuestionId(newQuestion.id);
    };

    // Delete a specific question from the quiz
    const handleDeleteQuestion = (questionIdToDelete: string) => {
         console.log(`Attempting to delete question Q_ID: ${questionIdToDelete}`);

         setEditingQuiz(prev => {
            if (!prev) return null;
            // Create a new array excluding the question to delete
            const remainingQuestions = prev.questions.filter(q => {
                console.log(`  Comparing filter ID ${q.id} with delete target ${questionIdToDelete}`);
                return q.id !== questionIdToDelete;
            });
            console.log(`  Questions remaining after filter: ${remainingQuestions.length}`);

            // Determine the next question to select
            let nextSelectedId: string | null = null;
            if (selectedQuestionId === questionIdToDelete) { // If deleting the currently selected one
                if (remainingQuestions.length > 0) {
                    // Try to find the index of the deleted one to select the previous/next
                    const deletedIndex = prev.questions.findIndex(q => q.id === questionIdToDelete);
                    if (deletedIndex > 0) { // Select previous if possible
                        nextSelectedId = remainingQuestions[deletedIndex - 1].id;
                    } else { // Select first if deleting the first
                        nextSelectedId = remainingQuestions[0].id;
                    }
                } else {
                    nextSelectedId = null; // No questions left
                }
                 console.log(`  Deleting selected question. Next selected ID will be: ${nextSelectedId}`);
                 setSelectedQuestionId(nextSelectedId); // Update selection state immediately
            } else {
                // If deleting a *different* question, keep the current selection
                nextSelectedId = selectedQuestionId;
            }


            return { // Return the updated quiz state
                 ...prev,
                 questions: remainingQuestions
            };
         });
    };

    // --- Save Changes ---
    const handleSaveChanges = async () => {
        if (!editingQuiz || !quizId) {
            setError("Cannot save, no quiz data loaded.");
            return;
        }
        // Basic Validation Example
        if (!editingQuiz.title.trim()) {
            setError("Quiz title cannot be empty.");
            return;
        }
        for (const q of editingQuiz.questions) {
             if (!q.question_text.trim()) {
                setError(`Question "${q.id}" cannot have empty text.`);
                 setSelectedQuestionId(q.id); // Select the offending question
                return;
             }
              if (!q.answers || q.answers.length === 0) {
                  setError(`Question "${q.question_text}" must have at least one answer.`);
                  setSelectedQuestionId(q.id);
                  return;
              }
              let correctCount = 0;
              for (const a of q.answers) {
                  if (!a.answer_text.trim()) {
                      setError(`Answer text cannot be empty in question "${q.question_text}".`);
                      setSelectedQuestionId(q.id);
                      return;
                  }
                   if (a.is_correct) correctCount++;
              }
              // Enforce at least one correct answer (optional rule)
              // if (correctCount === 0) {
              //    setError(`Question "${q.question_text}" must have at least one correct answer marked.`);
              //    setSelectedQuestionId(q.id);
              //    return;
              // }
        }


        setIsSaving(true);
        setError(null);
        try {
            console.log("Saving updated quiz data:", JSON.stringify(editingQuiz, null, 2));
            // Use PUT request to update the entire quiz document
            await axios.put(`${API_BASE_URL}/api/quizzes/${quizId}`, editingQuiz);
            onQuizUpdated(); // Notify App to refetch
            navigate('/'); // Navigate back to main page after successful save
        } catch (err) {
            console.error("Error saving quiz:", err);
             let message = 'Failed to save quiz changes.';
             if (axios.isAxiosError(err)) message = err.response?.data?.error || err.message;
             else if (err instanceof Error) message = err.message;
            setError(message);
        } finally {
            setIsSaving(false);
        }
    };

    // --- Render ---
    // Find the question object matching the selected ID from the *editing* state
    const selectedQuestion = editingQuiz?.questions.find(q => q.id === selectedQuestionId);

    if (isLoading) return <Container className="text-center mt-5"><Spinner animation="border" role="status"><span className="visually-hidden">Loading Quiz Editor...</span></Spinner></Container>;
    // Handle cases where quiz loading failed or wasn't found
    if (!editingQuiz) return <Container className="mt-5"><Alert variant={error ? "danger" : "warning"}>{error || "Quiz not found or failed to load."}</Alert></Container>;

    return (
        <Container fluid className="mt-4 quiz-editor">
            {/* General Error Display */}
            {error && <Alert variant="danger" onClose={() => setError(null)} dismissible>{error}</Alert>}

            <Row>
                {/* Left Column: Quiz Title & Question List */}
                <Col md={4} className="mb-3">
                    <Card className="h-100"> {/* Make card fill height */}
                        <Card.Header as="h4">Edit Quiz</Card.Header>
                        <Card.Body className="d-flex flex-column"> {/* Flex column for layout */}
                            <Form.Group className="mb-3">
                                <Form.Label>Quiz Title</Form.Label>
                                <Form.Control
                                    type="text"
                                    value={editingQuiz.title}
                                    onChange={handleQuizTitleChange}
                                    disabled={isSaving}
                                />
                            </Form.Group>
                            <hr />
                            <div className="d-flex justify-content-between align-items-center mb-2">
                                <h5>Questions</h5>
                                <Button variant="outline-primary" size="sm" onClick={handleAddQuestion} disabled={isSaving}>
                                    + Add
                                </Button>
                            </div>
                            {/* Scrollable Question List */}
                            <ListGroup style={{ flexGrow: 1, overflowY: 'auto', maxHeight: 'calc(100vh - 250px)' }}>
                                {editingQuiz.questions.map((q) => (
                                    <ListGroup.Item
                                        key={q.id}
                                        // Remove the 'action' prop if it renders as a button
                                        // action
                                        active={selectedQuestionId === q.id}
                                        // Apply click handler directly to the item if not using 'action'
                                        onClick={() => !isSaving && handleQuestionSelect(q.id)} // Prevent selection while saving
                                        className="d-flex justify-content-between align-items-center"
                                        style={{ cursor: isSaving ? 'default' : 'pointer' }} // Add pointer cursor
                                    >
                                        {/* Quiz Title Span */}
                                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginRight: '10px', flexGrow: 1 }}>
                                            {q.question_text || '(Untitled Question)'}
                                        </span>
                                        {/* Delete Button */}
                                        <Button
                                            variant="outline-danger"
                                            size="sm"
                                            // Keep stopPropagation to prevent the ListGroup.Item's onClick
                                            onClick={(e) => { e.stopPropagation(); handleDeleteQuestion(q.id); }}
                                            disabled={isSaving}
                                            title="Delete Question"
                                            style={{ flexShrink: 0 }} // Prevent button from shrinking
                                        >
                                            × {/* Use HTML entity for 'x' or an icon */}
                                        </Button>
                                    </ListGroup.Item>
                                ))}
                                {editingQuiz.questions.length === 0 && <ListGroup.Item disabled>No questions yet.</ListGroup.Item>}
                            </ListGroup>
                        </Card.Body>
                    </Card>
                </Col>

                {/* Right Column: Selected Question Editor */}
                <Col md={8}>
                     {selectedQuestion ? (
                         <Card>
                             <Card.Header as="h5">Edit Question Details</Card.Header>
                             <Card.Body>
                                 <Form.Group className="mb-3">
                                     <Form.Label>Question Text</Form.Label>
                                     <Form.Control
                                         as="textarea"
                                         rows={3}
                                         value={selectedQuestion.question_text}
                                         onChange={handleQuestionTextChange}
                                         disabled={isSaving}
                                     />
                                 </Form.Group>

                                <h6 className="mt-4">Answers</h6>
                                <p className="text-muted small">Check the box(es) for all correct answers.</p>
                                {selectedQuestion.answers.map((answer) => (
                                    // Using InputGroup for better alignment of checkbox, text, and button
                                    <InputGroup className="mb-2" key={answer.id}>
                                         <InputGroup.Checkbox
                                            aria-label={`Mark answer ${answer.id} as correct`}
                                            checked={!!answer.is_correct} // Ensure boolean value
                                            onChange={() => handleCorrectAnswerToggle(answer.id)}
                                            disabled={isSaving}
                                            title="Mark as Correct"
                                         />
                                         <Form.Control
                                            type="text"
                                            value={answer.answer_text}
                                            onChange={(e) => handleAnswerTextChange(answer.id, e.target.value)}
                                            disabled={isSaving}
                                            placeholder="Enter answer text"
                                         />
                                         <Button
                                             variant="outline-danger"
                                             onClick={() => handleDeleteAnswer(answer.id)}
                                             disabled={isSaving || selectedQuestion.answers.length <= 1} // Prevent deleting the last answer
                                             size="sm"
                                             title="Delete Answer"
                                         >
                                             Delete
                                         </Button>
                                    </InputGroup>
                                ))}
                                 <Button variant="outline-secondary" size="sm" onClick={handleAddAnswer} className="mt-2" disabled={isSaving}>
                                     + Add Answer Option
                                 </Button>
                             </Card.Body>
                         </Card>
                    ) : (
                        // Placeholder if no question is selected
                        <Card>
                            <Card.Body className="text-center text-muted" style={{ minHeight: '300px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                {editingQuiz.questions.length > 0 ? "Select a question from the list to edit." : "Add a question using the button on the left."}
                            </Card.Body>
                        </Card>
                    )}

                    {/* Save Button Area */}
                    <div className="mt-4 d-flex justify-content-end">
                         <Button variant="secondary" onClick={() => navigate('/')} className="me-2" disabled={isSaving}> Cancel </Button>
                         <Button variant="primary" onClick={handleSaveChanges} disabled={isSaving || isLoading}>
                             {isSaving ? <Spinner animation="border" size="sm"/> : "Save Changes"}
                         </Button>
                     </div>
                </Col>
            </Row>
        </Container>
    );
};

export default QuizEditor;