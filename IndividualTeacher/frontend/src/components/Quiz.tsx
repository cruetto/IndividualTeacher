import { useState, useEffect } from "react"; // Import React if using Fragments or JSX specific features
import { Button } from "react-bootstrap";
import { Question } from "../interfaces/interfaces"; // Adjust path if needed

interface Props {
  quizId: string;
  questions: Question[];
  userAnswers: number[]; // Received from App state
  onAnswerUpdate: (quizId: string, questionIndex: number, answerIndex: number) => void;
  // Optional: Add callback if you want an explicit "Exit Review" action
  // onExitReview?: (quizId: number) => void;
}

function Quiz({ quizId, questions, userAnswers, onAnswerUpdate /*, onExitReview */ }: Props) {
  // State for the index of the question being viewed
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState<number>(0);
  // State for the visually selected answer on the *current* screen (for active quiz taking)
  const [selectedAnswerIndex, setSelectedAnswerIndex] = useState<number>(-1);
  // State to track if the quiz is finished (triggers review mode)
  const [quizFinished, setQuizFinished] = useState<boolean>(false); // <-- CONTROLS REVIEW MODE
  // State to store the calculated score
  const [score, setScore] = useState<number>(0);

  // Effect to update VISUAL selection based on persisted answers for the CURRENT question
  useEffect(() => {
    // Find the persisted answer for the current question index from the prop
    const persistedAnswer = userAnswers[currentQuestionIndex];
    // Update the local state that controls the visual highlight (e.g., the 'active' class)
    setSelectedAnswerIndex(persistedAnswer !== undefined ? persistedAnswer : -1);

    // --- REMOVE THE RESET LOGIC FROM HERE ---
    // setQuizFinished(false); // REMOVE THIS LINE
    // setScore(0); // REMOVE THIS LINE
    // The component's state (quizFinished, score) will reset naturally when the
    // component instance is replaced due to the key prop changing in App.tsx

  }, [currentQuestionIndex, userAnswers]); // Dependencies: Only need these now
  // Removed quizId from dependencies as the key prop handles the full reset on quiz change.

  // Handles selecting an answer *during* the active quiz phase
  const handleAnswerSelect = (selectedIndex: number) => {
    // Prevent changing answers after finishing (i.e., during review)
    if (quizFinished) return; // <-- DISABLES SELECTION IN REVIEW

    setSelectedAnswerIndex(selectedIndex);
    onAnswerUpdate(quizId, currentQuestionIndex, selectedIndex);
  };

  // Navigate to the next question
  const handleNext = () => {
    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1);
    }
  };

  // Navigate to the previous question
  const handlePrevious = () => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex(currentQuestionIndex - 1);
    }
  };

  // Calculate score and enter review mode
  const handleFinish = () => { // <-- TRIGGERS REVIEW MODE
    let calculatedScore = 0;
    questions.forEach((question, index) => {
      const correctAnswerIndex = question.answers.findIndex(answer => answer.is_correct);
      const userAnswerIndex = userAnswers[index];

      if (correctAnswerIndex !== -1 && userAnswerIndex !== -1 && userAnswerIndex === correctAnswerIndex) {
        calculatedScore++;
      }
    });

    setScore(calculatedScore); // Store the calculated score
    setQuizFinished(true);    // Set the state to true to start review
    setCurrentQuestionIndex(0); // Reset to the first question for review
  };

  // --- Render Logic ---

  if (!questions || questions.length === 0) { /* ... error handling ... */ }
  if (currentQuestionIndex < 0 || currentQuestionIndex >= questions.length) { /* ... error handling ... */ }

  const currentQuestion = questions[currentQuestionIndex];

  // *** HELPER FUNCTION FOR REVIEW STYLING ***
  const getReviewClass = (answerIndex: number): string => {
    const correctAnswerIndex = currentQuestion.answers.findIndex(a => a.is_correct);
    const userSelectedIndex = userAnswers[currentQuestionIndex];

    if (userSelectedIndex === answerIndex) { // This is the answer the user picked
      return userSelectedIndex === correctAnswerIndex ? "list-group-item-success" : "list-group-item-danger"; // Green if correct, Red if incorrect
    } else if (answerIndex === correctAnswerIndex) { // This is the correct answer (and user didn't pick it)
        if (userSelectedIndex !== -1 && userSelectedIndex !== correctAnswerIndex) {
           return "list-group-item-info"; // Optionally highlight correct answer if user was wrong (Blue/Info)
        } else if (userSelectedIndex === -1) {
           return "list-group-item-secondary"; // Optionally highlight correct if user skipped (Gray)
        }
    }
    return ""; // Default background
  };

  return (
    <div className="position-absolute top-50 start-50 translate-middle" style={{ width: '80%', maxWidth: '600px' }}>

      {/* Display the Question */}
      <h4>{currentQuestion.question_text}</h4>

      {/* Display the Answer Options */}
      <div style={{ maxHeight: "300px", overflowY: "auto", marginBottom: '20px' }}>
        <ul className="list-group">
          {currentQuestion.answers.map((answer, index) => (
            <li
              // *** APPLYING REVIEW STYLES ***
              className={`list-group-item ${
                quizFinished
                  ? getReviewClass(index) // Use review styling if finished
                  : selectedAnswerIndex === index ? "active" : "" // Use active selection styling if taking quiz
              }`}
              key={`${quizId}-${currentQuestionIndex}-${index}`}
              onClick={() => handleAnswerSelect(index)} // Disabled in review mode by handler logic
              style={{ cursor: quizFinished ? 'default' : 'pointer' }} // Change cursor in review mode
            >
              {answer.answer_text}
              {/* Optional: Add checkmark/cross icons */}
              {quizFinished && getReviewClass(index) === 'list-group-item-success' && ' ✔️'}
              {quizFinished && getReviewClass(index) === 'list-group-item-danger' && ' ❌'}
            </li>
          ))}
        </ul>
      </div>


      {/* Navigation Buttons */}
      <div className="d-flex justify-content-between mt-3">
        <Button
          variant="secondary"
          onClick={handlePrevious}
          disabled={currentQuestionIndex === 0}
        >
          Previous
        </Button>

        {/* *** CONDITIONAL BUTTONS FOR QUIZ VS REVIEW *** */}
        {!quizFinished ? ( // If NOT in review mode
          currentQuestionIndex === questions.length - 1 ? (
            <Button variant="success" onClick={handleFinish}> Finish Quiz </Button>
          ) : (
            <Button variant="primary" onClick={handleNext}> Next </Button>
          )
        ) : ( // If IN review mode
          currentQuestionIndex < questions.length - 1 ? (
            <Button variant="primary" onClick={handleNext}> Next (Review) </Button> // Allow Next in review
          ) : (
            // Optional Exit button on last question in review
            <Button
              variant="info"
              onClick={() => alert("Exiting review - Implement navigation in App.tsx")}
              title="Return to Quiz List (Feature Placeholder)"
            >
              End Review
            </Button>
          )
        )}
      </div>

      {/* Question Counter */}
      <div style={{ textAlign: "right", marginTop: "10px" }}>
        <p> Question {currentQuestionIndex + 1} of {questions.length} </p>
      </div>


      {/* *** REVIEW MODE HEADER (Score) *** */}
      {quizFinished && (
        <div className="text-center mb-3 alert alert-primary">
          <h4>Reviewing Answers</h4>
          <p className="lead mb-0">Final Score: {score} out of {questions.length}</p>
        </div>
      )}
    </div>
  );
}

export default Quiz;