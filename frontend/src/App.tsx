


import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import axios from 'axios';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Modal, Button as BootstrapButton, Spinner as BootstrapSpinner, Alert as BootstrapAlert } from 'react-bootstrap';
import { CredentialResponse, googleLogout } from '@react-oauth/google';


import ChatApp from './components/ChatApp';
import Quiz from './components/Quiz';
import QuizManager from './components/QuizManager';
import QuizCreator from './components/QuizCreator';
import QuizEditor from './components/QuizEditor';
import { QuizData, Question, DisplayQuestion, AllUserAnswers, User, ChatContext } from './interfaces/interfaces';
import { RecommendationsResponse } from './interfaces/recommendations';


const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5001';
axios.defaults.withCredentials = true;


type ApiError = {
    message: string;
    status?: number;
};


const handleApiError = (error: unknown, defaultMessage: string): ApiError => {
    if (axios.isAxiosError(error)) {
        return {
            message: error.response?.data?.error || error.message,
            status: error.response?.status
        };
    }
    if (error instanceof Error) {
        return { message: error.message };
    }
    return { message: defaultMessage };
};

function App() {

    const [currentUser, setCurrentUser] = useState<User | null>(null);
    const [authLoading, setAuthLoading] = useState<boolean>(true);
    const [authApiError, setAuthApiError] = useState<string | null>(null);

    const [publicQuizzes, setPublicQuizzes] = useState<QuizData[]>([]);
    const [userQuizzes, setUserQuizzes] = useState<QuizData[]>([]);
    const [guestQuizzes, setGuestQuizzes] = useState<QuizData[]>([]);

    const [currentQuizId, setCurrentQuizId] = useState<string | null>(null);
    const [loadingPublicQuizzes, setLoadingPublicQuizzes] = useState<boolean>(false);
    const [loadingUserQuizzes, setLoadingUserQuizzes] = useState<boolean>(false);
    const [fetchError, setFetchError] = useState<string | null>(null);


    const [allUserAnswers, setAllUserAnswers] = useState<AllUserAnswers>({});
    const [shuffleQuestions, setShuffleQuestions] = useState<boolean>(true);
    const [shuffleAnswers, setShuffleAnswers] = useState<boolean>(true);
    const [currentDisplayIndex, setCurrentDisplayIndex] = useState<number>(0);
    const [quizFinished, setQuizFinished] = useState<boolean>(false);
    const [currentScore, setCurrentScore] = useState<number>(0);
    const [currentlyDisplayedQuestion, setCurrentlyDisplayedQuestion] = useState<DisplayQuestion | null>(null);


    const [recommendations, setRecommendations] = useState<RecommendationsResponse>({});
    const [loadingRecommendations, setLoadingRecommendations] = useState<boolean>(false);
    const [recommendationsError, setRecommendationsError] = useState<string | null>(null);


    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [quizToDelete, setQuizToDelete] = useState<{ id: string; title: string } | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const [deleteError, setDeleteError] = useState<string | null>(null);


    const stateRef = useRef({ currentUser, currentQuizId, publicQuizzes, userQuizzes, guestQuizzes, allUserAnswers });
    useEffect(() => {

        stateRef.current = { currentUser, currentQuizId, publicQuizzes, userQuizzes, guestQuizzes, allUserAnswers };
    }, [currentUser, currentQuizId, publicQuizzes, userQuizzes, guestQuizzes, allUserAnswers]);


    const resetQuizState = useCallback(() => {

        setCurrentDisplayIndex(0);
        setQuizFinished(false);
        setCurrentScore(0);
        setCurrentlyDisplayedQuestion(null);
        setRecommendations({});
        setRecommendationsError(null);
    }, []);

    const initializeAnswersForQuiz = useCallback((quizId: string, questions: Question[]) => {

        console.log(`(CB) Initializing/Resetting answers for quiz ${quizId}`);
        setAllUserAnswers(prev => ({
            ...prev,
            [quizId]: Array(questions.length).fill(-1)
        }));
    }, []);


    const handleSelectQuiz = useCallback((id: string | null) => {

        if (id !== stateRef.current.currentQuizId) {
            console.log(`(CB) Selecting quiz ${id === null ? 'null' : id}`);
            setCurrentQuizId(id);
            resetQuizState();

            if (id !== null) {

                const allKnownQuizzes = [
                    ...stateRef.current.guestQuizzes,
                    ...stateRef.current.userQuizzes,
                    ...stateRef.current.publicQuizzes
                ];
                const newlySelectedQuiz = allKnownQuizzes.find(q => q.id === id);

                const currentAnswers = stateRef.current.allUserAnswers[id];

                if (newlySelectedQuiz && (!currentAnswers || currentAnswers.length !== newlySelectedQuiz.questions.length)) {
                    initializeAnswersForQuiz(id, newlySelectedQuiz.questions);
                }
            }
        } else {
            console.log(`(CB) Quiz ${id} already selected.`);
        }

    }, [resetQuizState, initializeAnswersForQuiz]);


    const fetchUserQuizzes = useCallback(async (loggedInUser: User) => {
        console.log(`(CB) Fetching quizzes for user: ${loggedInUser.id}`);
        setLoadingUserQuizzes(true);
        setFetchError(null);
        let fetchedQuizzes: QuizData[] = [];

        try {
            const response = await axios.get<QuizData[]>(`${API_BASE_URL}/api/quizzes?scope=my`, { withCredentials: true });
            fetchedQuizzes = response.data || [];
            setUserQuizzes(fetchedQuizzes);
            console.log(`(CB) Fetched ${fetchedQuizzes.length} quizzes for user ${loggedInUser.id}.`);
        } catch (err) {
            const error = handleApiError(err, "Unknown error fetching user quizzes");
            console.error("(CB) Error fetching user quizzes:", error);

            if (error.status === 401) {
                setFetchError("Authentication session invalid. Please log in again.");
                googleLogout();
                setCurrentUser(null);
                setUserQuizzes([]);
                setGuestQuizzes([]);
            } else {
                setFetchError(`Failed to load your quizzes: ${error.message}`);
                setUserQuizzes([]);
            }
        } finally {
            setLoadingUserQuizzes(false);


        }
        return fetchedQuizzes;
    }, [handleSelectQuiz]);

    const fetchPublicQuizzes = useCallback(async () => {
        console.log("(CB) Fetching public quizzes...");
        setLoadingPublicQuizzes(true);
        setFetchError(null);
        let fetchedQuizzes: QuizData[] = [];

        try {
            const response = await axios.get<QuizData[]>(`${API_BASE_URL}/api/quizzes?scope=public`);
            fetchedQuizzes = response.data || [];
            setPublicQuizzes(fetchedQuizzes);
            console.log(`(CB) Fetched ${fetchedQuizzes.length} public quizzes.`);
        } catch (err) {
            const error = handleApiError(err, "Unknown error fetching public quizzes");
            console.error("(CB) Error fetching public quizzes:", error);
            setFetchError(`Failed to load public quizzes: ${error.message}`);
            setPublicQuizzes([]);
        } finally {
            setLoadingPublicQuizzes(false);


        }
        return fetchedQuizzes;
    }, [handleSelectQuiz]);


    const handleLoginSuccess = useCallback(async (credentialResponse: CredentialResponse) => {
        console.log("(CB) Google Login Success:", credentialResponse);
        setAuthApiError(null); setFetchError(null);
        if (!credentialResponse.credential) {
            console.error("Login Error: No credential received from Google");
            setAuthApiError("Login failed: Missing token from Google.");
            return;
        }
        setAuthLoading(true);
        setGuestQuizzes([]);
        try {

            const response = await axios.post<{ message: string; user: User }>(`${API_BASE_URL}/api/auth/google/callback`, {
                credential: credentialResponse.credential
            }, { withCredentials: true });
            const userData = response.data.user;
            console.log("Backend login successful, user:", userData);
            setCurrentUser(userData);
            await fetchUserQuizzes(userData);

            await fetchPublicQuizzes();
        } catch (err) {
             console.error("Backend Login Error:", err);
             let msg = "Failed to complete login with server.";
             if (axios.isAxiosError(err)) { msg = err.response?.data?.error || `Server Error (${err.response?.status})`; }
             else if (err instanceof Error) { msg = err.message; }
             setAuthApiError(msg);

             setCurrentUser(null); setUserQuizzes([]); googleLogout();
        } finally {
             setAuthLoading(false);
        }
    }, [fetchUserQuizzes, fetchPublicQuizzes]);

    const handleLoginError = useCallback(() => {
        console.error("Google Login Failed on Frontend");
        setAuthApiError("Google sign-in process failed. Please try again.");
        setCurrentUser(null);
        setUserQuizzes([]);
        setGuestQuizzes([]);
    }, []);

    const handleLogout = useCallback(async () => {
        console.log("(CB) Attempting logout...");
        setAuthApiError(null); setFetchError(null);
        setGuestQuizzes([]);
        try {
            await axios.post(`${API_BASE_URL}/api/auth/logout`, {}, { withCredentials: true });
            googleLogout();
            setCurrentUser(null);
            setUserQuizzes([]);

            const currentPublicQuizzes = stateRef.current.publicQuizzes;
            const firstPublic = currentPublicQuizzes.length > 0 ? currentPublicQuizzes[0] : null;
            handleSelectQuiz(firstPublic ? firstPublic.id : null);
            console.log("Logout successful");
        } catch (err) {
             console.error("Logout Error:", err);
             let msg = "Logout failed on server.";
             if (axios.isAxiosError(err)) { msg = err.response?.data?.error || `Server Error (${err.response?.status})`; }
             else if (err instanceof Error) { msg = err.message; }
             setAuthApiError(msg);

             googleLogout(); setCurrentUser(null); setUserQuizzes([]); setGuestQuizzes([]);

             const currentPublicQuizzes = stateRef.current.publicQuizzes;
             const firstPublic = currentPublicQuizzes.length > 0 ? currentPublicQuizzes[0] : null;
             handleSelectQuiz(firstPublic ? firstPublic.id : null);
        }
    }, [handleSelectQuiz]);


    const handleAnswerUpdate = useCallback((quizId: string, originalQuestionIndex: number, originalAnswerIndex: number) => {

        setAllUserAnswers(prev => {
            const currentAnswersForQuiz = prev[quizId] ? [...prev[quizId]] : [];
            if (originalQuestionIndex >= 0 && originalQuestionIndex < currentAnswersForQuiz.length) {
                currentAnswersForQuiz[originalQuestionIndex] = originalAnswerIndex;
                return { ...prev, [quizId]: currentAnswersForQuiz };
            } else if (originalQuestionIndex >= 0) {
                 console.warn(`Attempted to update answer for out-of-bounds question index ${originalQuestionIndex} in quiz ${quizId}.`);
            }
            return prev;
        });
    }, []);

    const handleResetQuizAnswers = useCallback((quizId: string) => {


        const allKnownQuizzes = [
            ...stateRef.current.guestQuizzes,
            ...stateRef.current.userQuizzes,
            ...stateRef.current.publicQuizzes
        ];
        const quizToReset = allKnownQuizzes.find(q => q.id === quizId);
        if (quizToReset) {
             console.log(`(CB) Resetting quiz state and answers for ${quizId} (Title: ${quizToReset.title})`);
             initializeAnswersForQuiz(quizId, quizToReset.questions);
             resetQuizState();
         } else {
             console.warn(`(CB) Attempted to reset answers for unknown quiz ID: ${quizId}`);
         }
    }, [initializeAnswersForQuiz, resetQuizState]);

    const handleShuffleQuestionsToggle = useCallback(() => setShuffleQuestions(p => !p), []);
    const handleShuffleAnswersToggle = useCallback(() => setShuffleAnswers(p => !p), []);

    const handleDisplayedQuestionUpdate = useCallback((question: DisplayQuestion | null) => {

        setCurrentlyDisplayedQuestion(question);
    }, []);

    const [pendingSelectQuizId, setPendingSelectQuizId] = useState<string | null>(null);
    const handleQuizCreated = useCallback(async (createdQuiz: QuizData | null) => {
    console.log("(CB) Quiz created callback received", createdQuiz);
    setFetchError(null);

    if (!createdQuiz) {
        console.log("(CB) Quiz creation failed (callback received null).");
        setFetchError("Failed to create the quiz.");
        return;
    }

    const currentUserFromRef = stateRef.current.currentUser;

    try {
        if (currentUserFromRef && (!createdQuiz.userId || createdQuiz.userId === currentUserFromRef.id)) {
            console.log("(CB) Created quiz is USER'S (from DB), refetching user quizzes...");
            await fetchUserQuizzes(currentUserFromRef);

            setPendingSelectQuizId(createdQuiz.id);
        } else if (createdQuiz.userId === null) {
            console.log("(CB) Created quiz is for GUEST (temporary), adding to guest state.");
            setGuestQuizzes(prev => {
                const updated = [...prev, createdQuiz];

                setTimeout(() => handleSelectQuiz(createdQuiz.id), 0);
                return updated;
            });
        } else {
            console.warn("(CB) Created quiz has unexpected userId, treating as public and refetching.");
            await fetchPublicQuizzes();
            setTimeout(() => handleSelectQuiz(createdQuiz.id), 0);
        }
    } catch (err) {
        const error = handleApiError(err, "Failed to process created quiz");
        console.error("(CB) Error processing created quiz:", error);
        setFetchError(error.message);
    }
}, [fetchUserQuizzes, fetchPublicQuizzes, handleSelectQuiz]);

    const handleQuizUpdated = useCallback(async () => {

        console.log("(CB) Quiz updated callback received (User quiz assumed)");
        setFetchError(null);

        const currentUserFromRef = stateRef.current.currentUser;
        if (!currentUserFromRef) {
            console.error("Quiz updated triggered but no user found in stateRef!");
            return;
        }

        const [refetchedPublicQuizzes, refetchedUserQuizzes] = await Promise.all([
            fetchPublicQuizzes(),
            fetchUserQuizzes(currentUserFromRef)
        ]);


        const currentQuizIdFromRef = stateRef.current.currentQuizId;
        if(currentQuizIdFromRef) {
           console.log(`(CB) Attempting to reselect quiz ${currentQuizIdFromRef} after update.`);

           const allQuizzes = [...refetchedPublicQuizzes, ...refetchedUserQuizzes];
           if (allQuizzes.some(q => q.id === currentQuizIdFromRef)) {
                handleSelectQuiz(currentQuizIdFromRef);
           } else {
                console.log(`(CB) Quiz ${currentQuizIdFromRef} no longer found after update, selecting null.`);
                handleSelectQuiz(null);
           }
        }
    }, [fetchUserQuizzes, fetchPublicQuizzes, handleSelectQuiz]);

    const handleDeleteQuizRequest = useCallback((id: string, title: string) => {

        setShowDeleteConfirm(true);
        setQuizToDelete({ id, title });
        setDeleteError(null);
    }, []);

    const confirmDeleteQuiz = useCallback(async () => {
        const currentUserFromRef = stateRef.current.currentUser;
        if (!quizToDelete || !currentUserFromRef) {
            console.error("Delete confirmation attempted without quiz selected or user logged in.");
            setDeleteError("Cannot delete quiz: User not logged in or quiz not specified.");
            return;
        }

        setIsDeleting(true);
        setDeleteError(null);
        setFetchError(null);

        try {
            console.log(`(CB) Deleting user quiz ${quizToDelete.id}`);
            await axios.delete(`${API_BASE_URL}/api/quizzes/${quizToDelete.id}`, { withCredentials: true });

            setShowDeleteConfirm(false);
            setQuizToDelete(null);

            const remainingUserQuizzes = await fetchUserQuizzes(currentUserFromRef);
            const nextUserQuiz = remainingUserQuizzes[0] ?? null;
            const nextPublicQuiz = stateRef.current.publicQuizzes[0] ?? null;
            const nextId = nextUserQuiz?.id ?? nextPublicQuiz?.id ?? null;

            console.log(`(CB) Deleted ${quizToDelete.id}, selecting next: ${nextId}`);
            handleSelectQuiz(nextId);
        } catch (err) {
            const error = handleApiError(err, "Failed to delete quiz");
            console.error("(CB) Error deleting quiz:", error);
            setDeleteError(error.message);
            setFetchError(error.message);
        } finally {
            setIsDeleting(false);
        }
    }, [quizToDelete, fetchUserQuizzes, handleSelectQuiz]);

    const cancelDeleteQuiz = useCallback(() => {

        setShowDeleteConfirm(false);
        setQuizToDelete(null);
        setDeleteError(null);
    }, []);

    useEffect(() => {
        if (pendingSelectQuizId) {

            const foundQuiz =
                guestQuizzes.find(q => q.id === pendingSelectQuizId) ||
                userQuizzes.find(q => q.id === pendingSelectQuizId) ||
                publicQuizzes.find(q => q.id === pendingSelectQuizId);

            if (foundQuiz) {
                handleSelectQuiz(pendingSelectQuizId);
                setPendingSelectQuizId(null);
            }
        }
    }, [pendingSelectQuizId, guestQuizzes, userQuizzes, publicQuizzes, handleSelectQuiz]);


    useEffect(() => {
        let isMounted = true;
        console.log("Effect: Initial Mount - Starting sequence.");

        setAuthLoading(true);
        setLoadingPublicQuizzes(true);
        setLoadingUserQuizzes(false);
        setFetchError(null);

        const initialLoad = async () => {
            let initialUser: User | null = null;

            try {
                console.log("Effect: Checking auth status...");
                const response = await axios.get<{ isAuthenticated: boolean; user: User | null }>(
                    `${API_BASE_URL}/api/auth/status`, { withCredentials: true }
                );
                if (!isMounted) return;

                if (response.data.isAuthenticated && response.data.user) {
                    initialUser = response.data.user;
                    console.log("Effect: Auth check SUCCESS, user found:", initialUser.id);
                    if (isMounted) setCurrentUser(initialUser);
                } else {
                    console.log("Effect: Auth check reveals NO user.");
                    if (isMounted) {
                        setCurrentUser(null);
                        setUserQuizzes([]);
                        setGuestQuizzes([]);
                    }
                }
            } catch (err) {
                console.error("Effect: Error checking auth status:", err);
                if (isMounted) {

                     setCurrentUser(null); setUserQuizzes([]); setGuestQuizzes([]);
                     setFetchError("Could not verify login status.");
                }
            }


            if (isMounted && initialUser) {
                console.log("Effect: Fetching user quizzes...");
                await fetchUserQuizzes(initialUser);
            }


            if (isMounted) {
                console.log("Effect: Fetching public quizzes...");
                await fetchPublicQuizzes();
            }


            if (isMounted) {
                console.log("Effect: Initial load sequence complete.");
                setAuthLoading(false);
            }
        };

        initialLoad();


        return () => {
            console.log("Effect: Cleanup on unmount.");
            isMounted = false;
        };

    }, [fetchUserQuizzes, fetchPublicQuizzes]);


    const isLoadingInitialData = authLoading;
    const isLoadingQuizLists = loadingPublicQuizzes || loadingUserQuizzes;


    const currentQuizData = useMemo(() => {
        if (!currentQuizId) return null;

        return guestQuizzes.find(q => q.id === currentQuizId) ||
               userQuizzes.find(q => q.id === currentQuizId) ||
               publicQuizzes.find(q => q.id === currentQuizId);
    }, [currentQuizId, guestQuizzes, userQuizzes, publicQuizzes]);


    const currentQuizAnswers = useMemo(() => currentQuizData ? allUserAnswers[currentQuizData.id] : undefined, [currentQuizData, allUserAnswers]);


    const fetchRecommendations = useCallback(async () => {
        if (!currentQuizData || !currentQuizAnswers) return;

        setLoadingRecommendations(true);
        setRecommendationsError(null);

        try {

            const incorrectQuestions = currentQuizData.questions.flatMap((question, originalIndex) => {
                const userAnswerIndex = currentQuizAnswers[originalIndex];
                const correctAnswerIndex = question.answers.findIndex(a => a.is_correct);
                if (userAnswerIndex === correctAnswerIndex) {
                    return [];
                }

                const userAnswer = userAnswerIndex >= 0
                    ? question.answers[userAnswerIndex]?.answer_text
                    : "No answer selected";

                return [{
                    id: question.id,
                    question_text: question.question_text,
                    topic: currentQuizData.topic,
                    correct_answer: question.answers[correctAnswerIndex]?.answer_text || "",
                    user_answer: userAnswer || "No answer selected"
                }];
            });

            if (incorrectQuestions.length === 0) {
                console.log("No incorrect questions, skipping recommendations");
                setRecommendations({});
                return;
            }

            console.log(`Fetching recommendations for ${incorrectQuestions.length} incorrect questions`);

            const response = await axios.post(`${API_BASE_URL}/api/recommendations`, {
                incorrect_questions: incorrectQuestions
            });

            setRecommendations(response.data);
            console.log("Received recommendations:", Object.keys(response.data).length);

        } catch (err) {
            const error = handleApiError(err, "Failed to load video recommendations");
            console.error("Recommendations error:", error);
            setRecommendationsError(error.message);
        } finally {
            setLoadingRecommendations(false);
        }
    }, [currentQuizData, currentQuizAnswers]);


    useEffect(() => {
        if (quizFinished) {
            fetchRecommendations();
        }
    }, [quizFinished, fetchRecommendations]);

    useEffect(() => {

    if (!currentQuizId) {

        if (userQuizzes.length > 0) {
            handleSelectQuiz(userQuizzes[0].id);
        } else if (publicQuizzes.length > 0) {
            handleSelectQuiz(publicQuizzes[0].id);
        } else if (guestQuizzes.length > 0) {
            handleSelectQuiz(guestQuizzes[0].id);
        }
    } else {

        const exists =
            guestQuizzes.some(q => q.id === currentQuizId) ||
            userQuizzes.some(q => q.id === currentQuizId) ||
            publicQuizzes.some(q => q.id === currentQuizId);

        if (!exists) {

            handleSelectQuiz(null);
        }
    }

}, [userQuizzes, publicQuizzes, guestQuizzes, currentQuizId, handleSelectQuiz]);


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


    return (
        <BrowserRouter>
            <>

                <QuizManager
                    guestQuizList={guestQuizzes}
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
                    authLoading={isLoadingInitialData}
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


                <div className="main-content-area" style={{ paddingTop: '4rem', paddingLeft: '2rem', paddingRight: '2rem', paddingBottom: '8rem' }}>


                    {(isLoadingInitialData || isLoadingQuizLists) && (
                         <div className='text-center mt-5 d-flex justify-content-center align-items-center'>
                             <BootstrapSpinner animation="border" size="sm" role="status" aria-hidden="true" />
                             <span className="ms-2">
                                 {isLoadingInitialData ? "Initializing..." : "Loading Quizzes..."}
                             </span>
                         </div>
                    )}


                    {!isLoadingInitialData && fetchError && (
                        <BootstrapAlert variant="warning" className="mt-3" onClose={() => setFetchError(null)} dismissible>
                            {fetchError}
                        </BootstrapAlert>
                    )}


                    {!isLoadingInitialData && (
                        <Routes>

                             <Route path="/edit/:quizId" element={ currentUser ? <QuizEditor onQuizUpdated={handleQuizUpdated} /> : <Navigate to="/" replace state={{ message: "Login required to edit quizzes." }} /> }/>

                             <Route path="/create" element={ <QuizCreator onQuizCreated={handleQuizCreated} /> }/>

                             <Route path="/" element={


                                 currentQuizData && currentQuizAnswers ? (
                                     <>
                                          <Quiz
                                              key={`${currentQuizData.id}-${shuffleQuestions}-${shuffleAnswers}`}
                                              quizId={currentQuizData.id}
                                              quizTitle={currentQuizData.title}
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
                                              recommendations={currentlyDisplayedQuestion ? recommendations[currentlyDisplayedQuestion.id] : undefined}
                                              loadingRecommendations={loadingRecommendations}
                                              recommendationsError={recommendationsError}
                                          />
                                     </>
                                 ) :
                                 isLoadingQuizLists ? (
                                     <div className='text-center mt-5 d-flex justify-content-center align-items-center'>
                                         <BootstrapSpinner animation="border" size="sm" /> <span className="ms-2">Loading Quizzes...</span>
                                     </div>
                                 ) : (
                                      <p className='text-center text-muted mt-5'>
                                          {(publicQuizzes.length === 0 && userQuizzes.length === 0 && guestQuizzes.length === 0)
                                              ? "No quizzes available. Use 'Create New Quiz'!"
                                              : "Select a quiz from the menu to start."}
                                      </p>
                                 )
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
