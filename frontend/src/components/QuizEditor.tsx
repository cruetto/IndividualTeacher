
import React, { useState, useEffect} from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Container, Form, Button, ListGroup, Card, InputGroup, Spinner, Alert, Row, Col } from 'react-bootstrap';
import { QuizData, Question, AnswerOption } from '../interfaces/interfaces';
import { v4 as uuidv4 } from 'uuid';


const API_BASE_URL = import.meta.env.VITE_API_BASE_URL as string;


interface Props {
    onQuizUpdated: () => void;
}

const QuizEditor: React.FC<Props> = ({ onQuizUpdated }) => {
    const { quizId } = useParams<{ quizId: string }>();
    const navigate = useNavigate();


    const [editingQuiz, setEditingQuiz] = useState<QuizData | null>(null);
    const [selectedQuestionId, setSelectedQuestionId] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);


        useEffect(() => {
            const fetchQuiz = async () => {
                setIsLoading(true);
                setError(null);
                setSelectedQuestionId(null);
                setEditingQuiz(null);

                if (!quizId) {
                    setError("No Quiz ID provided in URL.");
                    setIsLoading(false);
                    return;
                }
                try {
                     console.log(`Fetching specific quiz for edit: ${quizId}`);

                     const response = await axios.get<QuizData>(
                         `${API_BASE_URL}/api/quizzes/${quizId}`,
                         { withCredentials: true }
                     );
                     const foundQuiz = response.data;


                    if (foundQuiz && foundQuiz.id === quizId) {
                        console.log("Found quiz:", JSON.stringify(foundQuiz, null, 2));

                        setEditingQuiz(JSON.parse(JSON.stringify(foundQuiz)));

                        if (foundQuiz.questions.length > 0) {
                            setSelectedQuestionId(foundQuiz.questions[0].id);
                            console.log("Selected first question ID:", foundQuiz.questions[0].id);
                        } else {
                             console.log("Quiz has no questions initially.");
                        }
                    } else {

                        setError(`Received unexpected data for quiz ID ${quizId}.`);
                         console.error(`Backend response issue for ID: ${quizId}`, foundQuiz);
                    }
                } catch (err) {

                    console.error("Error fetching quiz for edit:", err);
                     let message = "Failed to load quiz data for editing.";
                     if (axios.isAxiosError(err)) {

                         if (err.response?.status === 404) {
                             message = `Quiz not found, or you don't have permission to edit it.`;
                         } else if (err.response?.status === 401) {
                             message = "Authentication required to edit quizzes. Please log in.";

                         } else if (err.response?.status === 403) {
                              message = "Permission denied to edit this quiz.";
                         } else {

                             message = err.response?.data?.error || err.message;
                         }
                     } else if (err instanceof Error) {

                          message = err.message;
                     }
                     setError(message);
                } finally {

                    setIsLoading(false);
                }
            };

            fetchQuiz();


        }, [quizId]);


    const handleQuizTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newTitle = e.target.value;
        setEditingQuiz(prev => prev ? { ...prev, title: newTitle } : null);
    };

    const handleQuestionSelect = (questionId: string) => {
        console.log("Selected Question ID:", questionId);
        setSelectedQuestionId(questionId);
    };


    const handleQuestionTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newText = e.target.value;
        if (!selectedQuestionId) return;

        setEditingQuiz(prev => {
            if (!prev) return null;
            return {
                ...prev,
                questions: prev.questions.map(q => {
                    if (q.id === selectedQuestionId) {

                        return { ...q, question_text: newText };
                    }
                    return q;
                })
            };
        });
    };


    const handleAnswerTextChange = (answerId: string, newText: string) => {
        if (!selectedQuestionId) return;
        console.log(`Changing answer text for A_ID: ${answerId} in Q_ID: ${selectedQuestionId} to: ${newText}`);

        setEditingQuiz(prev => {
            if (!prev) return null;
            return {
                ...prev,
                questions: prev.questions.map(q => {
                    if (q.id === selectedQuestionId) {
                        return {
                            ...q,
                            answers: q.answers.map(a => {
                                if (a.id === answerId) {

                                    return { ...a, answer_text: newText };
                                }
                                return a;
                            })
                        };
                    }
                    return q;
                })
            };
        });
    };


    const handleCorrectAnswerToggle = (answerId: string) => {
        if (!selectedQuestionId) return;
        console.log(`Toggling correct for A_ID: ${answerId} in Q_ID: ${selectedQuestionId}`);

        setEditingQuiz(prev => {
            if (!prev) return null;
            return {
                ...prev,
                questions: prev.questions.map(q => {
                    if (q.id === selectedQuestionId) {
                        return {
                            ...q,
                            answers: q.answers.map(a => {
                                if (a.id === answerId) {

                                    console.log(`  Found answer ${a.id}, toggling is_correct from ${a.is_correct} to ${!a.is_correct}`);
                                    return { ...a, is_correct: !a.is_correct };
                                }
                                return a;
                            })
                        };
                    }
                    return q;
                })
            };
        });
    };


    const handleAddAnswer = () => {
        if (!selectedQuestionId) return;
        const newAnswer: AnswerOption = {
            id: uuidv4(),
            answer_text: '',
            is_correct: false,
        };
        console.log(`Adding new answer ${newAnswer.id} to Q_ID: ${selectedQuestionId}`);

        setEditingQuiz(prev => {
            if (!prev) return null;
            return {
                ...prev,
                questions: prev.questions.map(q => {
                    if (q.id === selectedQuestionId) {
                        return {
                            ...q,
                            answers: [...q.answers, newAnswer]
                        };
                    }
                    return q;
                })
            };
        });
    };


    const handleDeleteAnswer = (answerIdToDelete: string) => {
         if (!selectedQuestionId) return;
         console.log(`Deleting answer A_ID: ${answerIdToDelete} from Q_ID: ${selectedQuestionId}`);

         setEditingQuiz(prev => {
             if (!prev) return null;
             return {
                 ...prev,
                 questions: prev.questions.map(q => {
                     if (q.id === selectedQuestionId) {

                         if (q.answers.length <= 1) {
                            console.warn("Cannot delete the last answer option.");
                            return q;
                         }
                         return {
                             ...q,
                             answers: q.answers.filter(a => a.id !== answerIdToDelete)
                         };
                     }
                     return q;
                 })
             };
         });
    };


    const handleAddQuestion = () => {
         const newQuestion: Question = {
             id: uuidv4(),
             question_text: '',
             type: 'multiple_choice',
             answers: [
                 { id: uuidv4(), answer_text: '', is_correct: false }
             ]
         };
         console.log(`Adding new question Q_ID: ${newQuestion.id}`);

         setEditingQuiz(prev => prev ? {
             ...prev,
             questions: [...prev.questions, newQuestion]
         } : null);


         setSelectedQuestionId(newQuestion.id);
    };


    const handleDeleteQuestion = (questionIdToDelete: string) => {
         console.log(`Attempting to delete question Q_ID: ${questionIdToDelete}`);

         setEditingQuiz(prev => {
            if (!prev) return null;

            const remainingQuestions = prev.questions.filter(q => {
                console.log(`  Comparing filter ID ${q.id} with delete target ${questionIdToDelete}`);
                return q.id !== questionIdToDelete;
            });
            console.log(`  Questions remaining after filter: ${remainingQuestions.length}`);


            let nextSelectedId: string | null = null;
            if (selectedQuestionId === questionIdToDelete) {
                if (remainingQuestions.length > 0) {

                    const deletedIndex = prev.questions.findIndex(q => q.id === questionIdToDelete);
                    if (deletedIndex > 0) {
                        nextSelectedId = remainingQuestions[deletedIndex - 1].id;
                    } else {
                        nextSelectedId = remainingQuestions[0].id;
                    }
                } else {
                    nextSelectedId = null;
                }
                 console.log(`  Deleting selected question. Next selected ID will be: ${nextSelectedId}`);
                 setSelectedQuestionId(nextSelectedId);
            } else {

                nextSelectedId = selectedQuestionId;
            }


            return {
                 ...prev,
                 questions: remainingQuestions
            };
         });
    };


    const handleSaveChanges = async () => {
        if (!editingQuiz || !quizId) {
            setError("Cannot save, no quiz data loaded.");
            return;
        }

        if (!editingQuiz.title.trim()) {
            setError("Quiz title cannot be empty.");
            return;
        }
        for (const q of editingQuiz.questions) {
             if (!q.question_text.trim()) {
                setError(`Question "${q.id}" cannot have empty text.`);
                 setSelectedQuestionId(q.id);
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


        }


        setIsSaving(true);
        setError(null);
        try {
            console.log("Saving updated quiz data:", JSON.stringify(editingQuiz, null, 2));

            await axios.put(`${API_BASE_URL}/api/quizzes/${quizId}`, editingQuiz);
            onQuizUpdated();
            navigate('/');
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


    const selectedQuestion = editingQuiz?.questions.find(q => q.id === selectedQuestionId);

    if (isLoading) return <Container className="text-center mt-5"><Spinner animation="border" role="status"><span className="visually-hidden">Loading Quiz Editor...</span></Spinner></Container>;

    if (!editingQuiz) return <Container className="mt-5"><Alert variant={error ? "danger" : "warning"}>{error || "Quiz not found or failed to load."}</Alert></Container>;

    return (
        <Container fluid className="mt-4 quiz-editor">

            {error && <Alert variant="danger" onClose={() => setError(null)} dismissible>{error}</Alert>}

            <Row>

                <Col md={4} className="mb-3">
                    <Card className="h-100">
                        <Card.Header as="h4">Edit Quiz</Card.Header>
                        <Card.Body className="d-flex flex-column">
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

                            <ListGroup style={{ flexGrow: 1, overflowY: 'auto', maxHeight: 'calc(100vh - 250px)' }}>
                                {editingQuiz.questions.map((q) => (
                                    <ListGroup.Item
                                        key={q.id}


                                        active={selectedQuestionId === q.id}

                                        onClick={() => !isSaving && handleQuestionSelect(q.id)}
                                        className="d-flex justify-content-between align-items-center"
                                        style={{ cursor: isSaving ? 'default' : 'pointer' }}
                                    >

                                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginRight: '10px', flexGrow: 1 }}>
                                            {q.question_text || '(Untitled Question)'}
                                        </span>

                                        <Button
                                            variant="outline-danger"
                                            size="sm"

                                            onClick={(e) => { e.stopPropagation(); handleDeleteQuestion(q.id); }}
                                            disabled={isSaving}
                                            title="Delete Question"
                                            style={{ flexShrink: 0 }}
                                        >
                                            ×
                                        </Button>
                                    </ListGroup.Item>
                                ))}
                                {editingQuiz.questions.length === 0 && <ListGroup.Item disabled>No questions yet.</ListGroup.Item>}
                            </ListGroup>
                        </Card.Body>
                    </Card>
                </Col>


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

                                    <InputGroup className="mb-2" key={answer.id}>
                                         <InputGroup.Checkbox
                                            aria-label={`Mark answer ${answer.id} as correct`}
                                            checked={!!answer.is_correct}
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
                                             disabled={isSaving || selectedQuestion.answers.length <= 1}
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

                        <Card>
                            <Card.Body className="text-center text-muted" style={{ minHeight: '300px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                {editingQuiz.questions.length > 0 ? "Select a question from the list to edit." : "Add a question using the button on the left."}
                            </Card.Body>
                        </Card>
                    )}


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