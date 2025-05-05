// frontend/src/components/Quiz.tsx
import { useState, useEffect, useMemo, useCallback } from "react";
// Import Dropdown from react-bootstrap
import { Button, Dropdown } from "react-bootstrap";
import { Question, AnswerOption } from "../interfaces/interfaces"; // Adjust path if needed

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

// --- Type Definitions ---
// Adds originalIndex to track mapping after shuffle
interface DisplayAnswer extends AnswerOption { originalIndex: number; }
// This is the shape of the question object used *within* Quiz and passed *up* to App
interface DisplayQuestion extends Omit<Question, 'answers'> { // Exclude original 'answers'
  originalIndex: number;
  answers: DisplayAnswer[]; // Use the version with originalIndex
}

interface Props {
  quizId: string;
  questions: Question[]; // Original, unshuffled questions
  userAnswers: number[]; // Stores the ORIGINAL index of the selected answer for each ORIGINAL question index
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
  // Expects the refined DisplayQuestion type
  onDisplayedQuestionChange: (question: DisplayQuestion | null) => void;
}

function Quiz({
    quizId,
    questions, // Original questions from App
    userAnswers, // Persisted answers state from App (using original indices)
    onAnswerUpdate,
    shuffleQuestions,
    shuffleAnswers,
    onResetQuiz,
    // Destructure lifted state and setters
    isReviewMode,
    currentDisplayIndex, // Controlled by App
    score,
    setQuizFinished,
    setCurrentDisplayIndex, // Function to update App's index state
    setScore,
    onDisplayedQuestionChange // Callback prop to notify App
}: Props) {

  // Local state ONLY for the processed (potentially shuffled) question array
  const [displayQuestions, setDisplayQuestions] = useState<DisplayQuestion[]>([]);
  // Local state ONLY for visual selection *within the currently displayed answers*
  const [selectedDisplayAnswerIndex, setSelectedDisplayAnswerIndex] = useState<number>(-1);
  const [resetCounter, setResetCounter] = useState<number>(0);

  // --- Setup/Reset Display Questions Function ---
  // Processes original questions, adds original indices, and shuffles if needed
  const setupDisplayQuestions = useCallback(() => {
    const processedQuestions = questions.map((q, index) => {
        // Add originalIndex to answers *here* when processing questions
        const answersWithOriginalIndex = q.answers.map((a, ansIndex) => ({
            ...a,
            originalIndex: ansIndex
        }));
        return {
            ...q, // Spread original question data (id, text, type)
            originalIndex: index, // Add original index for the question
            answers: answersWithOriginalIndex // Use answers with originalIndex
        };
    });
    // Set the state with the processed (and potentially shuffled) questions
    setDisplayQuestions(shuffleQuestions ? shuffleArray(processedQuestions) : processedQuestions);
  }, [questions, shuffleQuestions]);

  // Effect 1: Setup display questions when base questions/shuffle prop change
  useEffect(() => {
    console.log("Quiz Effect 1: Setting up display questions.");
    setupDisplayQuestions();
    // We don't reset index here; App.tsx controls the currentDisplayIndex based on quiz selection/reset
  }, [setupDisplayQuestions, resetCounter]); // Rerun if setup function changes (means questions or shuffle changed)


  // --- Current Displayed Question Calculation (Memoized) ---
  // Calculate this based on the displayQuestions state and the index prop from App
  const currentDisplayQuestion = useMemo<DisplayQuestion | null>(() => {
    return (displayQuestions.length > 0 && currentDisplayIndex >= 0 && currentDisplayIndex < displayQuestions.length)
        ? displayQuestions[currentDisplayIndex]
        : null;
  }, [displayQuestions, currentDisplayIndex]);

  // --- Current Display Answers (Derived, potentially shuffled) ---
  // Calculate the answers to show based on the current question and shuffle flag
  const currentDisplayAnswers = useMemo<DisplayAnswer[]>(() => {
     if (!currentDisplayQuestion) return [];
     // Shuffle the answers array *from the currentDisplayQuestion* if needed
     return shuffleAnswers
        ? shuffleArray(currentDisplayQuestion.answers)
        : currentDisplayQuestion.answers;
  }, [currentDisplayQuestion, shuffleAnswers]);


  // Effect 2: Report Current Question *after* it's calculated and ready
  useEffect(() => {
    // Report the calculated current question (or null) back to App
    // currentDisplayQuestion is now the correct type (DisplayQuestion)
    console.log(`Quiz Effect 2: Reporting displayed question index ${currentDisplayIndex}`, currentDisplayQuestion?.question_text);
    onDisplayedQuestionChange(currentDisplayQuestion); // Send the full DisplayQuestion object

  // Depend on the calculated question object; runs when question changes
  }, [currentDisplayQuestion, onDisplayedQuestionChange, currentDisplayIndex]);


  // Effect 3: Sync Visual Selection with Persisted State (userAnswers)
  // Updates the local `selectedDisplayAnswerIndex` based on App's `userAnswers` state
  useEffect(() => {
    let newSelectedDisplayIndex = -1;
    // Use derived currentDisplayAnswers
    if (currentDisplayQuestion && currentDisplayAnswers.length > 0) {
        const originalQuestionIndex = currentDisplayQuestion.originalIndex;
        // Get the ORIGINAL index of the answer the user saved for this question's ORIGINAL index
        const persistedAnswerOriginalIndex = userAnswers[originalQuestionIndex];

        if (persistedAnswerOriginalIndex !== -1 && persistedAnswerOriginalIndex !== undefined) {
            // Find where the saved answer *currently appears* in the (potentially shuffled) displayAnswers
            newSelectedDisplayIndex = currentDisplayAnswers.findIndex(a => a.originalIndex === persistedAnswerOriginalIndex);
        }
    }
    // Only update state if the calculated index is different from the current one
    if (newSelectedDisplayIndex !== selectedDisplayAnswerIndex) {
        console.log(`Quiz Effect 3: Syncing visual selection to display index: ${newSelectedDisplayIndex}`);
        setSelectedDisplayAnswerIndex(newSelectedDisplayIndex);
    }
  // Depend on the key pieces of data needed for the calculation
  }, [currentDisplayQuestion, currentDisplayAnswers, userAnswers, selectedDisplayAnswerIndex]);


  // --- Event Handlers ---
  const handleAnswerSelect = (selectedDisplayIndex: number) => {
    if (isReviewMode || !currentDisplayQuestion) return; // Use prop isReviewMode
    setSelectedDisplayAnswerIndex(selectedDisplayIndex); // Update local visual state immediately
    // Get the selected answer from the derived (potentially shuffled) array
    const selectedDisplayedAnswer = currentDisplayAnswers[selectedDisplayIndex];
    // Pass ORIGINAL indices back up to App for state persistence
    onAnswerUpdate(quizId, currentDisplayQuestion.originalIndex, selectedDisplayedAnswer.originalIndex);
  };

  // Use setCurrentDisplayIndex prop from App to navigate
  const handleNext = () => { if (currentDisplayIndex < displayQuestions.length - 1) setCurrentDisplayIndex(currentDisplayIndex + 1); };
  const handlePrevious = () => { if (currentDisplayIndex > 0) setCurrentDisplayIndex(currentDisplayIndex - 1); };

  // --- NEW: Handle Jump To Question ---
  const handleJumpToQuestion = (index: number) => {
    if (index >= 0 && index < displayQuestions.length) {
        setCurrentDisplayIndex(index); // Update state in App.tsx
    }
  };

  const handleFinish = () => {
    let calculatedScore = 0;
    // Score based on the original, unshuffled questions array from props
    questions.forEach((question, originalIndex) => {
      const correctAnswerOriginalIndex = question.answers.findIndex(a => a.is_correct);
      // Get user's answer's original index from the persisted state in App
      const userAnswerOriginalIndex = userAnswers[originalIndex];
      if (correctAnswerOriginalIndex !== -1 && userAnswerOriginalIndex !== -1 && userAnswerOriginalIndex === correctAnswerOriginalIndex) {
        calculatedScore++;
      }
    });
    setScore(calculatedScore); // Update score in App state
    setQuizFinished(true);    // Update finished state in App state
    setCurrentDisplayIndex(0); // Reset index in App state to start review from Q1
  };

  const handleEndReviewClick = () => {
    onResetQuiz(quizId); // Call App's reset function
    setResetCounter(prev => prev + 1); // Increment local counter
};

  // --- Review Styling Helper (Use derived currentDisplayAnswers) ---
  const getReviewClass = (displayedAnswer: DisplayAnswer): string => {
     if (!currentDisplayQuestion) return "";

     const originalQuestionIndex = currentDisplayQuestion.originalIndex;
     // Find the correct answer's original index from the *original* questions prop
     const correctAnswerOriginalIndex = questions[originalQuestionIndex]?.answers.findIndex(a => a.is_correct);
     // Get the user's answer's original index from the persisted state in App
     const userAnswerOriginalIndex = userAnswers[originalQuestionIndex];

     // Compare the currently displayed answer's original index to the user's saved original index
     if (userAnswerOriginalIndex === displayedAnswer.originalIndex) {
         // User selected this answer. Check if it was the correct one.
         return userAnswerOriginalIndex === correctAnswerOriginalIndex ? "list-group-item-success" : "list-group-item-danger";
     }
      // Check if the currently displayed answer *is* the correct answer (and the user picked something else or skipped)
      else if (displayedAnswer.originalIndex === correctAnswerOriginalIndex) {
        // If the user answered *something else*, mark the correct one as 'info'
        // If the user skipped, mark the correct one as 'secondary'
        return (userAnswerOriginalIndex !== -1 && userAnswerOriginalIndex !== undefined) ? "list-group-item-info" : "list-group-item-secondary";
     }
     // Otherwise, it's just a regular incorrect option the user didn't pick
     return "";
  };


  // --- Render Logic ---
  if (!currentDisplayQuestion) {
      // Handle loading or empty state
      return <div className="text-center p-3">Loading question or quiz empty...</div>;
  }

  const totalQuestions = displayQuestions.length; // Total number of questions being displayed

  return (
    // Centering the quiz card
    <div className="position-absolute top-50 start-50 translate-middle" style={{ width: '80%', maxWidth: '600px' }}>
        {isReviewMode && ( /* Review Header */
            <div className="text-center mb-3 alert alert-info">
                <h4>Reviewing Answers</h4>
                <p className="lead mb-0">Final Score: {score} out of {questions.length}</p> {/* Score based on original number */}
            </div>
        )}

        {/* Question Text */}
        <h4>{currentDisplayQuestion.question_text}</h4>

        {/* Scrollable Answers Section */}
        <div style={{ maxHeight: "300px", overflowY: "auto", marginBottom: '20px' }}>
            <ul className="list-group">
            {/* Use derived currentDisplayAnswers */}
            {currentDisplayAnswers.map((answer, displayIndex) => (
                <li
                    className={`list-group-item ${ isReviewMode ? getReviewClass(answer) : selectedDisplayAnswerIndex === displayIndex ? "active" : "" }`}
                    // Use a combination of question's original index and answer's original index for a more stable key if answer IDs aren't unique across the entire quiz
                    key={`${currentDisplayQuestion.originalIndex}-${answer.originalIndex}-${answer.id}`}
                    onClick={() => handleAnswerSelect(displayIndex)}
                    style={{ cursor: isReviewMode ? 'default' : 'pointer' }}
                    aria-current={selectedDisplayAnswerIndex === displayIndex ? "true" : undefined}
                >
                {answer.answer_text}
                {/* Add visual indicators for review mode */}
                {isReviewMode && getReviewClass(answer) === 'list-group-item-success' && ' ✔️'}
                {isReviewMode && getReviewClass(answer) === 'list-group-item-danger' && ' ❌'}
                {isReviewMode && getReviewClass(answer) === 'list-group-item-info' && ' (Correct Answer)'}
                </li>
            ))}
            </ul>
        </div>

         {/* --- Navigation Area --- */}
        <div className="d-flex justify-content-between align-items-center mt-3">
            {/* Previous Button */}
            <Button variant="secondary" onClick={handlePrevious} disabled={currentDisplayIndex === 0}> Previous </Button>

            {/* --- Question Jump Dropdown --- */}
            {totalQuestions > 0 && (
                <Dropdown onSelect={(eventKey) => handleJumpToQuestion(parseInt(eventKey ?? '0', 10))}>
                    <Dropdown.Toggle variant="outline-secondary" id="dropdown-question-jump" size="sm">
                        Question: {currentDisplayIndex + 1} / {totalQuestions}
                    </Dropdown.Toggle>
                    {/* Scrollable dropdown menu for many questions */}
                    <Dropdown.Menu style={{ maxHeight: '200px', overflowY: 'auto' }}>
                        {/* Generate dropdown items for each question index */}
                        {Array.from({ length: totalQuestions }, (_, i) => (
                            <Dropdown.Item
                                key={i}
                                eventKey={i.toString()}
                                active={currentDisplayIndex === i}
                            >
                                Question {i + 1}
                            </Dropdown.Item>
                        ))}
                    </Dropdown.Menu>
                </Dropdown>
            )}
             {/* --- End Question Jump Dropdown --- */}


            {/* Next/Finish/EndReview Button */}
            {!isReviewMode ? (
                currentDisplayIndex === totalQuestions - 1 ? (
                    <Button variant="success" onClick={handleFinish}> Finish Quiz </Button>
                ) : (
                    <Button variant="primary" onClick={handleNext}> Next </Button>
                )
            ) : (
                currentDisplayIndex < totalQuestions - 1 ? (
                    <Button variant="primary" onClick={handleNext}> Next (Review) </Button>
                ) : (
                    <Button variant="info" onClick={handleEndReviewClick}> End Review & Reset </Button>
                )
            )}
        </div>
    </div>
  );
}
export default Quiz;