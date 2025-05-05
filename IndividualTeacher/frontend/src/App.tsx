// frontend/src/App.tsx

// --- Import Statements ---
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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
axios.defaults.withCredentials = true; // Ensure cookies are sent with requests

function App() {
    // --- State Definitions ---
    const [currentUser, setCurrentUser] = useState<User | null>(null);
    const [authLoading, setAuthLoading] = useState<boolean>(true); // Tracks initial auth check + login/logout process
    const [authApiError, setAuthApiError] = useState<string | null>(null); // Errors from login/logout API calls

    const [publicQuizzes, setPublicQuizzes] = useState<QuizData[]>([]); // From DB (userId: null)
    const [userQuizzes, setUserQuizzes] = useState<QuizData[]>([]);   // From DB (userId: current user's ID)
    const [guestQuizzes, setGuestQuizzes] = useState<QuizData[]>([]);   // Temporary, frontend state only for guests

    const [currentQuizId, setCurrentQuizId] = useState<string | null>(null); // ID of the currently selected quiz
    const [loadingPublicQuizzes, setLoadingPublicQuizzes] = useState<boolean>(false); // Indicator for public list refresh
    const [loadingUserQuizzes, setLoadingUserQuizzes] = useState<boolean>(false);   // Indicator for user list refresh
    const [fetchError, setFetchError] = useState<string | null>(null); // General errors fetching quiz lists

    // --- Quiz Interaction State ---
    const [allUserAnswers, setAllUserAnswers] = useState<AllUserAnswers>({}); // { quizId: [answerIndex1, answerIndex2, ...] }
    const [shuffleQuestions, setShuffleQuestions] = useState<boolean>(true); // Display option
    const [shuffleAnswers, setShuffleAnswers] = useState<boolean>(true);   // Display option
    const [currentDisplayIndex, setCurrentDisplayIndex] = useState<number>(0); // Index of question being shown in Quiz component
    const [quizFinished, setQuizFinished] = useState<boolean>(false);        // Flag for review mode
    const [currentScore, setCurrentScore] = useState<number>(0);             // Score after finishing
    const [currentlyDisplayedQuestion, setCurrentlyDisplayedQuestion] = useState<DisplayQuestion | null>(null); // Info passed up from Quiz for Chat

    // --- Delete Modal State ---
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false); // Controls modal visibility
    const [quizToDelete, setQuizToDelete] = useState<{ id: string; title: string } | null>(null); // Info for modal
    const [isDeleting, setIsDeleting] = useState(false);        // Spinner state for delete button
    const [deleteError, setDeleteError] = useState<string | null>(null); // Error message within delete modal

    // --- Ref for stable access to state within callbacks ---
    // Holds current state values to avoid unnecessary useCallback dependencies
    const stateRef = useRef({ currentUser, currentQuizId, publicQuizzes, userQuizzes, guestQuizzes, allUserAnswers });
    useEffect(() => {
        // Keep the ref updated whenever relevant state changes
        stateRef.current = { currentUser, currentQuizId, publicQuizzes, userQuizzes, guestQuizzes, allUserAnswers };
    }, [currentUser, currentQuizId, publicQuizzes, userQuizzes, guestQuizzes, allUserAnswers]);


    // === Stable Helper Callbacks (Minimal Dependencies) ===

    const resetQuizState = useCallback(() => {
        // Resets the state related to interacting with a single quiz
        setCurrentDisplayIndex(0);
        setQuizFinished(false);
        setCurrentScore(0);
        setCurrentlyDisplayedQuestion(null);
    }, []); // No external dependencies needed

    const initializeAnswersForQuiz = useCallback((quizId: string, questions: Question[]) => {
        // Sets up the answer array for a given quiz
        console.log(`(CB) Initializing/Resetting answers for quiz ${quizId}`);
        setAllUserAnswers(prev => ({
            ...prev,
            [quizId]: Array(questions.length).fill(-1) // Fill with -1 for unanswered
        }));
    }, []); // No external dependencies needed

    // Stable handleSelectQuiz using the stateRef
    const handleSelectQuiz = useCallback((id: string | null) => {
        // Only proceed if the selected ID is different from the current one
        if (id !== stateRef.current.currentQuizId) { // Use Ref for comparison
            console.log(`(CB) Selecting quiz ${id === null ? 'null' : id}`);
            setCurrentQuizId(id); // Update the currentQuizId state
            resetQuizState();     // Reset interaction state (score, index, etc.)

            if (id !== null) {
                 // Find the selected quiz data from all available lists using the Ref
                const allKnownQuizzes = [
                    ...stateRef.current.guestQuizzes,
                    ...stateRef.current.userQuizzes,
                    ...stateRef.current.publicQuizzes
                ];
                const newlySelectedQuiz = allKnownQuizzes.find(q => q.id === id);
                // Check if answers need initialization using the Ref
                const currentAnswers = stateRef.current.allUserAnswers[id];

                if (newlySelectedQuiz && (!currentAnswers || currentAnswers.length !== newlySelectedQuiz.questions.length)) {
                    initializeAnswersForQuiz(id, newlySelectedQuiz.questions); // Call stable callback
                }
            }
        } else {
            console.log(`(CB) Quiz ${id} already selected.`);
        }
    // Depends only on the stable identities of other callbacks it calls
    }, [resetQuizState, initializeAnswersForQuiz]);


    // --- Fetching Callbacks (depend only on stable handleSelectQuiz) ---

    const fetchUserQuizzes = useCallback(async (loggedInUser: User) => {
        // Fetches quizzes belonging to the provided loggedInUser
        console.log(`(CB) Fetching quizzes for user: ${loggedInUser.id}`);
        setLoadingUserQuizzes(true);
        setFetchError(null); // Clear previous errors
        let fetchedQuizzes: QuizData[] = [];
        try {
            const response = await axios.get<QuizData[]>(`${API_BASE_URL}/api/quizzes?scope=my`, { withCredentials: true });
            fetchedQuizzes = response.data || [];
            setUserQuizzes(fetchedQuizzes); // Update state
            console.log(`(CB) Fetched ${fetchedQuizzes.length} quizzes for user ${loggedInUser.id}.`);
        } catch (err) {
            console.error("(CB) Error fetching user quizzes:", err);
             if (axios.isAxiosError(err)) {
                 if (err.response?.status === 401) { // Handle unauthorized specifically
                    setFetchError("Authentication session invalid. Please log in again.");
                    googleLogout(); setCurrentUser(null); setUserQuizzes([]); setGuestQuizzes([]); // Clear all user/guest data
                 } else { // Other Axios errors
                    let msg = `Failed to load your quizzes (Status: ${err.response?.status}): ${err.response?.data?.error || err.message}`;
                    setFetchError(msg); setUserQuizzes([]); // Clear potentially stale data
                 }
             } else if (err instanceof Error) { // Generic JS errors
                 setFetchError(`Failed to load your quizzes: ${err.message}`); setUserQuizzes([]);
             } else { // Unknown errors
                setFetchError("Unknown error fetching user quizzes."); setUserQuizzes([]);
             }
        } finally {
            setLoadingUserQuizzes(false);
            // Auto-select the first fetched user quiz *only* if no quiz is currently selected
            // Use Ref to check currentQuizId state AFTER fetch completes
            if (!stateRef.current.currentQuizId && fetchedQuizzes.length > 0) {
                 console.log("(CB) Auto-selecting first user quiz post-fetch:", fetchedQuizzes[0].id);
                 handleSelectQuiz(fetchedQuizzes[0].id); // Call stable select handler
            }
        }
    }, [handleSelectQuiz]); // Depends only on stable handleSelectQuiz

    const fetchPublicQuizzes = useCallback(async () => {
        // Fetches quizzes with userId: null from the database
        console.log("(CB) Fetching public quizzes...");
        setLoadingPublicQuizzes(true);
        setFetchError(null); // Clear previous errors
        let fetchedQuizzes: QuizData[] = [];
        try {
            const response = await axios.get<QuizData[]>(`${API_BASE_URL}/api/quizzes?scope=public`);
            fetchedQuizzes = response.data || [];
            setPublicQuizzes(fetchedQuizzes); // Update state
            console.log(`(CB) Fetched ${fetchedQuizzes.length} public quizzes.`);
        } catch (err) {
             console.error("(CB) Error fetching public quizzes:", err);
             let msg = "Failed to load public quizzes.";
             if (axios.isAxiosError(err)) { msg = `Error ${err.response?.status}: ${err.response?.data?.error || err.message}`; }
             else if (err instanceof Error) { msg = err.message; }
             else { msg = "Unknown error fetching public quizzes."; }
             setFetchError(msg); setPublicQuizzes([]); // Clear potentially stale data
        } finally {
            setLoadingPublicQuizzes(false);
             // Auto-select the first fetched public quiz *only* if no quiz is currently selected
             // AND the user is either not logged in OR has no quizzes of their own loaded yet.
             // Use Ref to check current state AFTER fetch completes
             if (!stateRef.current.currentQuizId && fetchedQuizzes.length > 0 && (!stateRef.current.currentUser || stateRef.current.userQuizzes.length === 0)) {
                 console.log("(CB) Auto-selecting first public quiz post-fetch:", fetchedQuizzes[0].id);
                 handleSelectQuiz(fetchedQuizzes[0].id); // Call stable select handler
             }
        }
    }, [handleSelectQuiz]); // Depends only on stable handleSelectQuiz


    // --- Authentication Callbacks ---

    const handleLoginSuccess = useCallback(async (credentialResponse: CredentialResponse) => {
        console.log("(CB) Google Login Success:", credentialResponse);
        setAuthApiError(null); setFetchError(null); // Clear errors
        if (!credentialResponse.credential) {
            console.error("Login Error: No credential received from Google");
            setAuthApiError("Login failed: Missing token from Google.");
            return;
        }
        setAuthLoading(true); // Indicate login process ongoing
        setGuestQuizzes([]); // Clear any temporary guest quizzes
        try {
            // Call backend to verify token and get user data
            const response = await axios.post<{ message: string; user: User }>(`${API_BASE_URL}/api/auth/google/callback`, {
                credential: credentialResponse.credential
            }, { withCredentials: true }); // Send cookies
            const userData = response.data.user;
            console.log("Backend login successful, user:", userData);
            setCurrentUser(userData); // Update user state
            await fetchUserQuizzes(userData); // Fetch user-specific quizzes
            // Fetch public quizzes again to ensure list is up-to-date and default selection logic runs correctly
            await fetchPublicQuizzes();
        } catch (err) {
             console.error("Backend Login Error:", err);
             let msg = "Failed to complete login with server.";
             if (axios.isAxiosError(err)) { msg = err.response?.data?.error || `Server Error (${err.response?.status})`; }
             else if (err instanceof Error) { msg = err.message; }
             setAuthApiError(msg); // Show login-specific error
             // Reset state on failure
             setCurrentUser(null); setUserQuizzes([]); googleLogout();
        } finally {
             setAuthLoading(false); // Login process finished
        }
    }, [fetchUserQuizzes, fetchPublicQuizzes]); // Depends on the stable fetch callbacks

    const handleLoginError = useCallback(() => {
        console.error("Google Login Failed on Frontend");
        setAuthApiError("Google sign-in process failed. Please try again.");
        setCurrentUser(null);
        setUserQuizzes([]);
        setGuestQuizzes([]); // Clear guest quizzes on login error too
    }, []);

    const handleLogout = useCallback(async () => {
        console.log("(CB) Attempting logout...");
        setAuthApiError(null); setFetchError(null); // Clear errors
        setGuestQuizzes([]); // Clear guest quizzes on logout
        try {
            await axios.post(`${API_BASE_URL}/api/auth/logout`, {}, { withCredentials: true }); // Call backend logout
            googleLogout(); // Clear Google session
            setCurrentUser(null); // Clear user state
            setUserQuizzes([]); // Clear user quizzes
            // Select the first available public quiz after logout
            const currentPublicQuizzes = stateRef.current.publicQuizzes; // Use Ref to get latest public list
            const firstPublic = currentPublicQuizzes.length > 0 ? currentPublicQuizzes[0] : null;
            handleSelectQuiz(firstPublic ? firstPublic.id : null); // Select public or null
            console.log("Logout successful");
        } catch (err) {
             console.error("Logout Error:", err);
             let msg = "Logout failed on server.";
             if (axios.isAxiosError(err)) { msg = err.response?.data?.error || `Server Error (${err.response?.status})`; }
             else if (err instanceof Error) { msg = err.message; }
             setAuthApiError(msg); // Show logout error
             // Force frontend logout state even if backend call fails
             googleLogout(); setCurrentUser(null); setUserQuizzes([]); setGuestQuizzes([]);
             // Attempt to select first public quiz even after forced logout
             const currentPublicQuizzes = stateRef.current.publicQuizzes;
             const firstPublic = currentPublicQuizzes.length > 0 ? currentPublicQuizzes[0] : null;
             handleSelectQuiz(firstPublic ? firstPublic.id : null);
        }
    }, [handleSelectQuiz]); // Depends only on stable handleSelectQuiz


    // --- CRUD Operation Callbacks ---

    const handleAnswerUpdate = useCallback((quizId: string, originalQuestionIndex: number, originalAnswerIndex: number) => {
        // Updates the answer for a specific question in the `allUserAnswers` state
        setAllUserAnswers(prev => {
            const currentAnswersForQuiz = prev[quizId] ? [...prev[quizId]] : [];
            if (originalQuestionIndex >= 0 && originalQuestionIndex < currentAnswersForQuiz.length) {
                currentAnswersForQuiz[originalQuestionIndex] = originalAnswerIndex;
                return { ...prev, [quizId]: currentAnswersForQuiz };
            } else if (originalQuestionIndex >= 0) {
                 console.warn(`Attempted to update answer for out-of-bounds question index ${originalQuestionIndex} in quiz ${quizId}.`);
            }
            return prev; // Return previous state if index is invalid or not found
        });
    }, []); // No external dependencies

    const handleResetQuizAnswers = useCallback((quizId: string) => {
        // Resets the answers and interaction state for a specific quiz
        // Use Ref to get current quizzes list to find the quiz data
        const allKnownQuizzes = [
            ...stateRef.current.guestQuizzes,
            ...stateRef.current.userQuizzes,
            ...stateRef.current.publicQuizzes
        ];
        const quizToReset = allKnownQuizzes.find(q => q.id === quizId);
        if (quizToReset) {
             console.log(`(CB) Resetting quiz state and answers for ${quizId} (Title: ${quizToReset.title})`);
             initializeAnswersForQuiz(quizId, quizToReset.questions); // Reset stored answers
             resetQuizState(); // Reset score, index, etc.
         } else {
             console.warn(`(CB) Attempted to reset answers for unknown quiz ID: ${quizId}`);
         }
    }, [initializeAnswersForQuiz, resetQuizState]); // Depends on stable callbacks

    const handleShuffleQuestionsToggle = useCallback(() => setShuffleQuestions(p => !p), []);
    const handleShuffleAnswersToggle = useCallback(() => setShuffleAnswers(p => !p), []);

    const handleDisplayedQuestionUpdate = useCallback((question: DisplayQuestion | null) => {
        // Receives information about the currently visible question from the Quiz component
        setCurrentlyDisplayedQuestion(question);
    }, []); // No external dependencies

    const handleQuizCreated = useCallback((createdQuiz: QuizData | null) => {
        // Callback triggered by QuizCreator after attempting generation
        console.log("(CB) Quiz created callback received", createdQuiz);
        setFetchError(null); // Clear previous fetch errors
        if (createdQuiz) {
             // Use Ref to check currentUser state at the moment this runs
             const currentUserFromRef = stateRef.current.currentUser;
             // Check if userId exists AND matches current user (means it was saved to DB by backend)
             if (createdQuiz.userId && currentUserFromRef && createdQuiz.userId === currentUserFromRef.id) {
                 console.log("(CB) Created quiz is USER'S (from DB), refetching user quizzes...");
                 // Fetch user quizzes and then select the new one
                 fetchUserQuizzes(currentUserFromRef).then(() => {
                     handleSelectQuiz(createdQuiz.id); // Select after fetch completes
                 });
             }
             // Check if userId is explicitly null (means it's a temporary GUEST quiz from backend)
             else if (createdQuiz.userId === null) {
                  console.log("(CB) Created quiz is for GUEST (temporary), adding to guest state.");
                  // Add the temporary quiz to the frontend-only guest list
                  setGuestQuizzes(prev => [...prev, createdQuiz]);
                  // Select the newly created guest quiz
                  handleSelectQuiz(createdQuiz.id);
             } else {
                  // This case ideally shouldn't happen if backend logic is correct
                  console.warn("(CB) Created quiz has unexpected userId, treating as public and refetching.");
                  fetchPublicQuizzes().then(() => {
                      handleSelectQuiz(createdQuiz.id); // Try selecting it anyway
                  });
             }
        } else {
            // If createdQuiz is null, it means creation failed (e.g., AI error, DB error)
            console.log("(CB) Quiz creation failed (callback received null).");
            // Optionally set an error message or refetch lists if appropriate
            setFetchError("Failed to create the quiz.");
        }
    // Depends on the stable fetch/select callbacks
    }, [fetchUserQuizzes, fetchPublicQuizzes, handleSelectQuiz]);

    const handleQuizUpdated = useCallback(() => {
        // Callback triggered by QuizEditor after successful save
        console.log("(CB) Quiz updated callback received (User quiz assumed)");
        setFetchError(null); // Clear errors
        // Only logged-in users can edit, so we must have a user. Use Ref just in case.
        const currentUserFromRef = stateRef.current.currentUser;
        if (!currentUserFromRef) {
            console.error("Quiz updated triggered but no user found in stateRef!");
            return; // Should not happen
        }
        // Refetch user quizzes and public quizzes (in case visibility changed, though unlikely)
        Promise.all([fetchPublicQuizzes(), fetchUserQuizzes(currentUserFromRef)])
            .then(() => {
                 // After fetches complete, try to re-select the quiz that was being edited
                 const currentQuizIdFromRef = stateRef.current.currentQuizId; // Get ID from Ref
                 if(currentQuizIdFromRef) {
                    console.log(`(CB) Attempting to reselect quiz ${currentQuizIdFromRef} after update.`);
                    // Check if the quiz still exists in the *latest* state fetched lists
                    const allQuizzes = [...stateRef.current.publicQuizzes, ...stateRef.current.userQuizzes];
                    if (allQuizzes.some(q => q.id === currentQuizIdFromRef)) {
                         handleSelectQuiz(currentQuizIdFromRef); // Re-select if still exists
                    } else {
                         console.log(`(CB) Quiz ${currentQuizIdFromRef} no longer found after update, selecting null.`);
                         handleSelectQuiz(null); // Deselect if it somehow disappeared
                    }
                 }
             });
    }, [fetchUserQuizzes, fetchPublicQuizzes, handleSelectQuiz]); // Depends on stable callbacks

    const handleDeleteQuizRequest = useCallback((id: string, title: string) => {
        // Opens the delete confirmation modal
        setShowDeleteConfirm(true);
        setQuizToDelete({ id, title });
        setDeleteError(null); // Clear previous delete error message
    }, []); // No external dependencies

    const confirmDeleteQuiz = useCallback(async () => {
        // Handles the actual deletion after confirmation
        // Use Ref to get currentUser - only logged-in users can delete their own quizzes
        const currentUserFromRef = stateRef.current.currentUser;
        if (!quizToDelete || !currentUserFromRef) {
             console.error("Delete confirmation attempted without quiz selected or user logged in.");
             setDeleteError("Cannot delete quiz: User not logged in or quiz not specified.");
             return;
         }
         const userToDeleteFor = currentUserFromRef; // Capture user for async calls
         const quizInfoToDelete = quizToDelete; // Capture quiz info to delete
         setIsDeleting(true); setDeleteError(null); setFetchError(null); // Set loading/clear errors
         try {
             console.log(`(CB) Deleting user quiz ${quizInfoToDelete.id}`);
             await axios.delete(`${API_BASE_URL}/api/quizzes/${quizInfoToDelete.id}`, { withCredentials: true }); // API call
             setShowDeleteConfirm(false); // Close modal on success
             setQuizToDelete(null); // Clear quiz-to-delete state

             // Refetch user quizzes to update the list AFTER successful deletion
             await fetchUserQuizzes(userToDeleteFor);

             // Determine the next quiz to select AFTER user quizzes have been refetched
             // Use Ref again to access the absolute latest state after the await
             // Note: Direct state access might be slightly delayed, functional update is safer if needed
             const remainingUserQuizzes = stateRef.current.userQuizzes; // Already filtered by the new fetch implicitly if successful
             const nextUserQuiz = remainingUserQuizzes.length > 0 ? remainingUserQuizzes[0] : null;
             const nextPublicQuiz = stateRef.current.publicQuizzes.length > 0 ? stateRef.current.publicQuizzes[0] : null;
             const nextId = nextUserQuiz?.id ?? nextPublicQuiz?.id ?? null; // Prefer user, then public
             console.log(`(CB) Deleted ${quizInfoToDelete.id}, selecting next: ${nextId}`);
             handleSelectQuiz(nextId); // Select the next available quiz (or null)

         } catch (err) {
             console.error("(CB) Error deleting quiz:", err);
             let msg = 'Failed to delete quiz.';
             if (axios.isAxiosError(err)) { msg = err.response?.data?.error || `Server Error (${err.response?.status})`; }
             else if (err instanceof Error) { msg = err.message; }
             setDeleteError(msg); // Show error within the modal
             setFetchError(msg); // Optionally show a general fetch error too
         } finally {
             setIsDeleting(false); // Stop delete button spinner
         }
    // Depends on quizToDelete state, and stable fetch/select callbacks
    }, [quizToDelete, fetchUserQuizzes, handleSelectQuiz]);

    const cancelDeleteQuiz = useCallback(() => {
        // Closes the delete confirmation modal without deleting
        setShowDeleteConfirm(false);
        setQuizToDelete(null);
        setDeleteError(null);
    }, []); // No external dependencies


    // --- Single Initial Data Loading Effect ---
    useEffect(() => {
        let isMounted = true; // Flag to prevent state updates if component unmounts during async ops
        console.log("Effect: Initial Mount - Starting sequence.");
        // Set initial loading state flags
        setAuthLoading(true);
        setLoadingPublicQuizzes(true); // Assume we'll fetch public
        setLoadingUserQuizzes(false); // User quizzes only fetched if logged in
        setFetchError(null); // Clear any previous errors

        const initialLoad = async () => {
            let initialUser: User | null = null;
            // 1. Check Authentication Status
            try {
                console.log("Effect: Checking auth status...");
                const response = await axios.get<{ isAuthenticated: boolean; user: User | null }>(
                    `${API_BASE_URL}/api/auth/status`, { withCredentials: true }
                );
                if (!isMounted) return; // Exit if component unmounted

                if (response.data.isAuthenticated && response.data.user) {
                    initialUser = response.data.user;
                    console.log("Effect: Auth check SUCCESS, user found:", initialUser.id);
                    if (isMounted) setCurrentUser(initialUser); // Set user state
                } else {
                    console.log("Effect: Auth check reveals NO user.");
                    if (isMounted) {
                        setCurrentUser(null); // Ensure user is null
                        setUserQuizzes([]);   // Ensure user quizzes are empty
                        setGuestQuizzes([]);  // Clear guest quizzes if any existed before page load
                    }
                }
            } catch (err) {
                console.error("Effect: Error checking auth status:", err);
                if (isMounted) {
                     // Assume not logged in on error
                     setCurrentUser(null); setUserQuizzes([]); setGuestQuizzes([]);
                     setFetchError("Could not verify login status.");
                }
            }

            // 2. Fetch User Quizzes (only if user was found) - Use the stable callback
            if (isMounted && initialUser) {
                console.log("Effect: Fetching user quizzes...");
                await fetchUserQuizzes(initialUser); // fetchUserQuizzes handles its loading flag
            }

            // 3. Fetch Public Quizzes (always run after auth check) - Use stable callback
            if (isMounted) {
                console.log("Effect: Fetching public quizzes...");
                await fetchPublicQuizzes(); // fetchPublicQuizzes handles its loading flag
            }

            // 4. Mark initial loading as complete
            if (isMounted) {
                console.log("Effect: Initial load sequence complete.");
                setAuthLoading(false); // The main initial load is done
            }
        };

        initialLoad();

        // Cleanup function: sets isMounted to false when component unmounts
        return () => {
            console.log("Effect: Cleanup on unmount.");
            isMounted = false;
        };
        // Depend only on the stable callback identities needed within the sequence
    }, [fetchUserQuizzes, fetchPublicQuizzes]); // Ensures the effect uses the latest stable callbacks


    // --- Derived State ---
    const isLoadingInitialData = authLoading; // Tracks the initial auth check and subsequent fetches
    const isLoadingQuizLists = loadingPublicQuizzes || loadingUserQuizzes; // Tracks ongoing list refreshes *after* initial load

    // Find the data for the currently selected quiz from all lists
    const currentQuizData = useMemo(() => {
        if (!currentQuizId) return null;
        // Check guest, then user, then public
        return guestQuizzes.find(q => q.id === currentQuizId) ||
               userQuizzes.find(q => q.id === currentQuizId) ||
               publicQuizzes.find(q => q.id === currentQuizId);
    }, [currentQuizId, guestQuizzes, userQuizzes, publicQuizzes]); // Depends on ID and all quiz lists

    // Get the answers for the current quiz
    const currentQuizAnswers = useMemo(() => currentQuizData ? allUserAnswers[currentQuizData.id] : undefined, [currentQuizData, allUserAnswers]);

    // Prepare context for the ChatApp
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
                     // Find the text of the user's selected answer
                     const userAnswerObject = currentlyDisplayedQuestion.answers.find(a => a.originalIndex === userAnswerOriginalIndex);
                     context.userAnswerText = userAnswerObject?.answer_text;
                     context.wasCorrect = userAnswerObject?.is_correct ?? false; // Check if their answer was correct
                 } else {
                     context.userAnswerText = null; // User didn't answer
                     context.wasCorrect = false;
                 }
            }
            // Find the text of the correct answer
             const correctAnswerObject = currentlyDisplayedQuestion.answers.find(a => a.is_correct);
             context.correctAnswerText = correctAnswerObject?.answer_text;
        }
        return context;
    }, [currentQuizData, currentlyDisplayedQuestion, quizFinished, currentQuizAnswers]);


    // --- Render Logic ---
    return (
        <BrowserRouter>
            <>
                {/* Quiz Manager Sidebar */}
                <QuizManager
                    guestQuizList={guestQuizzes} // Pass guest quizzes
                    publicQuizList={publicQuizzes}
                    userQuizList={userQuizzes}
                    selectedQuizId={currentQuizId}
                    onSelectTitleItem={handleSelectQuiz}
                    onDeleteQuiz={handleDeleteQuizRequest} // Pass delete initiator
                    shuffleQuestions={shuffleQuestions}
                    shuffleAnswers={shuffleAnswers}
                    onShuffleQuestionsToggle={handleShuffleQuestionsToggle}
                    onShuffleAnswersToggle={handleShuffleAnswersToggle}
                    currentUser={currentUser}
                    authLoading={isLoadingInitialData} // Use the initial loading flag here
                    onLoginSuccess={handleLoginSuccess}
                    onLoginError={handleLoginError}
                    onLogout={handleLogout}
                    loginApiError={authApiError}
                 />

                {/* Chat App Component */}
                <ChatApp chatContext={chatContext} />

                {/* Delete Confirmation Modal */}
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

                {/* Main Content Area */}
                <div className="main-content-area" style={{ paddingTop: '5rem', paddingLeft: '2rem', paddingRight: '2rem' }}>

                    {/* Loading Indicator: Show during initial load OR subsequent list refreshes */}
                    {(isLoadingInitialData || isLoadingQuizLists) && (
                         <div className='text-center mt-5 d-flex justify-content-center align-items-center'>
                             <BootstrapSpinner animation="border" size="sm" role="status" aria-hidden="true" />
                             <span className="ms-2">
                                 {isLoadingInitialData ? "Initializing..." : "Loading Quizzes..."}
                             </span>
                         </div>
                    )}

                    {/* Error Display: Show general fetch errors only when not doing the initial load */}
                    {!isLoadingInitialData && fetchError && (
                        <BootstrapAlert variant="warning" className="mt-3" onClose={() => setFetchError(null)} dismissible>
                            {fetchError}
                        </BootstrapAlert>
                    )}

                    {/* Content Area: Render Routes only when initial load is complete */}
                    {!isLoadingInitialData && (
                        <Routes>
                             {/* Edit route requires user login */}
                             <Route path="/edit/:quizId" element={ currentUser ? <QuizEditor onQuizUpdated={handleQuizUpdated} /> : <Navigate to="/" replace state={{ message: "Login required to edit quizzes." }} /> }/>
                             {/* Create route is always available, callback handles user/guest */}
                             <Route path="/create" element={ <QuizCreator onQuizCreated={handleQuizCreated} /> }/>
                             {/* Main quiz display route */}
                             <Route path="/" element={
                                 // --- REVISED RENDER CONDITION ---
                                 // 1. Do we have data for the selected quiz? If YES, render Quiz.
                                 currentQuizData && currentQuizAnswers ? (
                                     <>
                                          <h1 style={{ textAlign: 'center', marginBottom: '2rem' }}>{currentQuizData.title}</h1>
                                          <Quiz
                                              key={`${currentQuizData.id}-${shuffleQuestions}-${shuffleAnswers}`} // Use composite key
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
                                 ) : // 2. If NO quiz data, are the lists currently loading? If YES, show spinner.
                                 isLoadingQuizLists ? (
                                     <div className='text-center mt-5 d-flex justify-content-center align-items-center'>
                                         <BootstrapSpinner animation="border" size="sm" /> <span className="ms-2">Loading Quizzes...</span>
                                     </div>
                                 ) : ( // 3. If NO quiz data and NOT loading, show "Select quiz" message.
                                      <p className='text-center text-muted mt-5'>
                                          {(publicQuizzes.length === 0 && userQuizzes.length === 0 && guestQuizzes.length === 0)
                                              ? "No quizzes available. Use 'Create New Quiz'!"
                                              : "Select a quiz from the menu to start."}
                                      </p>
                                 )
                             } />
                             {/* Catch-all route redirects to home */}
                             <Route path="*" element={<Navigate to="/" replace />} />
                        </Routes>
                    )}
                 </div>
            </>
        </BrowserRouter>
    );
}

export default App;