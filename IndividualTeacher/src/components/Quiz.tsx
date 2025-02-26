import { useState } from "react";

interface Props {
  answers: string[];
  heading: string;
  onSelectItem: (answer: string) => void;
}

function Quiz({ answers, heading, onSelectItem }: Props) {
  const [selectedIndex, setSelectedIndex] = useState(-1);

  return (
    <div className="position-absolute top-50 start-50 translate-middle">
      <h1>{heading}</h1>
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
  );
}

export default Quiz;
