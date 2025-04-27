// frontend/src/App.tsx

import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
// Import React Router components
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
// Import Bootstrap components needed for Modal
import { Modal, Button as BootstrapButton, Spinner as BootstrapSpinner, Alert as BootstrapAlert } from 'react-bootstrap';

// Import Custom Components
import ChatApp from './components/Chat';
import Quiz from './components/Quiz';
import QuizManager from './components/QuizManager';
import QuizCreator from './components/QuizCreator';
import QuizEditor from './components/QuizEditor';

// Import Interfaces
import { QuizData, Question } from './interfaces/interfaces'; // Ensure path is correct

const API_BASE_URL = 'http://localhost:5001'; // Ensure this matches backend

// Define types
type AllUserAnswers = Record<string, number[]>; // Use string ID for keys if using UUIDs

function App() {
    // --- State Variables ---
    const [quizzes, setQuizzes] = useState<QuizData[]>([]);
    const [currentQuizId, setCurrentQuizId] = useState<string | null>(null); // Track selected quiz by its ID
    const [loading, setLoading] = useState<boolean>(true); // Loading state for initial fetch
    const [error, setError] = useState<string | null>(null); // General error state
    const [allUserAnswers, setAllUserAnswers] = useState<AllUserAnswers>({}); // Store user answers per quiz

    // State for Delete Confirmation Modal
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [quizToDelete, setQuizToDelete] = useState<{ id: string; title: string } | null>(null);
    const [isDeleting, setIsDeleting] = useState(false); // Loading state for delete action
    const [deleteError, setDeleteError] = useState<string | null>(null); // Error specific to delete modal


    // --- Derived State ---
    // Find the current quiz object based on currentQuizId
    const currentQuiz = quizzes.find(q => q.id === currentQuizId);
    // Find answers for the current quiz
    const currentQuizAnswers = currentQuiz ? allUserAnswers[currentQuiz.id] : undefined;


    // --- Data Fetching ---
    // Fetches quizzes and optionally selects one by ID after fetch
    const fetchQuizzes = useCallback(async (selectIdAfterFetch: string | null = null) => {
        setLoading(true);
        setError(null);
        let nextSelectedQuizId = selectIdAfterFetch;

        try {
            console.log(`Fetching quizzes from: ${API_BASE_URL}/api/quizzes`);
            const response = await axios.get<QuizData[]>(`${API_BASE_URL}/api/quizzes`);
            const fetchedQuizzes = response.data || [];
            setQuizzes(fetchedQuizzes);

            // Determine which quiz ID to select
            if (!nextSelectedQuizId) {
                if (currentQuizId && fetchedQuizzes.some(q => q.id === currentQuizId)) {
                    nextSelectedQuizId = currentQuizId;
                } else if (fetchedQuizzes.length > 0) {
                    nextSelectedQuizId = fetchedQuizzes[0].id;
                } else {
                    nextSelectedQuizId = null;
                }
            } else {
                if (!fetchedQuizzes.some(q => q.id === nextSelectedQuizId)) {
                    console.warn(`Requested quiz ID ${selectIdAfterFetch} not found after fetch. Selecting first available.`);
                    nextSelectedQuizId = fetchedQuizzes.length > 0 ? fetchedQuizzes[0].id : null;
                }
            }

            // Initialize answers if a quiz is selected
            if (nextSelectedQuizId) {
                const quizToInit = fetchedQuizzes.find(q => q.id === nextSelectedQuizId);
                if (quizToInit) {
                    initializeAnswersForQuiz(quizToInit.id, quizToInit.questions);
                }
            }
            setCurrentQuizId(nextSelectedQuizId); // Set the final selected ID

            if (fetchedQuizzes.length === 0) {
                console.warn("No quizzes found after fetch.");
            }

        } catch (err) {
            console.error("Error fetching quizzes:", err);
            let message = 'Failed to fetch quizzes.';
            if (axios.isAxiosError(err)) {
                message = err.response?.data?.error || err.message || message;
            } else if (err instanceof Error) {
                message = err.message;
            }
            setError(message);
            setCurrentQuizId(null); // Clear selection on error
        } finally {
            setLoading(false);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentQuizId]); // Dependency helps re-evaluate selection logic if needed

    // Helper function to initialize/reset answer array for a quiz
    const initializeAnswersForQuiz = useCallback((quizId: string, questions: Question[]) => {
        setAllUserAnswers(prevAnswers => {
            if (!prevAnswers[quizId] || prevAnswers[quizId].length !== questions.length) {
                 console.log(`Initializing answers for quiz ${quizId} with ${questions.length} questions`);
                return { ...prevAnswers, [quizId]: Array(questions.length).fill(-1) };
            }
            return prevAnswers;
        });
    }, []); // No dependencies for this callback itself

    // Initial fetch on component mount
    useEffect(() => {
        fetchQuizzes();
    }, [fetchQuizzes]);


    // --- Event Handlers ---

    // Handles selecting a quiz from the manager
    const handleSelectQuiz = (id: string) => {
        const selectedQuiz = quizzes.find(quiz => quiz.id === id);
        if (selectedQuiz) {
            setCurrentQuizId(id);
            initializeAnswersForQuiz(id, selectedQuiz.questions);
            console.log("Selected Quiz ID:", id);
        } else {
            console.warn(`Attempted to select non-existent quiz ID: ${id}`);
        }
    };

    // Handles updating the answer for a specific question in the current quiz
    const handleAnswerUpdate = useCallback((quizId: string, questionIndex: number, answerIndex: number) => {
        setAllUserAnswers(prevAnswers => {
            const currentAnswers = prevAnswers[quizId] ? [...prevAnswers[quizId]] : [];
            if (questionIndex >= 0 && questionIndex < currentAnswers.length) {
                 currentAnswers[questionIndex] = answerIndex;
                 return { ...prevAnswers, [quizId]: currentAnswers };
            }
            console.error(`Invalid questionIndex ${questionIndex} in handleAnswerUpdate for quiz ${quizId}`);
            return prevAnswers;
        });
    }, []);

    // Callback triggered after a new quiz is successfully created
    const handleQuizCreated = (createdQuiz: QuizData | null) => { // Accept QuizData or null
        console.log("handleQuizCreated called in App.tsx, new quiz data:", createdQuiz);
        // Refetch the list and try to select the newly created quiz using its ID
        fetchQuizzes(createdQuiz?.id ?? null); // Pass the ID if available, otherwise null
    };

    // Callback triggered after a quiz is successfully updated
    const handleQuizUpdated = () => {
        console.log("handleQuizUpdated called in App.tsx");
        // Refetch the list, keeping the current quiz selected if possible
        fetchQuizzes(currentQuizId);
    };

    // --- Delete Quiz Logic ---
    // Initiates the delete process by showing the confirmation modal
    const handleDeleteQuizRequest = (id: string, title: string) => {
        setQuizToDelete({ id, title });
        setDeleteError(null);
        setShowDeleteConfirm(true);
    };

    // Executes the actual deletion after confirmation
    const confirmDeleteQuiz = async () => {
        if (!quizToDelete) return;
        setIsDeleting(true);
        setDeleteError(null);
        try {
            console.log(`Attempting to delete quiz ID: ${quizToDelete.id}`);
            await axios.delete(`${API_BASE_URL}/api/quizzes/${quizToDelete.id}`);
            console.log(`Successfully deleted quiz ID: ${quizToDelete.id}`);
            setShowDeleteConfirm(false);
            const nextSelectedId = quizzes.length > 1 && currentQuizId === quizToDelete.id
                ? quizzes.find(q => q.id !== quizToDelete.id)?.id ?? null
                : currentQuizId;
            setQuizToDelete(null); // Clear target *before* fetch
            fetchQuizzes(nextSelectedId); // Refetch list and select next quiz
        } catch (err) {
            console.error("Error deleting quiz:", err);
            let message = 'Failed to delete quiz.';
             if (axios.isAxiosError(err)) {
                 message = err.response?.data?.error || err.message;
             } else if (err instanceof Error) {
                 message = err.message;
             }
            setDeleteError(message); // Show error within the modal
        } finally {
            setIsDeleting(false);
        }
    };

    // Closes the delete confirmation modal without deleting
    const cancelDeleteQuiz = () => {
        setShowDeleteConfirm(false);
        setQuizToDelete(null);
        setDeleteError(null);
    };

    // --- Render Logic ---
    return (
        <BrowserRouter>
            <> {/* Root Fragment */}

                 {/* Persistent Components */}
                 <QuizManager
                    quizList={quizzes}
                    selectedQuizId={currentQuizId}
                    onSelectTitleItem={handleSelectQuiz}
                    onDeleteQuiz={handleDeleteQuizRequest}
                />
                 <ChatApp />

                 {/* Delete Confirmation Modal */}
                 <Modal show={showDeleteConfirm} onHide={cancelDeleteQuiz} centered>
                    <Modal.Header closeButton>
                        <Modal.Title>Confirm Deletion</Modal.Title>
                    </Modal.Header>
                    <Modal.Body>
                        Are you sure you want to delete the quiz: <strong>{quizToDelete?.title}</strong>?
                        This action cannot be undone.
                        {deleteError && <BootstrapAlert variant="danger" className="mt-3">{deleteError}</BootstrapAlert>}
                    </Modal.Body>
                    <Modal.Footer>
                        <BootstrapButton variant="secondary" onClick={cancelDeleteQuiz} disabled={isDeleting}>
                            Cancel
                        </BootstrapButton>
                        <BootstrapButton variant="danger" onClick={confirmDeleteQuiz} disabled={isDeleting}>
                            {isDeleting ? <BootstrapSpinner animation="border" size="sm" /> : "Delete"}
                        </BootstrapButton>
                    </Modal.Footer>
                 </Modal>

                 {/* Main Content Area for Routed Components */}
                 <div className="main-content-area" style={{ paddingTop: '5rem', paddingLeft: '1rem', paddingRight: '1rem' }}>
                    {/* Display initial loading indicator */}
                    {loading && <p className='text-center mt-5'>Loading Quizzes...</p>}

                    {/* Display fetch error if loading is finished */}
                    {error && !loading && <p className='text-center mt-5' style={{ color: 'red' }}>Error Loading Data: {error}</p>}

                    {/* Render Routes only when not in initial loading state */}
                    {!loading && (
                        <Routes>
                            {/* Edit Route */}
                            <Route path="/edit/:quizId" element={
                                <QuizEditor onQuizUpdated={handleQuizUpdated} />
                            }/>

                            {/* Create Route */}
                            <Route path="/create" element={
                                <QuizCreator onQuizCreated={handleQuizCreated} />
                            } />

                            {/* Main Route (Quiz Display) */}
                            <Route path="/" element={
                                !error && currentQuiz && currentQuizAnswers ? (
                                    // If no error, and a quiz/answers are ready, display it
                                    <>
                                        <h1 style={{ textAlign: 'center' }}>{currentQuiz.title}</h1>
                                        <Quiz
                                            key={currentQuiz.id}
                                            quizId={currentQuiz.id}
                                            questions={currentQuiz.questions}
                                            userAnswers={currentQuizAnswers}
                                            onAnswerUpdate={handleAnswerUpdate}
                                        />
                                    </>
                                ) : !error ? (
                                    // If no error, but no quiz selected/available
                                    <p className='text-center mt-5'>
                                        {quizzes.length === 0 ? "No quizzes available. Create one!" : "Please select a quiz from the menu."}
                                    </p>
                                ) : null // If there was an error, the error message is already shown above
                            } />

                            {/* Catch-all route */}
                            <Route path="*" element={<Navigate to="/" replace />} />
                        </Routes>
                    )}
                 </div>
            </>
        </BrowserRouter>
    );
}

export default App;