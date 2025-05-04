// frontend/src/App.tsx
import { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Modal, Button as BootstrapButton, Spinner as BootstrapSpinner, Alert as BootstrapAlert } from 'react-bootstrap';

// Components & Interfaces
import ChatApp from './components/ChatApp'; // Adjust path if needed
import Quiz from './components/Quiz'; // Adjust path if needed
import QuizManager from './components/QuizManager'; // Adjust path if needed
import QuizCreator from './components/QuizCreator'; // Adjust path if needed
import QuizEditor from './components/QuizEditor'; // Adjust path if needed
// Import all necessary interfaces from a central file
import { QuizData, Question, AnswerOption } from './interfaces/interfaces'; // Adjust path if needed

// --- Type Definitions ---
// This MUST match the type being sent by Quiz.tsx's onDisplayedQuestionChange
// It includes the originalIndex for the question AND answers with originalIndex
interface DisplayAnswer extends AnswerOption { originalIndex: number; }
interface DisplayQuestion extends Omit<Question, 'answers'> {
    originalIndex: number;
    answers: DisplayAnswer[];
}

// Type for storing user answers: Key is Quiz ID, Value is array where index is ORIGINAL question index,
// and value is the ORIGINAL answer index selected by the user (-1 if unanswered).
type AllUserAnswers = Record<string, number[]>;

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5001'; // Use env var if available

function App() {
    // --- State Variables ---
    const [quizzes, setQuizzes] = useState<QuizData[]>([]); // Holds the list of available quizzes (e.g., public)
    const [currentQuizId, setCurrentQuizId] = useState<string | null>(null); // ID of the currently selected/viewed quiz
    const [loading, setLoading] = useState<boolean>(true); // For loading quizzes list
    const [error, setError] = useState<string | null>(null); // For general errors
    const [allUserAnswers, setAllUserAnswers] = useState<AllUserAnswers>({}); // Stores answers for all quizzes
    const [shuffleQuestions, setShuffleQuestions] = useState<boolean>(true); // Quiz option
    const [shuffleAnswers, setShuffleAnswers] = useState<boolean>(true); // Quiz option

    // --- State Lifted from Quiz ---
    // These control the state of the *currently active* Quiz component instance
    const [currentDisplayIndex, setCurrentDisplayIndex] = useState<number>(0); // Index of the question shown in Quiz UI
    const [quizFinished, setQuizFinished] = useState<boolean>(false); // Is the current quiz in review mode?
    const [currentScore, setCurrentScore] = useState<number>(0); // Score for the finished quiz
    // State to hold the question object reported by Quiz component (using the refined type)
    const [currentlyDisplayedQuestion, setCurrentlyDisplayedQuestion] = useState<DisplayQuestion | null>(null);

    // --- Delete Modal State ---
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [quizToDelete, setQuizToDelete] = useState<{ id: string; title: string } | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const [deleteError, setDeleteError] = useState<string | null>(null);

    // --- Derived State (Memoized) ---
    // Find the full QuizData object for the selected quiz ID
    const currentQuiz = useMemo(() => quizzes.find(q => q.id === currentQuizId), [quizzes, currentQuizId]);
    // Get the user's answers array for the currently selected quiz
    const currentQuizAnswers = useMemo(() => currentQuiz ? allUserAnswers[currentQuiz.id] : undefined, [currentQuiz, allUserAnswers]);

    // --- Helper to initialize/reset answers for a specific quiz ---
    const initializeAnswersForQuiz = useCallback((quizId: string, questions: Question[]) => {
        console.log(`Initializing/resetting answers for quiz ${quizId}`);
        setAllUserAnswers(prev => ({
            ...prev,
            [quizId]: Array(questions.length).fill(-1) // Fill with -1 for unanswered
        }));
    }, []);

    // --- Data Fetching (Example: Fetching Public Quizzes) ---
    const fetchQuizzes = useCallback(async (selectIdAfterFetch: string | null = null) => {
        setLoading(true); setError(null);
        let nextSelectedQuizId = selectIdAfterFetch; // ID to select after fetch completes

        try {
            console.log("Fetching quizzes from backend...");
            // Assuming GET /api/quizzes returns public quizzes (adapt if using different endpoints)
            const response = await axios.get<QuizData[]>(`${API_BASE_URL}/api/quizzes`);
            const fetchedQuizzes = response.data || [];
            setQuizzes(fetchedQuizzes); // Update the main quizzes list
            console.log(`Fetched ${fetchedQuizzes.length} quizzes.`);

            // --- Selection Logic ---
            // Decide which quiz should be selected after fetching
            if (!nextSelectedQuizId) { // If no specific ID was requested to be selected...
                // Keep current selection if it still exists, otherwise select the first, or null
                if (currentQuizId && fetchedQuizzes.some(q => q.id === currentQuizId)) {
                    nextSelectedQuizId = currentQuizId;
                } else if (fetchedQuizzes.length > 0) {
                    nextSelectedQuizId = fetchedQuizzes[0].id;
                } else {
                    nextSelectedQuizId = null;
                }
            } else { // If a specific ID *was* requested...
                // Check if the requested ID actually exists in the fetched list
                if (!fetchedQuizzes.some(q => q.id === nextSelectedQuizId)) {
                    // Fallback to the first quiz or null if the requested one wasn't found
                    nextSelectedQuizId = fetchedQuizzes.length > 0 ? fetchedQuizzes[0].id : null;
                    console.warn(`Requested quiz ID ${selectIdAfterFetch} not found after fetch. Selecting ${nextSelectedQuizId}`);
                }
            }

            // --- State Reset on Selection Change ---
            // If the selected quiz is changing, reset the Quiz component's state
            if (nextSelectedQuizId !== currentQuizId) {
                 console.log(`App: Quiz selection changing from ${currentQuizId} to: ${nextSelectedQuizId}`);
                 setCurrentDisplayIndex(0); // Start from the first question
                 setQuizFinished(false);    // Not in review mode
                 setCurrentScore(0);        // Reset score
                 setCurrentlyDisplayedQuestion(null); // Clear displayed question from previous quiz
            }

            // Update the current quiz ID state
            setCurrentQuizId(nextSelectedQuizId);

            // --- Initialize Answers ---
            if (nextSelectedQuizId) {
                const quizToInit = fetchedQuizzes.find(q => q.id === nextSelectedQuizId);
                if (quizToInit) {
                    // Initialize answers array if it doesn't exist or has the wrong length
                    if (!allUserAnswers[nextSelectedQuizId] || allUserAnswers[nextSelectedQuizId].length !== quizToInit.questions.length) {
                        initializeAnswersForQuiz(nextSelectedQuizId, quizToInit.questions);
                    }
                    // If selection just changed and quiz has questions, tentatively set first displayed question
                    // Note: Quiz component will send the definitive update via onDisplayedQuestionChange
                     if (nextSelectedQuizId !== currentQuizId && quizToInit.questions.length > 0) {
                        // We don't have originalIndex for answers here yet, Quiz component handles that.
                        // setCurrentlyDisplayedQuestion({ ...quizToInit.questions[0], originalIndex: 0, answers: quizToInit.questions[0].answers.map((a,i)=>({...a, originalIndex:i})) });
                     }
                }
            }

            if (fetchedQuizzes.length === 0) {
                 console.warn("No quizzes found from the backend.");
            }
        } catch (err) {
             console.error("Error fetching quizzes:", err);
             let msg='Failed to fetch quizzes.';
             if(axios.isAxiosError(err)){msg=err.response?.data?.error||err.message;}else if(err instanceof Error){msg=err.message;}
             setError(msg);
             // Reset state on fetch error
             setCurrentQuizId(null);
             setQuizzes([]);
             setAllUserAnswers({});
             setCurrentDisplayIndex(0);
             setQuizFinished(false);
             setCurrentScore(0);
             setCurrentlyDisplayedQuestion(null);
        } finally {
             setLoading(false);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentQuizId, initializeAnswersForQuiz]); // Dependencies for the fetch function

    // Initial fetch on component mount
    useEffect(() => {
        fetchQuizzes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // Run only once on mount

    // --- Event Handlers ---

    // Called when a quiz title is clicked in QuizManager
    const handleSelectQuiz = (id: string) => {
        if (id !== currentQuizId) {
             // Let the state update trigger the logic within fetchQuizzes or a dedicated effect
             // For simplicity, we can just set the ID and rely on subsequent renders/effects
             setCurrentQuizId(id); // Update the ID
             // Explicitly reset quiz state when selection changes *manually*
             setCurrentDisplayIndex(0);
             setQuizFinished(false);
             setCurrentScore(0);
             setCurrentlyDisplayedQuestion(null);
             // Ensure answers are initialized for the newly selected quiz
             const newlySelectedQuiz = quizzes.find(q => q.id === id);
             if (newlySelectedQuiz && (!allUserAnswers[id] || allUserAnswers[id].length !== newlySelectedQuiz.questions.length)) {
                 initializeAnswersForQuiz(id, newlySelectedQuiz.questions);
             }
        } else {
             console.log("Quiz already selected:", id);
        }
    };

    // Called by Quiz component when an answer is selected/changed
    const handleAnswerUpdate = useCallback((quizId: string, originalQuestionIndex: number, originalAnswerIndex: number) => {
        setAllUserAnswers(prev => {
            const currentAnswersForQuiz = prev[quizId] ? [...prev[quizId]] : [];
            // Ensure the index is valid before updating
            if (originalQuestionIndex >= 0 && originalQuestionIndex < currentAnswersForQuiz.length) {
                currentAnswersForQuiz[originalQuestionIndex] = originalAnswerIndex;
                console.log(`App: Updated answer for Quiz ${quizId}, Q_OrigIdx ${originalQuestionIndex} to A_OrigIdx ${originalAnswerIndex}`);
                return { ...prev, [quizId]: currentAnswersForQuiz };
            } else {
                console.warn(`App: Invalid index for answer update. Q_OrigIdx: ${originalQuestionIndex}, Quiz: ${quizId}`);
                return prev; // Return previous state if index is invalid
            }
        });
    }, []);

    // Called by Quiz component when "End Review & Reset" is clicked
    const handleResetQuizAnswers = useCallback((quizId: string) => {
        const quizToReset = quizzes.find(q => q.id === quizId);
        if (quizToReset) {
            console.log(`App: Resetting quiz state for ${quizId}`);
            initializeAnswersForQuiz(quizId, quizToReset.questions); // Reset the persisted answers
            // Reset the Quiz component's state
            setQuizFinished(false);
            setCurrentScore(0);
            setCurrentDisplayIndex(0);
            setCurrentlyDisplayedQuestion(null); // Clear displayed question
        }
    }, [quizzes, initializeAnswersForQuiz]);

    // Handlers for shuffle toggles in QuizManager
    const handleShuffleQuestionsToggle = useCallback(() => setShuffleQuestions(p => !p), []);
    const handleShuffleAnswersToggle = useCallback(() => setShuffleAnswers(p => !p), []);

    // Callback for Quiz component to report its *actual* current displayed question
    // Receives the DisplayQuestion object (with original indices) or null
    const handleDisplayedQuestionUpdate = useCallback((question: DisplayQuestion | null) => {
        console.log("App: Received displayed question update from Quiz component:", question?.question_text ?? 'None');
        setCurrentlyDisplayedQuestion(question); // Update state with the object received from Quiz
    }, []);

    // --- CRUD Operation Callbacks ---
    const handleQuizCreated = (createdQuiz: QuizData | null) => {
        // Refetch the list and select the newly created quiz (if available)
        fetchQuizzes(createdQuiz?.id ?? null);
    };
    const handleQuizUpdated = () => {
        // Refetch the list and try to keep the current quiz selected
        fetchQuizzes(currentQuizId);
    };
    const handleDeleteQuizRequest = (id: string, title: string) => {
        // Show the confirmation modal
        setShowDeleteConfirm(true);
        setQuizToDelete({ id, title });
        setDeleteError(null);
    };
    const confirmDeleteQuiz = async () => {
         if (!quizToDelete) return;
         setIsDeleting(true);
         setDeleteError(null);
         try {
             console.log(`App: Deleting quiz ${quizToDelete.id}`);
             await axios.delete(`${API_BASE_URL}/api/quizzes/${quizToDelete.id}`);
             setShowDeleteConfirm(false);
             // Determine which quiz to select next
             const remainingQuizzes = quizzes.filter(q => q.id !== quizToDelete!.id);
             const nextId = remainingQuizzes.length > 0 ? remainingQuizzes[0].id : null;
             setQuizToDelete(null);
             fetchQuizzes(nextId); // Refetch the list and select the next available quiz
         } catch (err) {
             console.error("Error deleting quiz:", err);
             let msg='Failed to delete quiz.';
             if(axios.isAxiosError(err)){msg=err.response?.data?.error||err.message;}else if(err instanceof Error){msg=err.message;}
             setDeleteError(msg); // Show error in the modal
         } finally {
             setIsDeleting(false);
         }
     };
    const cancelDeleteQuiz = () => {
        // Close the modal and clear deletion state
        setShowDeleteConfirm(false);
        setQuizToDelete(null);
        setDeleteError(null);
    };

    // --- Prepare Context for Chat (Memoized) ---
    // This calculates the context object passed to the ChatApp component
    const chatContext = useMemo(() => {
        let context: any = { isReviewMode: quizFinished }; // Base context
        if (currentQuiz) {
             context.quizTitle = currentQuiz.title; // Add quiz title if available
        }

        // Use the question state reported by the Quiz component
        if (currentlyDisplayedQuestion) {
            context.questionText = currentlyDisplayedQuestion.question_text;
            // Map answers from the DisplayQuestion object (these have originalIndex)
            context.options = currentlyDisplayedQuestion.answers.map(a => a.answer_text);

            const originalQuestionIndex = currentlyDisplayedQuestion.originalIndex; // Get original index of the Q

            // Ensure we have answers persisted for this quiz
            if (originalQuestionIndex !== undefined && currentQuizAnswers) {
                 // Get the ORIGINAL index of the answer the user selected for this question
                 const userAnswerOriginalIndex = currentQuizAnswers[originalQuestionIndex];

                 // Check if the user actually answered this question
                 if (userAnswerOriginalIndex !== -1 && userAnswerOriginalIndex !== undefined) {
                     // Find the corresponding answer object *within the currently displayed question's answers*
                     // using the saved original answer index.
                     const userAnswerObject = currentlyDisplayedQuestion.answers.find(
                         (a) => a.originalIndex === userAnswerOriginalIndex // Find by originalIndex
                     );
                     context.userAnswerText = userAnswerObject?.answer_text; // The text of the answer they chose
                     context.wasCorrect = userAnswerObject?.is_correct ?? false; // Was their choice correct?
                     console.log(`App Context: Q_OrigIdx=${originalQuestionIndex}, UserAns_OrigIdx=${userAnswerOriginalIndex}, UserAnsText=${context.userAnswerText}, Correct=${context.wasCorrect}`);
                 } else {
                     // User skipped this question
                     context.userAnswerText = null;
                     context.wasCorrect = false;
                     console.log(`App Context: Q_OrigIdx=${originalQuestionIndex}, UserAns_OrigIdx=SKIPPED`);
                 }
            }
            // Find the correct answer object within the currently displayed question's answers
             const correctAnswerObject = currentlyDisplayedQuestion.answers.find(a => a.is_correct);
             context.correctAnswerText = correctAnswerObject?.answer_text; // Text of the correct answer
        }
        console.log("App: Generated Chat Context:", context); // Log the final context object
        return context;
    // Dependencies for recalculating the context
    }, [currentQuiz, currentlyDisplayedQuestion, quizFinished, currentQuizAnswers]);

    // --- Render Logic ---
    return (
        <BrowserRouter>
            <>
                {/* Quiz Manager Sidebar */}
                <QuizManager
                    quizList={quizzes}
                    selectedQuizId={currentQuizId}
                    onSelectTitleItem={handleSelectQuiz}
                    onDeleteQuiz={handleDeleteQuizRequest}
                    shuffleQuestions={shuffleQuestions}
                    shuffleAnswers={shuffleAnswers}
                    onShuffleQuestionsToggle={handleShuffleQuestionsToggle}
                    onShuffleAnswersToggle={handleShuffleAnswersToggle}
                    // Add currentUser prop here if implementing authentication
                />

                {/* Chat Application */}
                {/* Pass the dynamically calculated context */}
                <ChatApp chatContext={chatContext} />

                {/* Delete Confirmation Modal */}
                <Modal show={showDeleteConfirm} onHide={cancelDeleteQuiz} centered>
                     <Modal.Header closeButton><Modal.Title>Confirm Deletion</Modal.Title></Modal.Header>
                     <Modal.Body>
                         Are you sure you want to delete the quiz: <strong>{quizToDelete?.title}</strong>? This action cannot be undone.
                         {/* Show deletion error inside the modal */}
                         {deleteError && <BootstrapAlert variant="danger" className="mt-3">{deleteError}</BootstrapAlert>}
                     </Modal.Body>
                     <Modal.Footer>
                         <BootstrapButton variant="secondary" onClick={cancelDeleteQuiz} disabled={isDeleting}>Cancel</BootstrapButton>
                         <BootstrapButton variant="danger" onClick={confirmDeleteQuiz} disabled={isDeleting}>
                             {isDeleting ? <BootstrapSpinner as="span" animation="border" size="sm" role="status" aria-hidden="true" /> : "Delete"}
                         </BootstrapButton>
                     </Modal.Footer>
                 </Modal>

                {/* Main Content Area for Quiz, Editor, Creator */}
                 <div className="main-content-area" style={{ paddingTop: '5rem', paddingLeft: 'calc(250px + 2rem)', paddingRight: '2rem' }}> {/* Adjust padding based on QuizManager width */}
                    {loading && <p className='text-center mt-5'><BootstrapSpinner animation="border" /> Loading Quizzes...</p>}
                    {error && !loading && <BootstrapAlert variant="danger" className='text-center mt-5'>Error: {error}</BootstrapAlert>}

                    {!loading && !error && (
                        <Routes>
                            {/* Route for Editing a specific quiz */}
                            <Route path="/edit/:quizId" element={<QuizEditor onQuizUpdated={handleQuizUpdated} />}/>

                            {/* Route for Creating a new quiz */}
                            <Route path="/create" element={<QuizCreator onQuizCreated={handleQuizCreated} />} />

                            {/* Route for the main Quiz taking view */}
                            <Route path="/" element={
                                currentQuiz && currentQuizAnswers ? (
                                    // Render the Quiz component if a quiz is selected and answers are ready
                                    <>
                                        <h1 style={{ textAlign: 'center', marginBottom: '2rem' }}>{currentQuiz.title}</h1>
                                        <Quiz
                                            // Unique key to force re-mount when quiz or shuffle options change
                                            key={`${currentQuiz.id}-${shuffleQuestions}-${shuffleAnswers}`}
                                            quizId={currentQuiz.id}
                                            questions={currentQuiz.questions} // Pass original questions
                                            userAnswers={currentQuizAnswers} // Pass persisted answers
                                            onAnswerUpdate={handleAnswerUpdate} // Callback for answer selection
                                            shuffleQuestions={shuffleQuestions}
                                            shuffleAnswers={shuffleAnswers}
                                            onResetQuiz={handleResetQuizAnswers} // Callback for reset
                                            // Pass state & setters to be controlled by App
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
                                ) : (
                                     // Show a message if no quiz is selected or available
                                    <p className='text-center text-muted mt-5'>
                                        {quizzes.length === 0 ? "No quizzes available. Use 'Create New Quiz' to add one." : "Select a quiz from the menu to start."}
                                    </p>
                                )
                            } />

                            {/* Fallback route to redirect to home */}
                            <Route path="*" element={<Navigate to="/" replace />} />
                        </Routes>
                    )}
                 </div>
            </>
        </BrowserRouter>
    );
}
export default App;