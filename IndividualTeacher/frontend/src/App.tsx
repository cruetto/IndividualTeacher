// frontend/src/App.tsx
import { useState, useEffect, useCallback } from 'react'; // Import useCallback
import axios from 'axios';

import ChatApp from './components/Chat';
import Quiz from './components/Quiz';
import QuizManager from './components/QuizManager';
import { QuizData, Question } from './interfaces/interfaces.ts';

const API_BASE_URL = 'http://localhost:5001';

// Define a type for storing answers across multiple quizzes
// Key: Quiz ID (number), Value: Array of selected answer indices (number[])
type AllUserAnswers = Record<number, number[]>;

function App() {
  const [quizzes, setQuizzes] = useState<QuizData[]>([]);
  const [currentQuiz, setCurrentQuiz] = useState<QuizData | undefined>(undefined);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // State to store answers for ALL quizzes
  const [allUserAnswers, setAllUserAnswers] = useState<AllUserAnswers>({});

  // --- Data Fetching ---
  const fetchQuizzes = async () => {
    setLoading(true);
    setError(null);
    setAllUserAnswers({}); // Reset answers when fetching all quizzes
    try {
      console.log(`Fetching quizzes from: ${API_BASE_URL}/api/quizzes`);
      const response = await axios.get<QuizData[]>(`${API_BASE_URL}/api/quizzes`);
      console.log('API Response:', response.data);
      const fetchedQuizzes = response.data || [];
      setQuizzes(fetchedQuizzes);

      if (fetchedQuizzes.length > 0) {
        const firstQuiz = fetchedQuizzes[0];
        setCurrentQuiz(firstQuiz);
        // Initialize answers for the first quiz if not already present (though reset above)
        initializeAnswersForQuiz(firstQuiz.id, firstQuiz.questions);
      } else {
        setCurrentQuiz(undefined);
        console.warn("No quizzes found.");
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
    } finally {
      setLoading(false);
    }
  };

  // Helper function to initialize answer array for a specific quiz
  const initializeAnswersForQuiz = useCallback((quizId: number, questions: Question[]) => {
    setAllUserAnswers(prevAnswers => {
      if (!prevAnswers[quizId]) {
        console.log(`Initializing answers for quiz ${quizId}`);
        return {
          ...prevAnswers,
          [quizId]: Array(questions.length).fill(-1), // -1 means unanswered
        };
      }
      return prevAnswers; // Already initialized
    });
  }, []); // No dependencies, it's a pure function based on arguments

  useEffect(() => {
    fetchQuizzes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Fetch on mount

  // --- Event Handlers ---
  const handleSelectQuiz = (id: number) => {
    const selected = quizzes.find(quiz => quiz.id === id);
    if (selected) {
      setCurrentQuiz(selected);
      // Ensure answers are initialized for the newly selected quiz
      initializeAnswersForQuiz(selected.id, selected.questions);
      console.log("Selected Quiz ID:", id);
    }
  };

  // Callback for the Quiz component to update the central answer state
  // Use useCallback to prevent unnecessary re-renders of Quiz component
  const handleAnswerUpdate = useCallback((quizId: number, questionIndex: number, answerIndex: number) => {
    setAllUserAnswers(prevAnswers => {
      // Ensure the quiz entry exists (should be guaranteed by initializeAnswersForQuiz)
      const currentQuizAnswers = prevAnswers[quizId] ? [...prevAnswers[quizId]] : Array(quizzes.find(q => q.id === quizId)?.questions.length ?? 0).fill(-1);

      // Create a new array with the updated answer
      currentQuizAnswers[questionIndex] = answerIndex;

      // Return the updated state object
      return {
        ...prevAnswers,
        [quizId]: currentQuizAnswers,
      };
    });
     console.log(`Updated answer for Quiz ${quizId}, Question ${questionIndex + 1}: Index ${answerIndex}`);
  }, [quizzes]); // Dependency: quizzes might be needed if lengths change dynamically, though less likely here. Added for safety.


  // --- Render Logic ---
  // Get the answers for the *currently selected* quiz
  const currentQuizAnswers = currentQuiz ? allUserAnswers[currentQuiz.id] : undefined;

  return (
    <>
      {loading && <p style={{ textAlign: 'center', marginTop: '20px' }}>Loading quizzes...</p>}
      {error && <p style={{ textAlign: 'center', color: 'red', marginTop: '20px' }}>Error: {error}</p>}

      {!loading && !error && currentQuiz !== undefined && currentQuizAnswers !== undefined && (
        <>
          <h1 style={{ textAlign: 'center' }}>
            {currentQuiz.title}
          </h1>
          <QuizManager
            quizTitleList={quizzes.map(quiz => quiz.title)}
            idList={quizzes.map(quiz => quiz.id)}
            onSelectTitleItem={handleSelectQuiz}
          />

          <Quiz
            // Use a composite key including answers version if needed, but quiz ID is usually enough
            // if combined with lifting state. The key forces a reset of Quiz's *internal*
            // non-persistent state (like current view index) which is good.
            key={currentQuiz.id}
            quizId={currentQuiz.id} // Pass quizId
            questions={currentQuiz.questions}
            // Pass the specific answers array for *this* quiz
            userAnswers={currentQuizAnswers}
            // Pass the callback function to update answers in App's state
            onAnswerUpdate={handleAnswerUpdate}
          />

          <ChatApp />
        </>
      )}

      {!loading && !error && currentQuiz === undefined && quizzes.length === 0 && (
        <p style={{ textAlign: 'center', marginTop: '20px' }}>No quizzes available.</p>
      )}
    </>
  );
}

export default App;