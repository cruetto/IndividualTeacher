// frontend/src/QuizManager.tsx
import React, { useState, useEffect } from "react";
// Import Form for checkboxes
import { Button, Offcanvas, ListGroup, Dropdown, Form } from "react-bootstrap";
import "bootstrap/dist/css/bootstrap.min.css";
import { useNavigate, useLocation } from "react-router-dom";
import { QuizData } from "../interfaces/interfaces";

interface ContextMenuState { /* ... (context menu state) ... */
    visible: boolean; x: number; y: number; quizId: string | null; quizTitle: string | null;
}

interface Props {
  quizList: QuizData[];
  selectedQuizId: string | null;
  onSelectTitleItem: (id: string) => void;
  onDeleteQuiz: (id: string, title: string) => void;
  // --- NEW Props for Shuffle Options ---
  shuffleQuestions: boolean;
  shuffleAnswers: boolean;
  onShuffleQuestionsToggle: () => void;
  onShuffleAnswersToggle: () => void;
}

const QuizManager = ({
    quizList,
    selectedQuizId,
    onSelectTitleItem,
    onDeleteQuiz,
    // Destructure new props
    shuffleQuestions,
    shuffleAnswers,
    onShuffleQuestionsToggle,
    onShuffleAnswersToggle
}: Props) => {
  const [showOffcanvas, setShowOffcanvas] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({ visible: false, x: 0, y: 0, quizId: null, quizTitle: null });

  // Handlers
  const handleCloseOffcanvas = () => setShowOffcanvas(false);
  const handleShowOffcanvas = () => setShowOffcanvas(true);
  const closeContextMenu = () => setContextMenu({ ...contextMenu, visible: false, quizId: null, quizTitle: null });

  // --- Context Menu and Outside Click (no changes needed here) ---
    const handleContextMenu = (event: React.MouseEvent<HTMLElement>, quiz: QuizData) => { /* ... */
        event.preventDefault();
        setContextMenu({ visible: true, x: event.pageX, y: event.pageY, quizId: quiz.id, quizTitle: quiz.title });
    };
    useEffect(() => {
        if (!contextMenu.visible) return;
        const handleClickOutside = (event: MouseEvent) => { if (!(event.target as Element).closest('.dropdown-menu')) { closeContextMenu(); }};
        document.addEventListener("click", handleClickOutside);
        return () => document.removeEventListener("click", handleClickOutside);
    }, [contextMenu.visible]);

  // --- Navigation/Action Handlers (no changes needed here) ---
    const handleCreateClick = () => { navigate('/create'); /* handleCloseOffcanvas(); */ };
    const handleQuizSelect = (id: string) => { onSelectTitleItem(id); if (location.pathname !== '/') { navigate('/'); } /* handleCloseOffcanvas(); */ };
    const handleEditClick = () => { if (contextMenu.quizId) { navigate(`/edit/${contextMenu.quizId}`); closeContextMenu(); handleCloseOffcanvas(); } };
    const handleDeleteClick = () => { if (contextMenu.quizId && contextMenu.quizTitle) { onDeleteQuiz(contextMenu.quizId, contextMenu.quizTitle); closeContextMenu(); /* handleCloseOffcanvas(); */ } };

  return (
    <>
      <Button variant="primary" style={{ position: "fixed", top: "1rem", left: "1rem", zIndex: 1050 }} onClick={handleShowOffcanvas}>
        Quizzes Menu
      </Button>

      {/* Context Menu (no changes needed here) */}
      {contextMenu.visible && (
          <Dropdown.Menu show style={{ position: 'absolute', left: `${contextMenu.x}px`, top: `${contextMenu.y}px`, zIndex: 1100 }}>
              <Dropdown.Header>{contextMenu.quizTitle || "Actions"}</Dropdown.Header>
              <Dropdown.Item onClick={handleEditClick}>Edit</Dropdown.Item>
              <Dropdown.Item onClick={handleDeleteClick} className="text-danger">Delete</Dropdown.Item>
              <Dropdown.Divider />
              <Dropdown.Item onClick={closeContextMenu}>Cancel</Dropdown.Item>
          </Dropdown.Menu>
      )}

      <Offcanvas id="offcanvasQuizManager" show={showOffcanvas} onHide={handleCloseOffcanvas} placement="start" backdrop={false} scroll={true}>
        <Offcanvas.Header closeButton>
          <Offcanvas.Title>Quizzes</Offcanvas.Title>
        </Offcanvas.Header>
        <Offcanvas.Body>
          <Button variant="success" className="w-100 mb-3" style={{ fontSize: "1.2rem" }} onClick={handleCreateClick}>
            Create New Quiz (AI)
          </Button>

          {/* --- NEW: Shuffle Options --- */}
          <div className="mb-3 border p-2 rounded">
            <h5>Quiz Options</h5>
            <Form.Check
                type="switch" // Changed type to switch
                id="shuffle-questions-check" // Updated id
                label="Shuffle Questions Order"
                checked={shuffleQuestions} // Controlled by prop from App.tsx
                onChange={onShuffleQuestionsToggle} // Use handler from props
            />
            <Form.Check
                type="switch" // Changed type to switch
                id="shuffle-answers-check" // Updated id
                label="Shuffle Answers Order"
                checked={shuffleAnswers} // Controlled by prop from App.tsx
                onChange={onShuffleAnswersToggle} // Use handler from props
            />
          </div>
          {/* --- End Shuffle Options --- */}


          {/* Quiz List */}
          {quizList.length === 0 ? (
             <p className="text-center text-muted">No quizzes found.</p>
          ) : (
            <ListGroup>
              {quizList.map((quiz) => (
                <ListGroup.Item
                  action
                  active={selectedQuizId === quiz.id}
                  key={quiz.id}
                  onClick={() => handleQuizSelect(quiz.id)}
                  onContextMenu={(e) => handleContextMenu(e, quiz)}
                  style={{ cursor: 'pointer' }}
                >
                  {quiz.title}
                </ListGroup.Item>
              ))}
            </ListGroup>
          )}
        </Offcanvas.Body>
      </Offcanvas>
    </>
  );
};

export default QuizManager;