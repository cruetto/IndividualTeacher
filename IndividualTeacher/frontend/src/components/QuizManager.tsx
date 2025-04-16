// frontend/src/QuizManager.tsx
import { useState } from "react";
import { Button, Offcanvas } from "react-bootstrap";
import "bootstrap/dist/css/bootstrap.min.css";
import { useNavigate, useLocation } from "react-router-dom"; // Import useNavigate and useLocation
import { QuizData } from "../interfaces/interfaces"; // Adjust path if needed

interface Props {
  quizList: QuizData[]; // Expect the full QuizData objects
  selectedQuizId: string | null; // Expect string ID
  onSelectTitleItem: (id: string) => void; // Expect string ID
}

const QuizManager = ({ quizList, selectedQuizId, onSelectTitleItem }: Props) => {
  const [show, setShow] = useState(false);
  const navigate = useNavigate();
  const location = useLocation(); // Get current location

  const handleClose = () => setShow(false);
  const handleShow = () => setShow(true);

  const handleCreateClick = () => {
    navigate('/create'); // Navigate to the creator route
    // handleClose(); // Close the offcanvas
  };

  const handleQuizSelect = (id: string) => {
    onSelectTitleItem(id);
    if (location.pathname !== '/') {
        navigate('/'); // Navigate back to main quiz view if not already there
    }
    // handleClose(); // Close the offcanvas
  };

  return (
    <>
      <Button
        variant="primary"
        style={{
          position: "fixed",
          top: "1rem", // Adjusted position slightly
          left: "1rem",
           // Ensure it's above potential offcanvas backdrop
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: '0.5rem 1rem',
        }}
        onClick={handleShow}
        aria-controls="offcanvasQuizManager"
      >
        Quizzes Menu
      </Button>

      <Offcanvas
        id="offcanvasQuizManager"
        show={show}
        onHide={handleClose}
        placement="start"
        backdrop={false} // Keep backdrop
      >
        <Offcanvas.Header closeButton>
          <Offcanvas.Title>Quizzes</Offcanvas.Title>
        </Offcanvas.Header>
        <Offcanvas.Body>

          <Button
            // variant="success"
            className="w-100 mb-3" // Full width, margin bottom
            style={{ fontSize: "1.2rem" }}
            onClick={handleCreateClick}
          >
            Create New Quiz (AI)
          </Button>

          {quizList.length === 0 ? (
             <p className="text-center text-muted">No quizzes found.</p>
          ) : (
            <ul className="list-group">
              {quizList.map((quiz) => (
                <li
                  className={`list-group-item list-group-item-action ${ // Action class for hover effect
                    selectedQuizId === quiz.id ? "active" : ""
                  }`}
                  key={quiz.id} // Use unique string ID for key
                  onClick={() => handleQuizSelect(quiz.id)}
                  style={{ cursor: 'pointer' }}
                >
                  {quiz.title}
                </li>
              ))}
            </ul>
          )}
        </Offcanvas.Body>
      </Offcanvas>
    </>
  );
};

export default QuizManager;