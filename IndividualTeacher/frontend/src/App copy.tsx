// frontend/src/App.tsx

// --- Import Statements ---
import { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Modal, Button as BootstrapButton, Spinner as BootstrapSpinner, Alert as BootstrapAlert } from 'react-bootstrap';
import { CredentialResponse, googleLogout } from '@react-oauth/google';

// --- Components & Interfaces ---
import ChatApp from './components/ChatApp';
import Quiz from './components/Quiz';
import QuizManager from './components/QuizManager';
import QuizCreator from './components/QuizCreator';
import QuizEditor from './components/QuizEditor';
import { QuizData, Question, DisplayQuestion, AllUserAnswers, User, ChatContext } from './interfaces/interfaces';

// --- Config ---
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5001';
axios.defaults.withCredentials = true; // Ensure cookies are sent

function App() {
    // --- State Definitions ---
    const [currentUser, setCurrentUser] = useState<User | null>(null);
    const [authLoading, setAuthLoading] = useState<boolean>(true); // Initial check
    const [authApiError, setAuthApiError] = useState<string | null>(null);

    const [publicQuizzes, setPublicQuizzes] = useState<QuizData[]>([]);
    const [userQuizzes, setUserQuizzes] = useState<QuizData[]>([]);
    const [currentQuizId, setCurrentQuizId] = useState<string | null>(null);
    const [loadingPublicQuizzes, setLoadingPublicQuizzes] = useState<boolean>(true); // Specific loader
    const [loadingUserQuizzes, setLoadingUserQuizzes] = useState<boolean>(false); // Specific loader
    const [fetchError, setFetchError] = useState<string | null>(null); // General fetch error

    // --- Quiz Interaction State ---
    const [allUserAnswers, setAllUserAnswers] = useState<AllUserAnswers>({});
    const [shuffleQuestions, setShuffleQuestions] = useState<boolean>(true);
    const [shuffleAnswers, setShuffleAnswers] = useState<boolean>(true);
    const [currentDisplayIndex, setCurrentDisplayIndex] = useState<number>(0);
    const [quizFinished, setQuizFinished] = useState<boolean>(false);
    const [currentScore, setCurrentScore] = useState<number>(0);
    const [currentlyDisplayedQuestion, setCurrentlyDisplayedQuestion] = useState<DisplayQuestion | null>(null);

    // --- Delete Modal State ---
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [quizToDelete, setQuizToDelete] = useState<{ id: string; title: string } | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const [deleteError, setDeleteError] = useState<string | null>(null);

    // === Helper Functions (Callbacks) ===

    const resetQuizState = useCallback(() => {
        setCurrentDisplayIndex(0);
        setQuizFinished(false);
        setCurrentScore(0);
        setCurrentlyDisplayedQuestion(null);
    }, []);

    const initializeAnswersForQuiz = useCallback((quizId: string, questions: Question[]) => {
        console.log(`Initializing/resetting answers for quiz ${quizId}`);
        setAllUserAnswers(prev => ({
            ...prev,
            [quizId]: Array(questions.length).fill(-1)
        }));
    }, []);

    // Memoize handleSelectQuiz to prevent unnecessary re-renders if passed down
    const handleSelectQuiz = useCallback((id: string) => {
        if (id !== currentQuizId) {
            console.log(`App: Selecting quiz ${id}`);
            setCurrentQuizId(id);
            resetQuizState(); // Reset interaction state

            // Use combined list JUST for finding data, state remains separate
            const allKnownQuizzes = [...publicQuizzes, ...userQuizzes];
            const newlySelectedQuiz = allKnownQuizzes.find(q => q.id === id);

            if (newlySelectedQuiz && (!allUserAnswers[id] || allUserAnswers[id].length !== newlySelectedQuiz.questions.length)) {
                initializeAnswersForQuiz(id, newlySelectedQuiz.questions);
            }
        } else {
            console.log("Quiz already selected:", id);
        }
    // Add all dependencies used inside
    }, [currentQuizId, publicQuizzes, userQuizzes, allUserAnswers, initializeAnswersForQuiz, resetQuizState ]);


    const fetchUserQuizzes = useCallback(async (loggedInUser: User) => {
        // Note: loggedInUser parameter is type User (guaranteed non-null by caller)
        console.log(`Fetching quizzes for user: ${loggedInUser.id}`);
        setLoadingUserQuizzes(true);
        setFetchError(null); // Clear previous errors before fetch
        try {
            // Explicitly adding withCredentials here for debugging, though defaults should work
            const response = await axios.get<QuizData[]>(`${API_BASE_URL}/api/quizzes?scope=my`, {
                 withCredentials: true
            });
            const quizzes = response.data || [];
            setUserQuizzes(quizzes);
            console.log(`Fetched ${quizzes.length} quizzes for user ${loggedInUser.id}.`);
            // Select first user quiz only if nothing is selected currently
            if (!currentQuizId && quizzes.length > 0) {
                handleSelectQuiz(quizzes[0].id);
            } else {
                console.log(`User quizzes fetched, currentQuizId: ${currentQuizId}, user quiz count: ${quizzes.length}. No auto-selection needed.`);
            }
        } catch (err) {
            console.error("Error fetching user quizzes:", err);
             if (axios.isAxiosError(err)) {
                 if (err.response?.status === 401) {
                    console.error("Received 401 Unauthorized fetching user quizzes. Session likely invalid.");
                    setFetchError("Authentication session issue. Please log in again.");
                    // Force logout on 401 from user quiz fetch
                    googleLogout();
                    setCurrentUser(null); // Update state
                    setUserQuizzes([]);
                 } else {
                    let msg = `Failed to load your quizzes (Status: ${err.response?.status}): ${err.response?.data?.error || err.message}`;
                    setFetchError(msg);
                    setUserQuizzes([]); // Clear quizzes on error
                 }
             } else if (err instanceof Error) {
                 setFetchError(`Failed to load your quizzes: ${err.message}`);
                 setUserQuizzes([]); // Clear quizzes on error
             } else {
                 setFetchError(`An unknown error occurred while fetching user quizzes.`);
                 setUserQuizzes([]);
             }
        } finally {
           setLoadingUserQuizzes(false);
        }
    // Include handleSelectQuiz in dependencies as it's called inside
    }, [currentQuizId, handleSelectQuiz]);

    // Fetch Public Quizzes (independent of user)
    const fetchPublicQuizzes = useCallback(async () => {
        console.log("Fetching public quizzes...");
        setLoadingPublicQuizzes(true);
        setFetchError(null); // Clear previous errors before fetch
        try {
            const response = await axios.get<QuizData[]>(`${API_BASE_URL}/api/quizzes?scope=public`);
            const quizzes = response.data || [];
            setPublicQuizzes(quizzes);
            console.log(`Fetched ${quizzes.length} public quizzes.`);
            // Select first public quiz ONLY if nothing selected AND (no user OR user has no quizzes currently loaded)
            // Need to access userQuizzes state here
             if (!currentQuizId && quizzes.length > 0 && (!currentUser || userQuizzes.length === 0)) {
                 handleSelectQuiz(quizzes[0].id);
             }
        } catch (err) {
            console.error("Error fetching public quizzes:", err);
            let msg = "Failed to load public quizzes.";
            if(axios.isAxiosError(err)){msg=err.response?.data?.error||err.message;}else if(err instanceof Error){msg=err.message;}
            setFetchError(msg); // Set specific error
            setPublicQuizzes([]);
        } finally {
            setLoadingPublicQuizzes(false);
        }
    // Add dependencies used inside: currentQuizId, currentUser, userQuizzes.length, handleSelectQuiz
    }, [currentQuizId, currentUser, userQuizzes.length, handleSelectQuiz]);


    const handleLoginSuccess = useCallback(async (credentialResponse: CredentialResponse) => {
        console.log("Google Login Success:", credentialResponse);
        setAuthApiError(null);
        setFetchError(null); // Clear previous general errors
        if (!credentialResponse.credential) {
             console.error("Login Error: No credential received from Google");
             setAuthApiError("Login failed: Missing token from Google.");
             return;
        }
        setAuthLoading(true); // Show loading specifically for auth process
        try {
            const response = await axios.post<{ message: string; user: User }>(`${API_BASE_URL}/api/auth/google/callback`, {
                credential: credentialResponse.credential
            }, { withCredentials: true }); // Explicit credentials for login too
            const userData = response.data.user;
            console.log("Backend login successful, user:", userData);
            setCurrentUser(userData); // Set state FIRST
            await fetchUserQuizzes(userData); // THEN Fetch quizzes (await it)
        } catch (err) {
            console.error("Backend Login Error:", err);
            let msg = "Failed to complete login with server.";
            if (axios.isAxiosError(err)) { msg = err.response?.data?.error || `Server Error (${err.response?.status})`; }
            else if (err instanceof Error) { msg = err.message; }
            setAuthApiError(msg);
            setCurrentUser(null);
            setUserQuizzes([]);
            googleLogout();
        } finally {
             setAuthLoading(false);
        }
    }, [fetchUserQuizzes]); // Depends on fetchUserQuizzes callback identity

    const handleLoginError = useCallback(() => {
        console.error("Google Login Failed on Frontend");
        setAuthApiError("Google sign-in process failed. Please try again.");
        setCurrentUser(null);
        setUserQuizzes([]);
    }, []);

    const handleLogout = useCallback(async () => {
        console.log("Attempting logout...");
        setAuthApiError(null);
        setFetchError(null); // Clear errors on logout
        try {
            await axios.post(`${API_BASE_URL}/api/auth/logout`, {}, { withCredentials: true }); // Send credentials
            googleLogout();
            setCurrentUser(null);
            setUserQuizzes([]); // Clear user quizzes state explicitly
            // Need publicQuizzes state to select fallback
            const firstPublic = publicQuizzes.length > 0 ? publicQuizzes[0] : null;
            if (firstPublic) {
                handleSelectQuiz(firstPublic.id);
            } else {
                setCurrentQuizId(null);
                resetQuizState();
            }
            console.log("Logout successful");
        } catch (err) {
            console.error("Logout Error:", err);
             let msg = "Logout failed on server.";
             if (axios.isAxiosError(err)) { msg = err.response?.data?.error || `Server Error (${err.response?.status})`; }
             else if (err instanceof Error) { msg = err.message; }
             setAuthApiError(msg);
             // Force frontend logout even if backend fails, as session might be broken
             googleLogout();
             setCurrentUser(null);
             setUserQuizzes([]);
             // Reset selection after forced logout too
             const firstPublic = publicQuizzes.length > 0 ? publicQuizzes[0] : null;
             if (firstPublic) { handleSelectQuiz(firstPublic.id); } else { setCurrentQuizId(null); resetQuizState(); }
        }
    // Add all dependencies used inside: publicQuizzes, handleSelectQuiz, resetQuizState
    }, [publicQuizzes, handleSelectQuiz, resetQuizState]);

    // --- CRUD Operation Callbacks ---

    const handleAnswerUpdate = useCallback((quizId: string, originalQuestionIndex: number, originalAnswerIndex: number) => {
        setAllUserAnswers(prev => {
            // Ensure the quizId entry exists and is an array
            const currentAnswersForQuiz = prev[quizId] ? [...prev[quizId]] : [];
            // Ensure originalQuestionIndex is within bounds
            if (originalQuestionIndex >= 0 && originalQuestionIndex < currentAnswersForQuiz.length) {
                currentAnswersForQuiz[originalQuestionIndex] = originalAnswerIndex;
                return { ...prev, [quizId]: currentAnswersForQuiz };
            } else if (originalQuestionIndex >= 0) {
                 // Handle case where answers array might not be initialized correctly yet for the index
                 // This might happen if questions array length changes dynamically without re-initializing answers
                 console.warn(`Attempted to update answer for out-of-bounds question index ${originalQuestionIndex} in quiz ${quizId}. Current answer length: ${currentAnswersForQuiz.length}. Re-initializing might be needed.`);
                 // Optionally, resize and fill:
                 // const newAnswers = Array(originalQuestionIndex + 1).fill(-1);
                 // currentAnswersForQuiz.forEach((ans, idx) => { newAnswers[idx] = ans; });
                 // newAnswers[originalQuestionIndex] = originalAnswerIndex;
                 // return { ...prev, [quizId]: newAnswers };
            }
            return prev; // Return previous state if index is invalid
        });
    }, []); // No external dependencies needed here

     const handleResetQuizAnswers = useCallback((quizId: string) => {
         // Need publicQuizzes and userQuizzes state to find the quiz
         const allKnownQuizzes = [...publicQuizzes, ...userQuizzes];
         const quizToReset = allKnownQuizzes.find(q => q.id === quizId);
         if (quizToReset) {
             console.log(`App: Resetting quiz state and answers for ${quizId}`);
             initializeAnswersForQuiz(quizId, quizToReset.questions);
             resetQuizState(); // Resets display index, score etc.
         } else {
             console.warn(`Attempted to reset answers for unknown quiz ID: ${quizId}`);
         }
    // Add all dependencies used inside: publicQuizzes, userQuizzes, initializeAnswersForQuiz, resetQuizState
    }, [publicQuizzes, userQuizzes, initializeAnswersForQuiz, resetQuizState]);

     const handleShuffleQuestionsToggle = useCallback(() => setShuffleQuestions(p => !p), []);
     const handleShuffleAnswersToggle = useCallback(() => setShuffleAnswers(p => !p), []);

     const handleDisplayedQuestionUpdate = useCallback((question: DisplayQuestion | null) => {
        setCurrentlyDisplayedQuestion(question);
    }, []); // No external dependencies needed here

    const handleQuizCreated = useCallback((createdQuiz: QuizData | null) => {
        console.log("Quiz created callback received", createdQuiz);
        setFetchError(null); // Clear errors on successful action attempt
        if (createdQuiz) {
            // Check currentUser state *before* calling fetchUserQuizzes
            if(createdQuiz.userId && currentUser && createdQuiz.userId === currentUser.id) {
                console.log("Created quiz is user's, refetching user quizzes...");
                // Pass the *current* non-null currentUser state
                fetchUserQuizzes(currentUser).then(() => {
                     // Ensure handleSelectQuiz uses the latest quiz ID after fetch
                     handleSelectQuiz(createdQuiz.id);
                });
            } else {
                 console.log("Created quiz is public, refetching public quizzes...");
                 fetchPublicQuizzes().then(() => {
                     handleSelectQuiz(createdQuiz.id);
                 });
            }
        } else {
             console.log("Quiz creation failed or returned no data, refetching public quizzes.");
            fetchPublicQuizzes(); // Refetch public as a fallback
        }
    // Add all dependencies used inside: currentUser, fetchUserQuizzes, fetchPublicQuizzes, handleSelectQuiz
    }, [currentUser, fetchUserQuizzes, fetchPublicQuizzes, handleSelectQuiz]);

    const handleQuizUpdated = useCallback(() => {
        console.log("Quiz updated callback received");
        setFetchError(null); // Clear errors on successful action attempt
        // Check currentUser state *before* calling fetchUserQuizzes
        const fetchUserPromise = currentUser ? fetchUserQuizzes(currentUser) : Promise.resolve();
        Promise.all([fetchPublicQuizzes(), fetchUserPromise])
            .then(() => {
                // Re-check if the currently selected quiz still exists after updates
                // Need current state of publicQuizzes and userQuizzes after fetches complete
                // It's tricky because the state updates might not be immediate after the Promise resolves.
                // A safer approach might be to just re-select if the ID still exists in the passed props,
                // but even those might be stale. Re-fetching is the most reliable way to get fresh data.
                if(currentQuizId) {
                    // Re-fetching already happened. Let's assume the lists are updated conceptually.
                    // The check inside handleSelectQuiz should handle if it's gone.
                    // We might need to slightly adjust the check based on updated state, but let's try simply re-selecting.
                    console.log(`Attempting to reselect quiz ${currentQuizId} after update (if still available).`);
                    // Re-fetch might have cleared/changed selection, so force re-selection if ID is valid
                    // Note: The check if quiz exists now implicitly happens inside handleSelectQuiz based on the updated lists
                     handleSelectQuiz(currentQuizId);
                 } else {
                     console.log("No quiz was selected, nothing to re-select after update.");
                 }
             });
    // Add all dependencies used inside
    }, [currentQuizId, currentUser, fetchPublicQuizzes, fetchUserQuizzes, handleSelectQuiz /* Removed state list dependencies here, rely on re-fetch */ ]);

    const handleDeleteQuizRequest = useCallback((id: string, title: string) => {
        setShowDeleteConfirm(true);
        setQuizToDelete({ id, title });
        setDeleteError(null); // Clear previous delete error
    }, []); // No external dependencies needed here

    const confirmDeleteQuiz = useCallback(async () => {
         // Add check for currentUser here too
         if (!quizToDelete || !currentUser) {
             console.error("Delete confirmation attempted without quiz or user selected.");
             setDeleteError("Cannot delete quiz: user not logged in.");
             return;
         }
         setIsDeleting(true);
         setDeleteError(null);
         setFetchError(null); // Clear general errors on action attempt
         try {
             console.log(`App: Deleting quiz ${quizToDelete.id}`);
             await axios.delete(`${API_BASE_URL}/api/quizzes/${quizToDelete.id}`, { withCredentials: true }); // Send credentials
             setShowDeleteConfirm(false);
             const deletedId = quizToDelete.id; // Store ID before clearing state

             // Refetch user quizzes ONLY is safer as only owned quizzes can be deleted
             // Await the fetch to ensure userQuizzes state is updated before selecting next
             await fetchUserQuizzes(currentUser);

             // Select next quiz AFTER user quizzes have been refetched
             // Access the LATEST userQuizzes state directly here, not from closure
             setUserQuizzes(currentFetchedUserQuizzes => {
                 const remainingUserQuizzes = currentFetchedUserQuizzes.filter(q => q.id !== deletedId);
                 const nextUserQuiz = remainingUserQuizzes.length > 0 ? remainingUserQuizzes[0] : null;
                 // Access latest publicQuizzes state
                 setPublicQuizzes(currentFetchedPublicQuizzes => {
                      const nextPublicQuiz = currentFetchedPublicQuizzes.length > 0 ? currentFetchedPublicQuizzes[0] : null;
                      const nextId = nextUserQuiz?.id ?? nextPublicQuiz?.id ?? null;

                      if(nextId) {
                        console.log(`Deleted ${deletedId}, selecting next available quiz: ${nextId}`);
                        // Use handleSelectQuiz which internally sets currentQuizId state
                        handleSelectQuiz(nextId);
                      } else {
                        console.log(`Deleted ${deletedId}, no other quizzes available.`);
                        // Use setCurrentQuizId directly if handleSelectQuiz isn't appropriate here
                        setCurrentQuizId(null);
                        resetQuizState();
                      }
                      return currentFetchedPublicQuizzes; // Return state for setPublicQuizzes
                 });
                 return currentFetchedUserQuizzes; // Return state for setUserQuizzes
             });


             setQuizToDelete(null); // Clear the quiz-to-delete state

         } catch (err) {
             console.error("Error deleting quiz:", err);
             let msg = 'Failed to delete quiz.';
             if (axios.isAxiosError(err)) { msg = err.response?.data?.error || `Server Error (${err.response?.status})`; }
             else if (err instanceof Error) { msg = err.message; }
             setDeleteError(msg);
             setFetchError(msg); // Show error prominently
         } finally {
             setIsDeleting(false);
         }
    // Add all dependencies used inside: quizToDelete, currentUser, fetchUserQuizzes, handleSelectQuiz, resetQuizState
    // Note: Accessing state directly in the .then() or after await might use stale closure values.
    // Using the functional update form of setState (e.g., setUserQuizzes(current => ...)) is safer if needed, but await should update scope.
    // Let's stick with await first. Added publicQuizzes as dependency due to fallback logic.
    }, [quizToDelete, currentUser, fetchUserQuizzes, publicQuizzes, handleSelectQuiz, resetQuizState]);


    const cancelDeleteQuiz = useCallback(() => {
        setShowDeleteConfirm(false);
        setQuizToDelete(null);
        setDeleteError(null);
    }, []); 
    





    // --- Derived State ---
    const isLoadingAnyData = authLoading || loadingPublicQuizzes || loadingUserQuizzes;
    const currentQuizData = useMemo(() => {
        if (!currentQuizId) return null;
        return userQuizzes.find(q => q.id === currentQuizId) || publicQuizzes.find(q => q.id === currentQuizId);
    }, [currentQuizId, publicQuizzes, userQuizzes]);

    const currentQuizAnswers = useMemo(() => currentQuizData ? allUserAnswers[currentQuizData.id] : undefined, [currentQuizData, allUserAnswers]);

    const chatContext: ChatContext = useMemo(() => {
        let context: ChatContext = { isReviewMode: quizFinished };
        if (currentQuizData) {
             context.quizTitle = currentQuizData.title;
        }
        if (currentlyDisplayedQuestion) {
            context.questionText = currentlyDisplayedQuestion.question_text;
            context.options = currentlyDisplayedQuestion.answers.map(a => a.answer_text);
            const originalQuestionIndex = currentlyDisplayedQuestion.originalIndex;

            if (originalQuestionIndex !== undefined && currentQuizAnswers) {
                 const userAnswerOriginalIndex = currentQuizAnswers[originalQuestionIndex];
                 if (userAnswerOriginalIndex !== -1 && userAnswerOriginalIndex !== undefined) {
                     const userAnswerObject = currentlyDisplayedQuestion.answers.find(a => a.originalIndex === userAnswerOriginalIndex);
                     context.userAnswerText = userAnswerObject?.answer_text;
                     context.wasCorrect = userAnswerObject?.is_correct ?? false;
                 } else {
                     context.userAnswerText = null;
                     context.wasCorrect = false;
                 }
            }
             const correctAnswerObject = currentlyDisplayedQuestion.answers.find(a => a.is_correct);
             context.correctAnswerText = correctAnswerObject?.answer_text;
        }
        return context;
    }, [currentQuizData, currentlyDisplayedQuestion, quizFinished, currentQuizAnswers]);


    useEffect(() => {
        let isMounted = true;
        console.log("Effect 1: Checking auth status on mount...");
        setAuthLoading(true);
        setAuthApiError(null);
        setFetchError(null);

        const checkAuth = async () => {
            try {
                const response = await axios.get<{ isAuthenticated: boolean; user: User | null }>(
                    `${API_BASE_URL}/api/auth/status`, { withCredentials: true }
                );
                if (isMounted) {
                    if (response.data.isAuthenticated && response.data.user) {
                        console.log("Effect 1: Auth check SUCCESS, setting user state.");
                        setCurrentUser(response.data.user);
                    } else {
                        console.log("Effect 1: Auth check reveals NO user, setting user state to null.");
                        setCurrentUser(null);
                        setUserQuizzes([]);
                    }
                }
            } catch (err) {
                console.error("Effect 1: Error checking auth status:", err);
                if (isMounted) {
                    setCurrentUser(null);
                    setUserQuizzes([]);
                    setFetchError("Could not verify login status with server.");
                }
            } finally {
                if (isMounted) {
                    console.log("Effect 1: Auth check finished, setting authLoading to false.");
                    setAuthLoading(false);
                }
            }
        };
        checkAuth();
        return () => { console.log("Effect 1: Cleanup."); isMounted = false; };
    }, []); // Empty dependency array: runs only once on mount

    // Effect 2: Fetch User Quizzes WHEN currentUser is known (and not loading auth)
    useEffect(() => {
        let isMounted = true;
        if (!authLoading && currentUser) {
            console.log("Effect 2: Triggered - !authLoading and currentUser exists. Fetching user quizzes.");
            fetchUserQuizzes(currentUser); // Call stable callback
        } else {
             console.log(`Effect 2: Skipped - authLoading: ${authLoading}, currentUser: ${!!currentUser}`);
        }
        return () => { isMounted = false; console.log("Effect 2: Cleanup (no action).");};
    // Rerun when auth finishes, user changes, or fetch callback identity changes
    }, [authLoading, currentUser, fetchUserQuizzes]);

    
    // Effect 3: Fetch Public Quizzes AFTER initial auth check is done
    useEffect(() => {
        let isMounted = true;
        if (!authLoading) {
             console.log("Effect 3: Triggered - !authLoading. Fetching public quizzes.");
             fetchPublicQuizzes(); // Call stable callback
        } else {
            console.log(`Effect 3: Skipped - authLoading: ${authLoading}`);
        }
        return () => { isMounted = false; console.log("Effect 3: Cleanup (no action).");};
    // Rerun when auth finishes or fetch callback identity changes
    }, [authLoading, fetchPublicQuizzes]);
    


    // --- Render Logic ---
    return (
        <BrowserRouter>
            <>
                <QuizManager
                    publicQuizList={publicQuizzes}
                    userQuizList={userQuizzes}
                    selectedQuizId={currentQuizId}
                    onSelectTitleItem={handleSelectQuiz}
                    onDeleteQuiz={handleDeleteQuizRequest}
                    shuffleQuestions={shuffleQuestions}
                    shuffleAnswers={shuffleAnswers}
                    onShuffleQuestionsToggle={handleShuffleQuestionsToggle}
                    onShuffleAnswersToggle={handleShuffleAnswersToggle}
                    currentUser={currentUser}
                    authLoading={authLoading} // Pass initial auth loading status
                    onLoginSuccess={handleLoginSuccess}
                    onLoginError={handleLoginError}
                    onLogout={handleLogout}
                    loginApiError={authApiError}
                 />

                <ChatApp chatContext={chatContext} />

                <Modal show={showDeleteConfirm} onHide={cancelDeleteQuiz} centered>
                    <Modal.Header closeButton><Modal.Title>Confirm Deletion</Modal.Title></Modal.Header>
                    <Modal.Body>
                         Are you sure you want to delete the quiz: <strong>{quizToDelete?.title}</strong>? This action cannot be undone.
                         {deleteError && <BootstrapAlert variant="danger" className="mt-3">{deleteError}</BootstrapAlert>}
                     </Modal.Body>
                     <Modal.Footer>
                         <BootstrapButton variant="secondary" onClick={cancelDeleteQuiz} disabled={isDeleting}>Cancel</BootstrapButton>
                         <BootstrapButton variant="danger" onClick={confirmDeleteQuiz} disabled={isDeleting}>
                             {isDeleting ? <BootstrapSpinner as="span" animation="border" size="sm" role="status" aria-hidden="true" /> : "Delete"}
                         </BootstrapButton>
                     </Modal.Footer>
                </Modal>

                <div className="main-content-area" style={{ paddingTop: '5rem', paddingLeft: 'calc(250px + 2rem)', paddingRight: '2rem' }}>

                    {/* Loading Indicator */}
                    {isLoadingAnyData && (
                         <div className='text-center mt-5 d-flex justify-content-center align-items-center'>
                             <BootstrapSpinner animation="border" size="sm" role="status" aria-hidden="true" />
                             <span className="ms-2">
                                 {authLoading ? "Authenticating..." : (loadingPublicQuizzes || loadingUserQuizzes ? "Loading Quizzes..." : "Loading...")}
                             </span>
                         </div>
                    )}

                    {/* Error Display - Show general fetch error if not loading */}
                    {!isLoadingAnyData && fetchError && (
                        <BootstrapAlert variant="warning" className="mt-3" onClose={() => setFetchError(null)} dismissible>
                            {fetchError}
                        </BootstrapAlert>
                    )}

                    {/* Content Area - Render only when not loading */}
                    {!isLoadingAnyData && (
                        <Routes>
                            <Route path="/edit/:quizId" element={
                                currentUser ? <QuizEditor onQuizUpdated={handleQuizUpdated} /> : <Navigate to="/" replace state={{ message: "Login required to edit quizzes." }} />
                            }/>
                            <Route path="/create" element={
                                <QuizCreator onQuizCreated={handleQuizCreated} />
                            }/>
                            <Route path="/" element={
                                // Render quiz only if data is loaded and a quiz is selected
                                !fetchError && currentQuizData && currentQuizAnswers ? (
                                    <>
                                        <h1 style={{ textAlign: 'center', marginBottom: '2rem' }}>{currentQuizData.title}</h1>
                                        <Quiz
                                            key={`${currentQuizData.id}-${shuffleQuestions}-${shuffleAnswers}`}
                                            quizId={currentQuizData.id}
                                            questions={currentQuizData.questions}
                                            userAnswers={currentQuizAnswers}
                                            onAnswerUpdate={handleAnswerUpdate}
                                            shuffleQuestions={shuffleQuestions}
                                            shuffleAnswers={shuffleAnswers}
                                            onResetQuiz={handleResetQuizAnswers}
                                            isReviewMode={quizFinished}
                                            currentDisplayIndex={currentDisplayIndex}
                                            score={currentScore}
                                            setQuizFinished={setQuizFinished}
                                            setCurrentDisplayIndex={setCurrentDisplayIndex}
                                            setScore={setCurrentScore}
                                            onDisplayedQuestionChange={handleDisplayedQuestionUpdate}
                                        />
                                    </>
                                ) : // Render message if no quiz selected (and no error preventing selection)
                                !fetchError ? (
                                     <p className='text-center text-muted mt-5'>
                                         {(publicQuizzes.length === 0 && userQuizzes.length === 0)
                                             ? "No quizzes available. Use 'Create New Quiz'!"
                                             : "Select a quiz from the menu to start."}
                                     </p>
                                ) : null // Render nothing if there was a fetch error (already displayed above)
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



