// frontend/src/QuizManager.tsx

import React, { useState, useEffect } from "react"; // Removed useRef as it's not used now
import { Button, Offcanvas, ListGroup, Dropdown } from "react-bootstrap";
import "bootstrap/dist/css/bootstrap.min.css";
import { useNavigate, useLocation } from "react-router-dom";
import { QuizData } from "../interfaces/interfaces"; // Adjust path if needed

// State structure for the context menu
interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  quizId: string | null; // ID of the quiz right-clicked
  quizTitle: string | null;
}

// Props expected by the component
interface Props {
  quizList: QuizData[];             // List of quizzes to display
  selectedQuizId: string | null;   // ID of the currently active quiz (for highlighting)
  onSelectTitleItem: (id: string) => void; // Callback when a quiz is selected (left-click)
  onDeleteQuiz: (id: string, title: string) => void; // Callback to initiate quiz deletion
}

const QuizManager = ({ quizList, selectedQuizId, onSelectTitleItem, onDeleteQuiz }: Props) => {
  const [showOffcanvas, setShowOffcanvas] = useState(false); // State for Offcanvas visibility
  const navigate = useNavigate(); // Hook for programmatic navigation
  const location = useLocation(); // Hook to get current URL path

  // State to manage the context menu's visibility and position
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    visible: false, x: 0, y: 0, quizId: null, quizTitle: null,
  });

  // Handlers to toggle the Offcanvas sidebar
  const handleCloseOffcanvas = () => setShowOffcanvas(false);
  const handleShowOffcanvas = () => setShowOffcanvas(true);

  // --- Context Menu Handlers ---

  // Show context menu on right-click
  const handleContextMenu = (event: React.MouseEvent<HTMLElement>, quiz: QuizData) => {
    event.preventDefault(); // Prevent the default browser right-click menu
    setContextMenu({        // Set state to show menu at click position
      visible: true,
      x: event.pageX,
      y: event.pageY,
      quizId: quiz.id,
      quizTitle: quiz.title
    });
  };

  // Hide the context menu
  const closeContextMenu = () => {
    setContextMenu({ ...contextMenu, visible: false, quizId: null, quizTitle: null });
  };

  // Effect to automatically close the context menu when clicking outside of it
  useEffect(() => {
    // Only add listener if the menu is visible
    if (!contextMenu.visible) return;

    const handleClickOutside = (event: MouseEvent) => {
      // Check if the click target is outside the dropdown menu element
      if (!(event.target as Element).closest('.dropdown-menu')) {
         closeContextMenu();
      }
    };

    // Add the listener to the whole document
    document.addEventListener("click", handleClickOutside);

    // Cleanup function: remove the listener when the effect re-runs or component unmounts
    return () => {
      document.removeEventListener("click", handleClickOutside);
    };
  }, [contextMenu.visible]); // Re-run this effect only when menu visibility changes

  // --- Navigation/Action Handlers ---

  // Navigate to the AI Quiz Creator page
  const handleCreateClick = () => {
    navigate('/create');
    // Optional: handleCloseOffcanvas(); // Decide if offcanvas should close
  };

  // Handle selecting a quiz from the list (left-click)
  const handleQuizSelect = (id: string) => {
    onSelectTitleItem(id); // Notify App component of the selection
    if (location.pathname !== '/') {
        navigate('/'); // Navigate to the main quiz view if not already there
    }
    // Optional: handleCloseOffcanvas(); // Decide if offcanvas should close
  };

  // Handle clicking 'Edit' in the context menu
  const handleEditClick = () => {
    if (contextMenu.quizId) {
        navigate(`/edit/${contextMenu.quizId}`); // Navigate to the editor page for this quiz
        closeContextMenu(); // Close the context menu
        handleCloseOffcanvas(); // Close the offcanvas when starting edit
    }
  };

  // Handle clicking 'Delete' in the context menu
  const handleDeleteClick = () => {
    if (contextMenu.quizId && contextMenu.quizTitle) {
       onDeleteQuiz(contextMenu.quizId, contextMenu.quizTitle); // Trigger delete process in App
       closeContextMenu(); // Close the context menu
       // Optional: handleCloseOffcanvas();
    }
  };

  // --- Render Component ---
  return (
    <>
      {/* Button to toggle the Offcanvas sidebar */}
      <Button
        variant="primary"
        style={{ position: "fixed", top: "1rem", left: "1rem", zIndex: 1050 }} // Position and high z-index
        onClick={handleShowOffcanvas}
        aria-controls="offcanvasQuizManager" // Accessibility
      >
        Quizzes Menu
      </Button>

      {/* Context Menu (Rendered conditionally using Bootstrap Dropdown styling) */}
      {contextMenu.visible && (
          <Dropdown.Menu
              show // Makes the dropdown visible based on state
              style={{
                  position: 'absolute', // Position it based on click coordinates
                  left: `${contextMenu.x}px`,
                  top: `${contextMenu.y}px`,
                  zIndex: 1100, // Ensure it's above the offcanvas if backdrop is true
              }}
          >
              <Dropdown.Header>{contextMenu.quizTitle || "Actions"}</Dropdown.Header>
              <Dropdown.Item onClick={handleEditClick}>Edit</Dropdown.Item>
              <Dropdown.Item onClick={handleDeleteClick} className="text-danger">Delete</Dropdown.Item>
              <Dropdown.Divider />
              <Dropdown.Item onClick={closeContextMenu}>Cancel</Dropdown.Item>
          </Dropdown.Menu>
      )}

      {/* Offcanvas Sidebar Component */}
      <Offcanvas
        id="offcanvasQuizManager"
        show={showOffcanvas}        // Control visibility with state
        onHide={handleCloseOffcanvas} // Function to call when hiding (e.g., clicking backdrop or close button)
        placement="start"           // Position on the left
        backdrop={true}             // Allow clicking outside to close (set to false to keep open)
        scroll={true}               // Allow page scrolling while offcanvas is open
        // Removed ref as it wasn't needed for the current logic
      >
        <Offcanvas.Header closeButton>
          <Offcanvas.Title>Quizzes</Offcanvas.Title>
        </Offcanvas.Header>
        <Offcanvas.Body>
          {/* Create New Quiz Button */}
          <Button
             variant="success" // Changed variant for distinction
             className="w-100 mb-3" // Bootstrap classes for styling
             style={{ fontSize: "1.2rem" }}
             onClick={handleCreateClick}
            >
            Create New Quiz (AI)
          </Button>

          {/* List of Existing Quizzes */}
          {quizList.length === 0 ? (
             <p className="text-center text-muted">No quizzes found.</p> // Message when list is empty
          ) : (
            <ListGroup>
              {quizList.map((quiz) => (
                <ListGroup.Item
                  action // Adds hover/focus styling
                  active={selectedQuizId === quiz.id} // Highlights the currently selected quiz
                  key={quiz.id} // Unique key for React list rendering
                  onClick={() => handleQuizSelect(quiz.id)} // Handle left-click
                  onContextMenu={(e) => handleContextMenu(e, quiz)} // Handle right-click
                  style={{ cursor: 'pointer' }} // Indicate it's clickable
                >
                  {quiz.title} {/* Display quiz title */}
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