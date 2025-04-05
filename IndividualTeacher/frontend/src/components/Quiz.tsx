import { useState } from "react";
import { Button } from "react-bootstrap";

interface Props {
  answers: string[];
  heading: string;
  onSelectItem: (answer: string) => void;
}

function Quiz({ answers, heading, onSelectItem }: Props) {
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);

  const handleNext = () => {
    if (currentQuestionIndex < answers.length - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1);
      setSelectedIndex(-1); // Reset selected index for new question
    }
  };

  const handlePrevious = () => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex(currentQuestionIndex - 1);
      setSelectedIndex(-1); // Reset selected index for new question
    }
  };

  return (
    <div className="position-absolute top-50 start-50 translate-middle">
      <h1>{heading}</h1>
      <div style={{ maxHeight: "300px", overflowY: "auto" }}>
        <ul className="list-group">
          {answers.map((answer, index) => (
            <li
              className={
                selectedIndex === index
                  ? "list-group-item active"
                  : "list-group-item"
              }
              key={answer}
              onClick={() => {
                setSelectedIndex(index);
                onSelectItem(answer);
              }}
            >
              {answer}
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
        <Button
          variant="primary"
          onClick={handleNext}
          disabled={currentQuestionIndex === answers.length - 1}
        >
          Next
        </Button>
      </div>
    </div>
  );
}

export default Quiz;
