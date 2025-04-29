// frontend/src/components/Quiz.tsx
import { useState, useEffect, useMemo, useCallback } from "react";
import { Button } from "react-bootstrap";
// Make sure AnswerOption is imported if used within this file scope
import { Question, AnswerOption } from "../interfaces/interfaces";

// --- Shuffle Function ---
function shuffleArray<T>(array: T[]): T[] {
  if (!array) return [];
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// Add originalIndex to track mapping after shuffle
interface DisplayQuestion extends Question { originalIndex: number; }
// Add originalIndex here too
interface DisplayAnswer extends AnswerOption { originalIndex: number; }

interface Props {
  quizId: string;
  questions: Question[]; // Original, unshuffled questions
  userAnswers: number[];
  onAnswerUpdate: (quizId: string, originalQuestionIndex: number, originalAnswerIndex: number) => void; // Use original indices
  shuffleQuestions: boolean;
  shuffleAnswers: boolean;
  onResetQuiz: (quizId: string) => void; // Callback to reset answers AND state in App

  // --- State and Setters Lifted from App ---
  isReviewMode: boolean;
  currentDisplayIndex: number; // Index in the potentially shuffled displayQuestions array
  score: number;
  setQuizFinished: (finished: boolean) => void;
  setCurrentDisplayIndex: (index: number) => void;
  setScore: (score: number) => void;
  // --- Callback to inform App about the currently displayed question ---
  onDisplayedQuestionChange: (question: DisplayQuestion | null) => void;
}

function Quiz({
    quizId,
    questions,
    userAnswers,
    onAnswerUpdate,
    shuffleQuestions,
    shuffleAnswers,
    onResetQuiz,
    // Destructure lifted state and setters
    isReviewMode,
    currentDisplayIndex,
    score,
    setQuizFinished,
    setCurrentDisplayIndex,
    setScore,
    onDisplayedQuestionChange // New callback prop
}: Props) {

  // Local state ONLY for shuffled display arrays & visual selection within display
  const [displayQuestions, setDisplayQuestions] = useState<DisplayQuestion[]>([]);
  const [displayAnswers, setDisplayAnswers] = useState<DisplayAnswer[]>([]);
  const [selectedDisplayAnswerIndex, setSelectedDisplayAnswerIndex] = useState<number>(-1);

  // --- Setup/Reset Display Questions Function ---
  const setupDisplayQuestions = useCallback(() => {
    const baseQuestions = questions.map((q, index) => ({ ...q, originalIndex: index }));
    setDisplayQuestions(shuffleQuestions ? shuffleArray(baseQuestions) : baseQuestions);
  }, [questions, shuffleQuestions]);

  // Effect 1: Setup display questions when base questions/shuffle prop change
  useEffect(() => {
    console.log("Quiz Effect 1: Setting up display questions.");
    setupDisplayQuestions();
  }, [setupDisplayQuestions]);

  // --- Current Displayed Question Calculation (Memoized) ---
  // Calculate this based on the displayQuestions state and the index prop from App
  const currentDisplayQuestion = useMemo<DisplayQuestion | null>(() => {
    return (displayQuestions.length > 0 && currentDisplayIndex >= 0 && currentDisplayIndex < displayQuestions.length)
        ? displayQuestions[currentDisplayIndex]
        : null;
  }, [displayQuestions, currentDisplayIndex]);

  // Effect 2: Set/Shuffle Display Answers & Report Current Question *after* currentDisplayQuestion is calculated
  useEffect(() => {
    let answersToDisplay: DisplayAnswer[] = [];
    if (currentDisplayQuestion) {
        const baseAnswers = currentDisplayQuestion.answers.map((a, index) => ({ ...a, originalIndex: index }));
        answersToDisplay = shuffleAnswers ? shuffleArray(baseAnswers) : baseAnswers;
    }
    setDisplayAnswers(answersToDisplay);
    // Report the calculated current question (or null) back to App
    console.log(`Quiz Effect 2: Reporting displayed question index ${currentDisplayIndex}`, currentDisplayQuestion?.question_text);
    onDisplayedQuestionChange(currentDisplayQuestion);

  // Depend on the calculated question object and shuffle flag
  }, [currentDisplayQuestion, shuffleAnswers, onDisplayedQuestionChange, currentDisplayIndex]); // Added currentDisplayIndex back just in case

  // Effect 3: Sync Visual Selection with Persisted State (userAnswers)
  useEffect(() => {
    let newSelectedDisplayIndex = -1;
    // Check if we have a valid displayed question and answers rendered
    if (currentDisplayQuestion && displayAnswers.length > 0) {
        const originalQuestionIndex = currentDisplayQuestion.originalIndex;
        const persistedAnswerOriginalIndex = userAnswers[originalQuestionIndex]; // Get the saved answer's ORIGINAL index

        if (persistedAnswerOriginalIndex !== -1 && persistedAnswerOriginalIndex !== undefined) {
            // Find where the saved answer *currently appears* in the (potentially shuffled) displayAnswers
            newSelectedDisplayIndex = displayAnswers.findIndex(a => a.originalIndex === persistedAnswerOriginalIndex);
        }
    }
     // Only update state if the calculated index is different from the current one
    if (newSelectedDisplayIndex !== selectedDisplayAnswerIndex) {
        console.log(`Quiz Effect 3: Syncing visual selection to display index: ${newSelectedDisplayIndex}`);
        setSelectedDisplayAnswerIndex(newSelectedDisplayIndex);
    }
  // Depend on the key pieces of data needed for the calculation
  }, [currentDisplayQuestion, displayAnswers, userAnswers, selectedDisplayAnswerIndex]);


  // --- Event Handlers ---
  const handleAnswerSelect = (selectedDisplayIndex: number) => {
    if (isReviewMode || !currentDisplayQuestion) return; // Use prop isReviewMode
    setSelectedDisplayAnswerIndex(selectedDisplayIndex); // Update local visual state
    const selectedDisplayedAnswer = displayAnswers[selectedDisplayIndex];
    // Pass ORIGINAL indices back up to App
    onAnswerUpdate(quizId, currentDisplayQuestion.originalIndex, selectedDisplayedAnswer.originalIndex);
  };

  // Use setCurrentDisplayIndex prop from App to navigate
  const handleNext = () => { if (currentDisplayIndex < displayQuestions.length - 1) setCurrentDisplayIndex(currentDisplayIndex + 1); };
  const handlePrevious = () => { if (currentDisplayIndex > 0) setCurrentDisplayIndex(currentDisplayIndex - 1); };

  const handleFinish = () => {
    let calculatedScore = 0;
    questions.forEach((question, originalIndex) => { // Score based on original order
      const correctAnswerOriginalIndex = question.answers.findIndex(a => a.is_correct);
      const userAnswerOriginalIndex = userAnswers[originalIndex];
      if (correctAnswerOriginalIndex !== -1 && userAnswerOriginalIndex !== -1 && userAnswerOriginalIndex === correctAnswerOriginalIndex) {
        calculatedScore++;
      }
    });
    setScore(calculatedScore); // Update score in App state
    setQuizFinished(true);    // Update finished state in App state
    setCurrentDisplayIndex(0); // Reset index in App state
  };

  const handleEndReviewClick = () => {
    onResetQuiz(quizId); // Call App's handler (resets answers & quiz state in App)
    // Internal shuffle logic depends on setupDisplayQuestions being called again due to prop changes or key change
  };

  // --- Review Styling Helper ---
  const getReviewClass = (displayedAnswer: DisplayAnswer): string => {
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


  // --- Render Logic ---
  if (!currentDisplayQuestion) {
      return <div className="text-center p-3">Loading question or quiz empty...</div>;
  }

  return (
    <div className="position-absolute top-50 start-50 translate-middle" style={{ width: '80%', maxWidth: '600px' }}>
        {isReviewMode && ( /* Review Header */
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
                    className={`list-group-item ${ isReviewMode ? getReviewClass(answer) : selectedDisplayAnswerIndex === displayIndex ? "active" : "" }`}
                    key={answer.id || `${currentDisplayQuestion.originalIndex}-${answer.originalIndex}`} // Stable key
                    onClick={() => handleAnswerSelect(displayIndex)}
                    style={{ cursor: isReviewMode ? 'default' : 'pointer' }}
                >
                {answer.answer_text}
                {isReviewMode && getReviewClass(answer) === 'list-group-item-success' && ' ✔️'}
                {isReviewMode && getReviewClass(answer) === 'list-group-item-danger' && ' ❌'}
                </li>
            ))}
            </ul>
        </div>
        <div className="d-flex justify-content-between mt-3"> {/* Navigation */}
            <Button variant="secondary" onClick={handlePrevious} disabled={currentDisplayIndex === 0}> Previous </Button>
            {!isReviewMode ? ( currentDisplayIndex === displayQuestions.length - 1 ? (
                <Button variant="success" onClick={handleFinish}> Finish Quiz </Button>
            ) : ( <Button variant="primary" onClick={handleNext}> Next </Button> )
            ) : ( currentDisplayIndex < displayQuestions.length - 1 ? (
                <Button variant="primary" onClick={handleNext}> Next (Review) </Button>
            ) : ( <Button variant="info" onClick={handleEndReviewClick}> End Review </Button> )
            )}
        </div>
        <div style={{ textAlign: "right", marginTop: "10px" }}> {/* Counter */}
            <p> Question {currentDisplayIndex + 1} of {displayQuestions.length} </p>
        </div>
    </div>
  );
}
export default Quiz;