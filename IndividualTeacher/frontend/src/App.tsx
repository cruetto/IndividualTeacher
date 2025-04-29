// frontend/src/App.tsx
import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Modal, Button as BootstrapButton, Spinner as BootstrapSpinner, Alert as BootstrapAlert } from 'react-bootstrap';

// Components & Interfaces
import ChatApp from './components/Chat';
import Quiz from './components/Quiz';
import QuizManager from './components/QuizManager';
import QuizCreator from './components/QuizCreator';
import QuizEditor from './components/QuizEditor';
import { QuizData, Question } from './interfaces/interfaces.ts';

const API_BASE_URL = 'http://localhost:5001';
type AllUserAnswers = Record<string, number[]>;

function App() {
    // --- State Variables ---
    const [quizzes, setQuizzes] = useState<QuizData[]>([]);
    const [currentQuizId, setCurrentQuizId] = useState<string | null>(null);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);
    const [allUserAnswers, setAllUserAnswers] = useState<AllUserAnswers>({});

    // --- Quiz Options State ---
    const [shuffleQuestions, setShuffleQuestions] = useState<boolean>(true); // NEW
    const [shuffleAnswers, setShuffleAnswers] = useState<boolean>(true);   // NEW

    // --- Delete Modal State ---
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [quizToDelete, setQuizToDelete] = useState<{ id: string; title: string } | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const [deleteError, setDeleteError] = useState<string | null>(null);

    // --- Derived State ---
    const currentQuiz = quizzes.find(q => q.id === currentQuizId);
    const currentQuizAnswers = currentQuiz ? allUserAnswers[currentQuiz.id] : undefined;

    // --- Data Fetching (fetchQuizzes - no changes needed here) ---
    const fetchQuizzes = useCallback(async (selectIdAfterFetch: string | null = null) => {
        setLoading(true);
        setError(null);
        let nextSelectedQuizId = selectIdAfterFetch;

        try {
            console.log(`Fetching quizzes from: ${API_BASE_URL}/api/quizzes`);
            const response = await axios.get<QuizData[]>(`${API_BASE_URL}/api/quizzes`);
            const fetchedQuizzes = response.data || [];
            setQuizzes(fetchedQuizzes);

            // Determine which quiz ID to select (logic refined)
            if (!nextSelectedQuizId) { // If no specific ID requested
                if (currentQuizId && fetchedQuizzes.some(q => q.id === currentQuizId)) {
                    nextSelectedQuizId = currentQuizId; // Keep current if valid
                } else if (fetchedQuizzes.length > 0) {
                    nextSelectedQuizId = fetchedQuizzes[0].id; // Default to first
                } else {
                    nextSelectedQuizId = null; // No quizzes
                }
            } else { // If specific ID was requested (e.g., after create/delete)
                if (!fetchedQuizzes.some(q => q.id === nextSelectedQuizId)) {
                    console.warn(`Requested quiz ID ${selectIdAfterFetch} not found after fetch. Selecting first.`);
                    nextSelectedQuizId = fetchedQuizzes.length > 0 ? fetchedQuizzes[0].id : null;
                }
            }

            // Initialize answers only if a quiz is going to be selected
            if (nextSelectedQuizId) {
                const quizToInit = fetchedQuizzes.find(q => q.id === nextSelectedQuizId);
                if (quizToInit) {
                    // Check if answers *need* init/reset (prevents overwriting progress unnecessarily)
                    if (!allUserAnswers[nextSelectedQuizId] || allUserAnswers[nextSelectedQuizId].length !== quizToInit.questions.length) {
                         initializeAnswersForQuiz(quizToInit.id, quizToInit.questions);
                    }
                }
            }
            setCurrentQuizId(nextSelectedQuizId);

            if (fetchedQuizzes.length === 0) console.warn("No quizzes found.");

        } catch (err) {
            // ... (error handling remains the same) ...
             console.error("Error fetching quizzes:", err);
             let message = 'Failed to fetch quizzes.';
             if (axios.isAxiosError(err)) { message = err.response?.data?.error || err.message || message; }
             else if (err instanceof Error) { message = err.message; }
             setError(message);
             setCurrentQuizId(null);
        } finally {
            setLoading(false);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentQuizId]); // Keep currentQuizId dependency

    // Initialize/Reset Answers for a specific quiz
    const initializeAnswersForQuiz = useCallback((quizId: string, questions: Question[]) => {
        setAllUserAnswers(prevAnswers => {
            console.log(`Initializing answers for quiz ${quizId} with ${questions.length} questions`);
            return { ...prevAnswers, [quizId]: Array(questions.length).fill(-1) };
        });
    }, []); // No dependencies needed

    useEffect(() => {
        fetchQuizzes(); // Initial fetch
    }, [fetchQuizzes]);

    // --- Event Handlers ---
    const handleSelectQuiz = (id: string) => {
        const selectedQuiz = quizzes.find(quiz => quiz.id === id);
        if (selectedQuiz && id !== currentQuizId) { // Only proceed if actually changing quiz
            setCurrentQuizId(id);
            // Ensure answers are initialized (or reset if needed) for the selected quiz
             if (!allUserAnswers[id] || allUserAnswers[id].length !== selectedQuiz.questions.length) {
                 initializeAnswersForQuiz(id, selectedQuiz.questions);
             }
            console.log("Selected Quiz ID:", id);
        } else if (id === currentQuizId) {
            console.log("Quiz already selected:", id);
            // Maybe close manager here if desired?
        }
    };

    const handleAnswerUpdate = useCallback((quizId: string, questionIndex: number, answerIndex: number) => {
        setAllUserAnswers(prevAnswers => {
            // Ensure the entry for the quiz exists
            const currentAnswers = prevAnswers[quizId] ? [...prevAnswers[quizId]] : [];
            if (questionIndex >= 0 && questionIndex < currentAnswers.length) {
                currentAnswers[questionIndex] = answerIndex;
                return { ...prevAnswers, [quizId]: currentAnswers };
            }
            console.error(`Invalid questionIndex ${questionIndex} in handleAnswerUpdate for quiz ${quizId}`);
            return prevAnswers;
        });
    }, []);

    // --- NEW: Reset answers for the current quiz (after review) ---
    const handleResetQuizAnswers = useCallback((quizId: string) => {
        const quizToReset = quizzes.find(q => q.id === quizId);
        if (quizToReset) {
            console.log(`Resetting answers for quiz: ${quizId}`);
            initializeAnswersForQuiz(quizId, quizToReset.questions);
            // The Quiz component itself will handle resetting its internal state (finished, score, index)
        } else {
            console.warn(`Attempted to reset answers for non-existent quiz ID: ${quizId}`);
        }
    }, [quizzes, initializeAnswersForQuiz]); // Dependencies

    // --- NEW: Toggle Shuffle Options ---
    const handleShuffleQuestionsToggle = useCallback(() => {
        setShuffleQuestions(prev => !prev);
    }, []);
    const handleShuffleAnswersToggle = useCallback(() => {
        setShuffleAnswers(prev => !prev);
    }, []);

    // --- Callbacks for Create/Edit/Delete ---
    const handleQuizCreated = (createdQuiz: QuizData | null) => {
        fetchQuizzes(createdQuiz?.id ?? null);
    };
    const handleQuizUpdated = () => {
        fetchQuizzes(currentQuizId);
    };
    const handleDeleteQuizRequest = (id: string, title: string) => {
        setQuizToDelete({ id, title });
        setDeleteError(null);
        setShowDeleteConfirm(true);
    };
    const confirmDeleteQuiz = async () => {
        // ... (delete logic remains the same) ...
        if (!quizToDelete) return;
        setIsDeleting(true);
        setDeleteError(null);
        try {
            await axios.delete(`${API_BASE_URL}/api/quizzes/${quizToDelete.id}`);
            setShowDeleteConfirm(false);
            // Select the next available quiz, or null if none left
            const nextSelectedId = quizzes.length > 1 && currentQuizId === quizToDelete.id
                ? quizzes.find(q => q.id !== quizToDelete.id)?.id ?? (quizzes.length > 1 ? quizzes[0].id : null)
                : (quizzes.length > 1 ? currentQuizId : null); // Keep current if deleting other, else null if only one
            setQuizToDelete(null);
            fetchQuizzes(nextSelectedId);
        } catch (err) {
             console.error("Error deleting quiz:", err);
             let message = 'Failed to delete quiz.';
             if (axios.isAxiosError(err)) { message = err.response?.data?.error || err.message; }
             else if (err instanceof Error) { message = err.message; }
             setDeleteError(message);
        } finally {
            setIsDeleting(false);
        }
    };
    const cancelDeleteQuiz = () => {
        setShowDeleteConfirm(false);
        setQuizToDelete(null);
        setDeleteError(null);
    };

    // --- Render Logic ---
    return (
        <BrowserRouter>
            <>
                <QuizManager
                    quizList={quizzes}
                    selectedQuizId={currentQuizId}
                    onSelectTitleItem={handleSelectQuiz}
                    onDeleteQuiz={handleDeleteQuizRequest}
                    // Pass shuffle state and handlers
                    shuffleQuestions={shuffleQuestions}
                    shuffleAnswers={shuffleAnswers}
                    onShuffleQuestionsToggle={handleShuffleQuestionsToggle}
                    onShuffleAnswersToggle={handleShuffleAnswersToggle}
                />
                 <ChatApp />
                 <Modal show={showDeleteConfirm} onHide={cancelDeleteQuiz} centered>
                    {/* ... (Modal content remains the same) ... */}
                     <Modal.Header closeButton><Modal.Title>Confirm Deletion</Modal.Title></Modal.Header>
                     <Modal.Body>
                         Are you sure you want to delete the quiz: <strong>{quizToDelete?.title}</strong>? This action cannot be undone.
                         {deleteError && <BootstrapAlert variant="danger" className="mt-3">{deleteError}</BootstrapAlert>}
                     </Modal.Body>
                     <Modal.Footer>
                         <BootstrapButton variant="secondary" onClick={cancelDeleteQuiz} disabled={isDeleting}>Cancel</BootstrapButton>
                         <BootstrapButton variant="danger" onClick={confirmDeleteQuiz} disabled={isDeleting}>
                             {isDeleting ? <BootstrapSpinner animation="border" size="sm" /> : "Delete"}
                         </BootstrapButton>
                     </Modal.Footer>
                 </Modal>

                 <div className="main-content-area" style={{ paddingTop: '5rem', paddingLeft: '1rem', paddingRight: '1rem' }}>
                    {loading && <p className='text-center mt-5'>Loading Quizzes...</p>}
                    {error && !loading && <p className='text-center mt-5' style={{ color: 'red' }}>Error Loading Data: {error}</p>}

                    {!loading && (
                        <Routes>
                            <Route path="/edit/:quizId" element={<QuizEditor onQuizUpdated={handleQuizUpdated} />}/>
                            <Route path="/create" element={<QuizCreator onQuizCreated={handleQuizCreated} />} />
                            <Route path="/" element={
                                !error && currentQuiz && currentQuizAnswers ? (
                                    <>
                                        <h1 style={{ textAlign: 'center' }}>{currentQuiz.title}</h1>
                                        <Quiz
                                            key={`${currentQuiz.id}-${shuffleQuestions}-${shuffleAnswers}`} // Add shuffle states to key to force remount on change
                                            quizId={currentQuiz.id}
                                            questions={currentQuiz.questions}
                                            userAnswers={currentQuizAnswers}
                                            onAnswerUpdate={handleAnswerUpdate}
                                            // Pass shuffle options and reset handler
                                            shuffleQuestions={shuffleQuestions}
                                            shuffleAnswers={shuffleAnswers}
                                            onResetQuiz={handleResetQuizAnswers} // Pass reset handler
                                        />
                                    </>
                                ) : !error ? (
                                    <p className='text-center mt-5'>
                                        {quizzes.length === 0 ? "No quizzes available. Create one!" : "Please select a quiz from the menu."}
                                    </p>
                                ) : null
                            } />
                            <Route path="*" element={<Navigate to="/" replace />} />
                        </Routes>
                    )}
                 </div>
            </>
        </BrowserRouter>
    );
}
export default App;