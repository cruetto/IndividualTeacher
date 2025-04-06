import { useState, useEffect } from "react"; // Import useEffect
import { Button } from "react-bootstrap";
import { Question } from "../interfaces/interfaces"; // Assuming Answer is also part of this or defined here

// Assuming Answer interface is defined like this:
// interface Answer {
//   answer_text: string;
//   is_correct: boolean;
// }

interface Props {
  questions: Question[];
  // onSelectItem might not be needed anymore if scoring is internal
  // onSelectItem: (answer: string) => void;
}

function Quiz({ questions }: Props) {
  // State to store the user's selected answer index for EACH question
  const [userAnswers, setUserAnswers] = useState<number[]>(() => Array(questions.length).fill(-1));
  // State for the currently VISIBLE selected answer index
  const [selectedAnswerIndex, setSelectedAnswerIndex] = useState<number>(-1);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState<number>(0);
  // State to track quiz completion and score
  const [quizFinished, setQuizFinished] = useState<boolean>(false);
  const [score, setScore] = useState<number>(0);

  // Effect to update the visible selection when navigating
  useEffect(() => {
    // When currentQuestionIndex changes, update selectedAnswerIndex
    // to show the user's previously stored answer for this question
    setSelectedAnswerIndex(userAnswers[currentQuestionIndex]);
    // No need for questionText state, derive directly
  }, [currentQuestionIndex, userAnswers]);


  const handleAnswerSelect = (selectedIndex: number) => {
    setSelectedAnswerIndex(selectedIndex); // Update visual selection immediately

    // Create a copy and update the stored answer for the current question
    const updatedAnswers = [...userAnswers];
    updatedAnswers[currentQuestionIndex] = selectedIndex;
    setUserAnswers(updatedAnswers);

    // Original onSelectItem might be removed or repurposed if needed
    // onSelectItem(questions[currentQuestionIndex].answers[selectedIndex].answer_text);
  };

  const handleNext = () => {
    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1);
      // selectedAnswerIndex will be updated by the useEffect
    }
  };

  const handlePrevious = () => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex(currentQuestionIndex - 1);
      // selectedAnswerIndex will be updated by the useEffect
    }
  };

  const handleFinish = () => {
    let calculatedScore = 0;
    questions.forEach((question, index) => {
      const correctAnswerIndex = question.answers.findIndex(answer => answer.is_correct);
      // Check if user answered the question and if the answer was correct
      if (userAnswers[index] !== -1 && userAnswers[index] === correctAnswerIndex) {
        calculatedScore++;
      }
    });
    setScore(calculatedScore);
    setQuizFinished(true);
  };

  // --- Render Logic ---

  if (quizFinished) {
    return (
      <div className="position-absolute top-50 start-50 translate-middle text-center">
        <h2>Quiz Finished!</h2>
        <p className="lead">
          Your score: {score} out of {questions.length}
        </p>
        {/* Optional: Add a button to retry or go back */}
        {/* <Button variant="info" onClick={() => window.location.reload()}>Retry Quiz</Button> */}
      </div>
    );
  }

  // Render Quiz questions
  const currentQuestion = questions[currentQuestionIndex];

  return (
    <div className="position-absolute top-50 start-50 translate-middle" style={{width: '80%', maxWidth: '600px'}}> {/* Added some width constraint */}

      <h4>{currentQuestion.question_text}</h4>

      <div style={{ maxHeight: "300px", overflowY: "auto", marginBottom: '20px' }}> {/* Added margin bottom */}
        <ul className="list-group">
          {currentQuestion.answers.map((answer, index) => (
            <li
              className={`list-group-item ${selectedAnswerIndex === index ? "active" : ""}`} // Simplified class logic
              key={`${currentQuestionIndex}-${index}`} // More robust key using question and answer index
              onClick={() => handleAnswerSelect(index)}
              style={{ cursor: 'pointer' }} // Add pointer cursor
            >
              {answer.answer_text}
            </li>
          ))}
        </ul>
      </div>

      <div className="d-flex justify-content-between mt-3">
        <Button
          variant="secondary"
          onClick={handlePrevious}
          disabled={currentQuestionIndex === 0}
        >
          Previous
        </Button>

        {currentQuestionIndex === questions.length - 1 ? (
          // Show Finish button on the last question
          <Button variant="success" onClick={handleFinish} disabled={userAnswers[currentQuestionIndex] === -1}>
            {/* Disable finish if last question not answered */}
            Finish Quiz
          </Button>
        ) : (
          // Show Next button otherwise
          <Button
            variant="primary"
            onClick={handleNext}
            disabled={userAnswers[currentQuestionIndex] === -1} // Optionally disable next until an answer is selected
          >
            Next
          </Button>
        )}
      </div>

      <div style={{ textAlign: "right", marginTop: "10px" }}>
        <p>
          Question {currentQuestionIndex + 1} of {questions.length}
        </p>
      </div>
    </div>
  );
}

export default Quiz;