// frontend/src/components/Quiz.tsx
import { useState, useEffect, useMemo, useCallback } from "react"; // Added useCallback
import { Button } from "react-bootstrap";
import { Question, AnswerOption } from "../interfaces/interfaces";

// --- Fisher-Yates Shuffle Function (remains the same) ---
function shuffleArray<T>(array: T[]): T[] {
  if (!array) return [];
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

interface DisplayQuestion extends Question {
    originalIndex: number;
}

interface DisplayAnswer extends AnswerOption {
    originalIndex: number;
}

interface Props {
  quizId: string;
  questions: Question[]; // Original, unshuffled questions
  userAnswers: number[];
  onAnswerUpdate: (quizId: string, questionIndex: number, answerIndex: number) => void;
  shuffleQuestions: boolean;
  shuffleAnswers: boolean;
  onResetQuiz: (quizId: string) => void; // Callback to reset answers in App state
}

function Quiz({
    quizId,
    questions,
    userAnswers,
    onAnswerUpdate,
    shuffleQuestions,
    shuffleAnswers,
    onResetQuiz
}: Props) {

  const [displayQuestions, setDisplayQuestions] = useState<DisplayQuestion[]>([]);
  const [displayAnswers, setDisplayAnswers] = useState<DisplayAnswer[]>([]);
  const [currentDisplayIndex, setCurrentDisplayIndex] = useState<number>(0);
  const [selectedDisplayAnswerIndex, setSelectedDisplayAnswerIndex] = useState<number>(-1);
  const [quizFinished, setQuizFinished] = useState<boolean>(false);
  const [score, setScore] = useState<number>(0);

  // --- NEW: Dedicated function to handle question shuffling and state reset ---
  const shuffleAndResetQuestions = useCallback(() => {
    console.log("Executing shuffleAndResetQuestions. Shuffle enabled:", shuffleQuestions);
    const baseQuestions = questions.map((q, index) => ({ ...q, originalIndex: index }));
    const questionsToDisplay = shuffleQuestions ? shuffleArray(baseQuestions) : baseQuestions;
    setDisplayQuestions(questionsToDisplay);
    setCurrentDisplayIndex(0); // Always start from the first question after reset/shuffle
    setQuizFinished(false);    // Ensure quiz is in active mode
    setScore(0);             // Reset score
    // Note: Resetting selectedDisplayAnswerIndex will be handled by Effect 3 based on cleared userAnswers
  }, [questions, shuffleQuestions]); // Dependencies for this function

  // --- Effect 1: Initial setup and reshuffle ONLY when props change ---
  useEffect(() => {
    console.log("Effect 1: questions or shuffleQuestions prop changed.");
    shuffleAndResetQuestions(); // Call the dedicated function
  }, [shuffleAndResetQuestions]); // Depend only on the stable callback function


  // --- Effect 2: Set/Shuffle Display Answers *Only* When Question Changes or Answer Shuffle Changes ---
  useEffect(() => {
    if (displayQuestions.length > 0 && currentDisplayIndex < displayQuestions.length) {
        const currentQ = displayQuestions[currentDisplayIndex];
        console.log(`Effect 2: Setting/Shuffling answers for display index ${currentDisplayIndex} (Original: ${currentQ.originalIndex}). Shuffle enabled: ${shuffleAnswers}`);
        const baseAnswers = currentQ.answers.map((a, index) => ({ ...a, originalIndex: index }));
        const answersToDisplay = shuffleAnswers ? shuffleArray(baseAnswers) : baseAnswers;
        setDisplayAnswers(answersToDisplay);
    } else {
        setDisplayAnswers([]);
    }
  }, [currentDisplayIndex, displayQuestions, shuffleAnswers]); // Re-runs only when these change


  // --- Effect 3: Sync Visual Selection with Persisted State (userAnswers) ---
  useEffect(() => {
    if (displayQuestions.length > 0 && currentDisplayIndex < displayQuestions.length && displayAnswers.length > 0) {
        const currentQ = displayQuestions[currentDisplayIndex];
        const originalQuestionIndex = currentQ.originalIndex;
        const persistedAnswerOriginalIndex = userAnswers[originalQuestionIndex];

        let newSelectedDisplayIndex = -1;
        if (persistedAnswerOriginalIndex !== -1 && persistedAnswerOriginalIndex !== undefined) {
            newSelectedDisplayIndex = displayAnswers.findIndex(a => a.originalIndex === persistedAnswerOriginalIndex);
        }
        // Only log if the index actually changes to avoid noise
        if (newSelectedDisplayIndex !== selectedDisplayAnswerIndex) {
             console.log(`Effect 3: Syncing selection for display index ${currentDisplayIndex}. Persisted original answer index: ${persistedAnswerOriginalIndex}. New display index: ${newSelectedDisplayIndex}`);
             setSelectedDisplayAnswerIndex(newSelectedDisplayIndex);
        }
    } else if (selectedDisplayAnswerIndex !== -1) {
        // Ensure selection is cleared if no questions/answers
         setSelectedDisplayAnswerIndex(-1);
    }
  // Ensure all relevant dependencies are included
  }, [currentDisplayIndex, displayQuestions, displayAnswers, userAnswers, selectedDisplayAnswerIndex]);


  // --- Current Displayed Question (Memoized - no change) ---
  const currentDisplayQuestion = useMemo(() => { /* ... */
    return (displayQuestions.length > 0 && currentDisplayIndex < displayQuestions.length)
        ? displayQuestions[currentDisplayIndex]
        : null;
  }, [displayQuestions, currentDisplayIndex]);


  // --- Event Handlers (handleAnswerSelect, handleNext, handlePrevious, handleFinish - no changes) ---
  const handleAnswerSelect = (selectedDisplayIndex: number) => { /* ... */
    if (quizFinished || !currentDisplayQuestion) return;
    setSelectedDisplayAnswerIndex(selectedDisplayIndex);
    const selectedDisplayedAnswer = displayAnswers[selectedDisplayIndex];
    const originalQuestionIndex = currentDisplayQuestion.originalIndex;
    const originalAnswerIndex = selectedDisplayedAnswer.originalIndex;
    onAnswerUpdate(quizId, originalQuestionIndex, originalAnswerIndex);
  };
  const handleNext = () => { if (currentDisplayIndex < displayQuestions.length - 1) setCurrentDisplayIndex(prev => prev + 1); };
  const handlePrevious = () => { if (currentDisplayIndex > 0) setCurrentDisplayIndex(prev => prev - 1); };
  const handleFinish = () => { /* ... (scoring logic based on original indices) ... */
    let calculatedScore = 0;
    questions.forEach((question, originalIndex) => {
      const correctAnswerOriginalIndex = question.answers.findIndex(answer => answer.is_correct);
      const userAnswerOriginalIndex = userAnswers[originalIndex];
      if (correctAnswerOriginalIndex !== -1 && userAnswerOriginalIndex !== -1 && userAnswerOriginalIndex === correctAnswerOriginalIndex) {
        calculatedScore++;
      }
    });
    setScore(calculatedScore);
    setQuizFinished(true);
    setCurrentDisplayIndex(0);
  };

  // --- Modified: Handle End Review ---
  const handleEndReviewClick = () => {
    console.log("End Review clicked - Resetting parent state and reshuffling questions locally.");
    // 1. Reset persisted answers in App state
    onResetQuiz(quizId);
    // 2. Reshuffle questions (if enabled) and reset local state (finished, score, index)
    shuffleAndResetQuestions();
    // Effect 3 will automatically run afterwards due to userAnswers changing (from onResetQuiz)
    // and reset the selectedDisplayAnswerIndex based on the now-empty answers.
  };


  // --- Helper for Review Styling (no changes) ---
  const getReviewClass = (displayedAnswer: DisplayAnswer): string => { /* ... */
     if (!currentDisplayQuestion) return "";
     const originalQuestionIndex = currentDisplayQuestion.originalIndex;
     const correctAnswerOriginalIndex = questions[originalQuestionIndex]?.answers.findIndex(a => a.is_correct);
     const userAnswerOriginalIndex = userAnswers[originalQuestionIndex];
     if (userAnswerOriginalIndex === displayedAnswer.originalIndex) {
         return userAnswerOriginalIndex === correctAnswerOriginalIndex ? "list-group-item-success" : "list-group-item-danger";
     } else if (displayedAnswer.originalIndex === correctAnswerOriginalIndex) {
        return (userAnswerOriginalIndex !== -1) ? "list-group-item-info" : "list-group-item-secondary";
     }
     return "";
  };


  // --- Render Logic (no changes) ---
  if (!currentDisplayQuestion) {
      return <div className="text-center p-3">Loading question...</div>;
  }
  return (
    <div className="position-absolute top-50 start-50 translate-middle" style={{ width: '80%', maxWidth: '600px' }}>
        {quizFinished && ( /* Review Header */
            <div className="text-center mb-3 alert alert-info">
                <h4>Reviewing Answers</h4>
                <p className="lead mb-0">Final Score: {score} out of {questions.length}</p>
            </div>
        )}
        <h4>{currentDisplayQuestion.question_text}</h4> {/* Question Text */}
        <div style={{ maxHeight: "300px", overflowY: "auto", marginBottom: '20px' }}> {/* Answers */}
            <ul className="list-group">
            {displayAnswers.map((answer, displayIndex) => (
                <li
                    className={`list-group-item ${ quizFinished ? getReviewClass(answer) : selectedDisplayAnswerIndex === displayIndex ? "active" : "" }`}
                    key={answer.id || `${currentDisplayQuestion.id}-${answer.originalIndex}`} // Use originalIndex for more stability during answer shuffle
                    onClick={() => handleAnswerSelect(displayIndex)}
                    style={{ cursor: quizFinished ? 'default' : 'pointer' }}
                >
                {answer.answer_text}
                {quizFinished && getReviewClass(answer) === 'list-group-item-success' && ' ✔️'}
                {quizFinished && getReviewClass(answer) === 'list-group-item-danger' && ' ❌'}
                </li>
            ))}
            </ul>
        </div>
        <div className="d-flex justify-content-between mt-3"> {/* Navigation */}
            <Button variant="secondary" onClick={handlePrevious} disabled={currentDisplayIndex === 0}> Previous </Button>
            {!quizFinished ? ( currentDisplayIndex === displayQuestions.length - 1 ? (
                <Button variant="success" onClick={handleFinish}> Finish Quiz </Button>
            ) : ( <Button variant="primary" onClick={handleNext}> Next </Button> )
            ) : ( currentDisplayIndex < displayQuestions.length - 1 ? (
                <Button variant="primary" onClick={handleNext}> Next (Review) </Button>
            ) : ( <Button variant="info" onClick={handleEndReviewClick}> End Review </Button> ) // Still uses handleEndReviewClick
            )}
        </div>
        <div style={{ textAlign: "right", marginTop: "10px" }}> {/* Counter */}
            <p> Question {currentDisplayIndex + 1} of {displayQuestions.length} </p>
        </div>
    </div>
  );
}
export default Quiz;