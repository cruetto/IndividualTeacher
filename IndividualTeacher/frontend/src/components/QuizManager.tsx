import { useState } from "react";
import { Button, Offcanvas } from "react-bootstrap";
import "bootstrap/dist/css/bootstrap.min.css";

interface Props {
  quizTitleList: string[];
  idList: number[];
  onSelectTitleItem: (id: number) => void;
}

const QuizManager = ({ quizTitleList, idList, onSelectTitleItem }: Props) => {
  const [show, setShow] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);

  return (
    <>
      {/* Button to Open Offcanvas */}
      <Button
        style={{
          backgroundColor: "#007bff",
          color: "white",
          position: "fixed",
          top: "3rem",
          left: "3rem",
          // width: "90px",
          // height: "90px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "1.5rem",
        }}
        variant="primary"
        onClick={() => setShow(true)}
      >
        Select Quiz
      </Button>

      {/* Offcanvas Sidebar */}
      <Offcanvas
        backdrop={false}
        show={show}
        onHide={() => setShow(false)}
        placement="start"
      >
        <Offcanvas.Header closeButton>
          <Offcanvas.Title>Saved Quizzes</Offcanvas.Title>
        </Offcanvas.Header>
        <Offcanvas.Body>

          
          <Button
            className="New Quiz"
            style={{
              backgroundColor: "#007bff",
              color: "white",
              position: "relative",
              margin: "0 20% 5% 20%",
              // right: "3%em",
              // width: "90px",
              // height: "90px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "1.5rem",
            }}
            // onClick={}
          >
            Create New Quiz
          </Button>

          <ul className="list-group">
            {quizTitleList.map((quizTitleList, index) => (
              <li
                className={
                  selectedIndex === index
                    ? "list-group-item active"
                    : "list-group-item"
                }
                key={quizTitleList}
                onClick={() => {
                  setSelectedIndex(index);
                  onSelectTitleItem(idList[index]);
                }}
              >
                {quizTitleList}
              </li>
            ))}
          </ul>
        </Offcanvas.Body>
      </Offcanvas>
    </>
  );
};
export default QuizManager;

