// frontend/src/App.tsx
import { useState, useEffect, useCallback, useMemo } from 'react'; // Added useMemo
import axios from 'axios';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
// Import Bootstrap components explicitly used
import { Modal, Button as BootstrapButton, Spinner as BootstrapSpinner, Alert as BootstrapAlert } from 'react-bootstrap';

// Components & Interfaces
import ChatApp from './components/ChatApp.tsx';
import Quiz from './components/Quiz';
import QuizManager from './components/QuizManager';
import QuizCreator from './components/QuizCreator';
import QuizEditor from './components/QuizEditor';
// Import all necessary interfaces
import { QuizData, Question, AnswerOption } from './interfaces/interfaces.ts';

// Define DisplayQuestion type here or import if defined elsewhere shared with Quiz
// This mirrors the internal type used in Quiz.tsx for context passing
interface DisplayQuestion extends Question {
    originalIndex: number;
}

const API_BASE_URL = 'http://localhost:5001';
type AllUserAnswers = Record<string, number[]>;

function App() {
    // --- State Variables ---
    const [quizzes, setQuizzes] = useState<QuizData[]>([]);
    const [currentQuizId, setCurrentQuizId] = useState<string | null>(null);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);
    const [allUserAnswers, setAllUserAnswers] = useState<AllUserAnswers>({});
    const [shuffleQuestions, setShuffleQuestions] = useState<boolean>(true);
    const [shuffleAnswers, setShuffleAnswers] = useState<boolean>(true);

    // --- State Lifted from Quiz ---
    const [currentDisplayIndex, setCurrentDisplayIndex] = useState<number>(0);
    const [quizFinished, setQuizFinished] = useState<boolean>(false);
    const [currentScore, setCurrentScore] = useState<number>(0);
    // State to hold the question object reported by Quiz component
    const [currentlyDisplayedQuestion, setCurrentlyDisplayedQuestion] = useState<DisplayQuestion | null>(null); // Use DisplayQuestion type

    // --- Delete Modal State ---
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [quizToDelete, setQuizToDelete] = useState<{ id: string; title: string } | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const [deleteError, setDeleteError] = useState<string | null>(null);

    // --- Derived State ---
    const currentQuiz = quizzes.find(q => q.id === currentQuizId);
    const currentQuizAnswers = currentQuiz ? allUserAnswers[currentQuiz.id] : undefined;

    // --- Data Fetching ---
    const fetchQuizzes = useCallback(async (selectIdAfterFetch: string | null = null) => {
        setLoading(true); setError(null);
        let nextSelectedQuizId = selectIdAfterFetch;
        try {
            const response = await axios.get<QuizData[]>(`${API_BASE_URL}/api/quizzes`);
            const fetchedQuizzes = response.data || [];
            setQuizzes(fetchedQuizzes);

            // Determine selection logic
            if (!nextSelectedQuizId) {
                if (currentQuizId && fetchedQuizzes.some(q => q.id === currentQuizId)) nextSelectedQuizId = currentQuizId;
                else if (fetchedQuizzes.length > 0) nextSelectedQuizId = fetchedQuizzes[0].id;
                else nextSelectedQuizId = null;
            } else {
                if (!fetchedQuizzes.some(q => q.id === nextSelectedQuizId)) {
                    nextSelectedQuizId = fetchedQuizzes.length > 0 ? fetchedQuizzes[0].id : null;
                }
            }

            // Reset quiz state if selection changes or was null
            if (nextSelectedQuizId !== currentQuizId) {
                 console.log(`App: Quiz selection changing to: ${nextSelectedQuizId}`);
                 setCurrentDisplayIndex(0); setQuizFinished(false); setCurrentScore(0); setCurrentlyDisplayedQuestion(null);
            }
            setCurrentQuizId(nextSelectedQuizId);

            // Initialize answers *after* setting ID
            if (nextSelectedQuizId) {
                const quizToInit = fetchedQuizzes.find(q => q.id === nextSelectedQuizId);
                if (quizToInit) {
                    // Only init if needed
                    if (!allUserAnswers[nextSelectedQuizId] || allUserAnswers[nextSelectedQuizId].length !== quizToInit.questions.length) {
                        initializeAnswersForQuiz(quizToInit.id, quizToInit.questions);
                    }
                    // Set initial displayed question if selection just changed
                     if (nextSelectedQuizId !== currentQuizId && quizToInit.questions.length > 0) {
                        // This is an estimate; Quiz component will report the actual displayed one
                        setCurrentlyDisplayedQuestion({ ...quizToInit.questions[0], originalIndex: 0 });
                     }
                }
            }
            if (fetchedQuizzes.length === 0) console.warn("No quizzes found.");
        } catch (err) { /* ... error handling ... */
             console.error("Error fetching quizzes:", err); let msg='Failed fetch.';
             if(axios.isAxiosError(err)){msg=err.response?.data?.error||err.message;}else if(err instanceof Error){msg=err.message;} setError(msg);
             setCurrentQuizId(null); setCurrentDisplayIndex(0); setQuizFinished(false); setCurrentScore(0); setCurrentlyDisplayedQuestion(null);
        } finally { setLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentQuizId]); // Recalculate selection logic if ID changes externally? Might need refinement.

    const initializeAnswersForQuiz = useCallback((quizId: string, questions: Question[]) => {
        setAllUserAnswers(prev => ({ ...prev, [quizId]: Array(questions.length).fill(-1) }));
    }, []);

    useEffect(() => { fetchQuizzes(); }, [fetchQuizzes]);

    // --- Event Handlers ---
    const handleSelectQuiz = (id: string) => {
        if (id !== currentQuizId) setCurrentQuizId(id); // Let state change trigger effects
        else console.log("Quiz already selected");
    };

    const handleAnswerUpdate = useCallback((quizId: string, originalQuestionIndex: number, originalAnswerIndex: number) => {
        setAllUserAnswers(prev => {
            const current = prev[quizId] ? [...prev[quizId]] : [];
            if (originalQuestionIndex >= 0 && originalQuestionIndex < current.length) {
                current[originalQuestionIndex] = originalAnswerIndex;
                return { ...prev, [quizId]: current };
            }
            return prev;
        });
    }, []);

    const handleResetQuizAnswers = useCallback((quizId: string) => {
        const quizToReset = quizzes.find(q => q.id === quizId);
        if (quizToReset) {
            initializeAnswersForQuiz(quizId, quizToReset.questions);
            setQuizFinished(false); setCurrentScore(0); setCurrentDisplayIndex(0); setCurrentlyDisplayedQuestion(null); // Reset lifted state
        }
    }, [quizzes, initializeAnswersForQuiz]);

    const handleShuffleQuestionsToggle = useCallback(() => setShuffleQuestions(p => !p), []);
    const handleShuffleAnswersToggle = useCallback(() => setShuffleAnswers(p => !p), []);

    // Callback for Quiz component to report its current displayed question
    const handleDisplayedQuestionUpdate = useCallback((question: DisplayQuestion | null) => {
        console.log("App: Received displayed question update:", question?.question_text ?? 'None');
        setCurrentlyDisplayedQuestion(question);
    }, []);

    // --- Callbacks for Create/Edit/Delete ---
    const handleQuizCreated = (createdQuiz: QuizData | null) => fetchQuizzes(createdQuiz?.id ?? null);
    const handleQuizUpdated = () => fetchQuizzes(currentQuizId);
    const handleDeleteQuizRequest = (id: string, title: string) => { setShowDeleteConfirm(true); setQuizToDelete({ id, title }); setDeleteError(null); };
    const confirmDeleteQuiz = async () => {
         if (!quizToDelete) return; setIsDeleting(true); setDeleteError(null);
         try {
             await axios.delete(`${API_BASE_URL}/api/quizzes/${quizToDelete.id}`);
             setShowDeleteConfirm(false);
             const remaining = quizzes.filter(q => q.id !== quizToDelete!.id);
             const nextId = remaining.length > 0 ? remaining[0].id : null;
             setQuizToDelete(null); fetchQuizzes(nextId); // Fetch and select next
         } catch (err) {
             console.error("Error deleting quiz:", err); let msg='Failed delete.';
             if(axios.isAxiosError(err)){msg=err.response?.data?.error||err.message;}else if(err instanceof Error){msg=err.message;} setDeleteError(msg);
         } finally { setIsDeleting(false); }
     };
    const cancelDeleteQuiz = () => { setShowDeleteConfirm(false); setQuizToDelete(null); setDeleteError(null); };

    // --- Prepare Context for Chat ---
    // Use useMemo to recalculate only when dependencies change
    const chatContext = useMemo(() => {
        let context: any = { isReviewMode: quizFinished }; // Start building context
        if (currentQuiz) context.quizTitle = currentQuiz.title;

        // Use the question reported by the Quiz component
        if (currentlyDisplayedQuestion) {
            context.questionText = currentlyDisplayedQuestion.question_text;
            // Map answers, ensuring they have originalIndex if needed (Quiz adds this)
            context.options = currentlyDisplayedQuestion.answers.map(a => a.answer_text);

            const originalQuestionIndex = currentlyDisplayedQuestion.originalIndex; // Get original index

            if (originalQuestionIndex !== undefined && currentQuizAnswers) {
                 const userAnswerOriginalIndex = currentQuizAnswers[originalQuestionIndex]; // Find user's answer by original index

                 if (userAnswerOriginalIndex !== -1 && userAnswerOriginalIndex !== undefined) {
                     // Find the corresponding answer object using its original index
                     const userAnswerObject = currentlyDisplayedQuestion.answers.find(
                         // Assuming DisplayAnswer type has originalIndex
                         (a: AnswerOption & { originalIndex?: number }) => a.originalIndex === userAnswerOriginalIndex
                     );
                     context.userAnswerText = userAnswerObject?.answer_text;
                     context.wasCorrect = userAnswerObject?.is_correct ?? false;
                 } else {
                     context.userAnswerText = null; // Skipped
                     context.wasCorrect = false;
                 }
            }
             const correctAnswerObject = currentlyDisplayedQuestion.answers.find(a => a.is_correct);
             context.correctAnswerText = correctAnswerObject?.answer_text;
        }
        return context;
    }, [currentQuiz, currentlyDisplayedQuestion, quizFinished, currentQuizAnswers]); // Dependencies for context recalc

    // --- Render Logic ---
    return (
        <BrowserRouter>
            <>
                <QuizManager
                    quizList={quizzes} selectedQuizId={currentQuizId} onSelectTitleItem={handleSelectQuiz}
                    onDeleteQuiz={handleDeleteQuizRequest} shuffleQuestions={shuffleQuestions} shuffleAnswers={shuffleAnswers}
                    onShuffleQuestionsToggle={handleShuffleQuestionsToggle} onShuffleAnswersToggle={handleShuffleAnswersToggle}
                />
                {/* Pass accurate context */}
                <ChatApp chatContext={chatContext} />

                {/* Delete Confirmation Modal */}
                <Modal show={showDeleteConfirm} onHide={cancelDeleteQuiz} centered>
                     <Modal.Header closeButton><Modal.Title>Confirm Deletion</Modal.Title></Modal.Header>
                     <Modal.Body>
                         Are you sure you want to delete: <strong>{quizToDelete?.title}</strong>?
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
                    {error && !loading && <p className='text-center mt-5' style={{ color: 'red' }}>Error: {error}</p>}
                    {!loading && (
                        <Routes>
                            <Route path="/edit/:quizId" element={<QuizEditor onQuizUpdated={handleQuizUpdated} />}/>
                            <Route path="/create" element={<QuizCreator onQuizCreated={handleQuizCreated} />} />
                            <Route path="/" element={
                                !error && currentQuiz && currentQuizAnswers ? (
                                    <>
                                        <h1 style={{ textAlign: 'center' }}>{currentQuiz.title}</h1>
                                        <Quiz
                                            key={`${currentQuiz.id}-${shuffleQuestions}-${shuffleAnswers}`} // Key includes shuffle state
                                            quizId={currentQuiz.id}
                                            questions={currentQuiz.questions}
                                            userAnswers={currentQuizAnswers}
                                            onAnswerUpdate={handleAnswerUpdate}
                                            shuffleQuestions={shuffleQuestions}
                                            shuffleAnswers={shuffleAnswers}
                                            onResetQuiz={handleResetQuizAnswers}
                                            // Pass state & setters
                                            isReviewMode={quizFinished}
                                            currentDisplayIndex={currentDisplayIndex}
                                            score={currentScore}
                                            setQuizFinished={setQuizFinished}
                                            setCurrentDisplayIndex={setCurrentDisplayIndex}
                                            setScore={setCurrentScore}
                                            // Pass callback for Quiz to report its current question
                                            onDisplayedQuestionChange={handleDisplayedQuestionUpdate}
                                        />
                                    </>
                                ) : !error ? ( <p className='text-center mt-5'> {quizzes.length === 0 ? "No quizzes available." : "Select a quiz."} </p> ) : null
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