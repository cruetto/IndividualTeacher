// frontend/src/components/QuizManager.tsx
import React, { useState, useEffect } from "react";
import { Button, Offcanvas, ListGroup, Dropdown, Form, Spinner, Alert } from "react-bootstrap";
import { useNavigate, useLocation } from "react-router-dom";
import { GoogleLogin } from '@react-oauth/google'; // Import Google Login components
import { CredentialResponse } from '@react-oauth/google';
import { QuizData, User } from "../interfaces/interfaces"; // Import interfaces

// State for the right-click context menu
interface ContextMenuState {
    visible: boolean;
    x: number;
    y: number;
    quizId: string | null;
    quizTitle: string | null;
    isOwned: boolean; // Flag if the quiz is owned by the current user
}

// Props expected by the QuizManager component
interface Props {
  guestQuizList: QuizData[];   // Temporary quizzes for guests
  publicQuizList: QuizData[];  // Quizzes with userId: null
  userQuizList: QuizData[];    // Quizzes owned by the logged-in user
  selectedQuizId: string | null; // ID of the currently active quiz
  onSelectTitleItem: (id: string) => void; // Callback when a quiz title is clicked
  onDeleteQuiz: (id: string, title: string) => void; // Callback to initiate delete confirmation
  // Display Options
  shuffleQuestions: boolean;
  shuffleAnswers: boolean;
  onShuffleQuestionsToggle: () => void;
  onShuffleAnswersToggle: () => void;
  // Authentication Props
  currentUser: User | null; // Currently logged-in user object or null
  authLoading: boolean; // Flag indicating if initial auth check is happening
  onLoginSuccess: (credentialResponse: CredentialResponse) => Promise<void>; // Callback for successful Google login
  onLoginError: () => void; // Callback for failed Google login attempt
  onLogout: () => Promise<void>; // Callback to initiate logout
  loginApiError: string | null; // Error message from backend login attempt
}

const QuizManager = ({
    guestQuizList,
    publicQuizList,
    userQuizList,
    selectedQuizId,
    onSelectTitleItem,
    onDeleteQuiz,
    shuffleQuestions,
    shuffleAnswers,
    onShuffleQuestionsToggle,
    onShuffleAnswersToggle,
    currentUser,
    authLoading,
    onLoginSuccess,
    onLoginError,
    onLogout,
    loginApiError,
}: Props) => {
  const [showOffcanvas, setShowOffcanvas] = useState(false); // Controls sidebar visibility
  const navigate = useNavigate(); // For navigation actions
  const location = useLocation(); // To check current path
  // State for the right-click context menu
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({ visible: false, x: 0, y: 0, quizId: null, quizTitle: null, isOwned: false });
  const [isLoggingOut, setIsLoggingOut] = useState(false); // Spinner state for logout button
  
  // Clustering feature
  const [clusterizeEnabled, setClusterizeEnabled] = useState(false);
  const [isClustering, setIsClustering] = useState(false);
  const [clusters, setClusters] = useState<number[] | null>(null);
  const [clusterNames, setClusterNames] = useState<{[key: number]: string} | null>(null);

  // Auto-recluster whenever active quiz list changes
  useEffect(() => {
    // Skip if clustering is not enabled
    if (!clusterizeEnabled) return;
    
    // Skip if empty list
    const activeList = currentUser ? userQuizList : guestQuizList;
    if (activeList.length === 0) {
      setClusters(null);
      return;
    }

    // Debounced cluster run
    const timer = setTimeout(async () => {
      setIsClustering(true);
      
      try {
        const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/cluster-quizzes`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ titles: activeList.map(q => q.title) })
        });
        
        if (response.ok) {
          const data = await response.json();
          setClusters(data.clusters);
          setClusterNames(data.names);
        }
      } catch (err) {
        console.error("Background clustering failed:", err);
      } finally {
        setIsClustering(false);
      }
    }, 800);

    return () => clearTimeout(timer);
  }, [currentUser, userQuizList, guestQuizList, clusterizeEnabled]);

  // --- Handlers ---
  const handleCloseOffcanvas = () => setShowOffcanvas(false);
  const handleShowOffcanvas = () => setShowOffcanvas(true);
  const closeContextMenu = () => setContextMenu({ ...contextMenu, visible: false });

  // Show context menu (only for owned quizzes when logged in)
  const handleContextMenu = (event: React.MouseEvent<HTMLElement>, quiz: QuizData, isOwned: boolean) => {
      event.preventDefault(); // Prevent default browser right-click menu
      // Only show edit/delete options if the user is logged in AND owns the quiz
      if (currentUser && isOwned) {
           setContextMenu({ visible: true, x: event.pageX, y: event.pageY, quizId: quiz.id, quizTitle: quiz.title, isOwned });
      }
      // Do nothing for guest or public quizzes, or if not logged in
  };

  // Effect to close context menu when clicking outside of it
  useEffect(() => {
      if (!contextMenu.visible) return; // Only add listener when menu is visible
      const handleClickOutside = (event: MouseEvent) => {
         const targetElement = event.target as Element;
         // Close if the click is not inside the dropdown menu itself
         if (targetElement && !targetElement.closest('.dropdown-menu')) {
            closeContextMenu();
        }
      };
      document.addEventListener("click", handleClickOutside, true); // Use capture phase
      // Cleanup: remove listener when menu hides or component unmounts
      return () => document.removeEventListener("click", handleClickOutside, true);
  }, [contextMenu.visible]); // Re-run effect if menu visibility changes

  // Navigate to the Quiz Creator page
  const handleCreateClick = () => {
      navigate('/create');
      handleCloseOffcanvas(); // Close sidebar after navigating
  };

  // Select a quiz and navigate to home page if needed
  const handleQuizSelect = (id: string) => {
      onSelectTitleItem(id); // Notify App component of selection
      // If not on the main page, navigate there to view the quiz
      if (location.pathname !== '/') {
          navigate('/');
      }
      // Optional: Close the offcanvas when a quiz is selected
      // handleCloseOffcanvas();
  };

  // Navigate to the Quiz Editor page (only if owned and logged in)
  const handleEditClick = () => {
      if (contextMenu.quizId && contextMenu.isOwned && currentUser) {
          navigate(`/edit/${contextMenu.quizId}`);
          closeContextMenu(); // Close context menu
          handleCloseOffcanvas(); // Close sidebar
      } else {
          console.warn("Edit attempted without ownership or login.");
          closeContextMenu();
      }
  };

  // Initiate the delete process via App component (only if owned and logged in)
  const handleDeleteClick = () => {
      if (contextMenu.quizId && contextMenu.quizTitle && contextMenu.isOwned && currentUser) {
          onDeleteQuiz(contextMenu.quizId, contextMenu.quizTitle); // Trigger confirmation modal in App
          closeContextMenu(); // Close context menu
          // Keep the sidebar open while the modal is shown
      } else {
          console.warn("Delete attempted without ownership or login.");
          closeContextMenu();
      }
  };

  // Handle logout action
  const handleLogoutClick = async () => {
      setIsLoggingOut(true); // Show spinner on button
      try {
          await onLogout(); // Call the logout handler passed from App
          // Success/error message/state is handled in App component
      } catch (err) {
          // Error state is handled in App, log here if needed
          console.error("Logout failed in manager:", err);
      } finally {
          setIsLoggingOut(false); // Hide spinner
          handleCloseOffcanvas(); // Close menu after logout attempt
      }
  };


  // --- Rendering Function for Quiz Lists ---
  // Renders a list group for guest, user, or public quizzes
  const renderQuizList = (list: QuizData[], title: string, type: 'guest' | 'user' | 'public', clusterOffset: number = 0) => {
    if (list.length === 0) {
      return (
        <ListGroup variant="flush">
           {list.length === 0 && type === 'guest' && !currentUser && <ListGroup.Item disabled className="text-muted small fst-italic">(No temporary quizzes)</ListGroup.Item>}
           {list.length === 0 && type === 'user' && currentUser && <ListGroup.Item disabled className="text-muted small fst-italic">(No quizzes created yet)</ListGroup.Item>}
           {list.length === 0 && type === 'public' && <ListGroup.Item disabled className="text-muted small fst-italic">(No public quizzes available)</ListGroup.Item>}
        </ListGroup>
      );
    }

    // If clustering is enabled AND this is not public quizzes, group quizzes by cluster
    if (clusterizeEnabled && clusters && clusterOffset >= 0) {
      // Build clusters for this list
      const clusterGroups: { [key: number]: QuizData[] } = {};
      
      list.forEach((quiz, idx) => {
        const clusterIdx = clusters[clusterOffset + idx];
        if (!clusterGroups[clusterIdx]) {
          clusterGroups[clusterIdx] = [];
        }
        clusterGroups[clusterIdx].push(quiz);
      });

      return (
        <>
          <h5 className="mt-3 mb-1 text-muted">{title}</h5>
          {Object.entries(clusterGroups)
            .sort(([a], [b]) => parseInt(a) - parseInt(b))
            .map(([clusterId, quizzes]) => (
              <div key={`cluster-${type}-${clusterId}`}>
                <h6 className="mt-2 mb-1 text-primary small fw-bold">
                  {clusterNames ? clusterNames[parseInt(clusterId)] : `Cluster ${parseInt(clusterId) + 1}`}
                  <span className="text-muted fw-normal ms-1">({quizzes.length} quizzes)</span>
                </h6>
                <ListGroup variant="flush" className="mb-2">
                  {quizzes.map((quiz) => {
                    const canEditOrDelete = type === 'user' && !!currentUser;
                    return (
                      <ListGroup.Item
                        action
                        active={selectedQuizId === quiz.id}
                        key={`${type}-${quiz.id}`}
                        onClick={() => handleQuizSelect(quiz.id)}
                        onContextMenu={canEditOrDelete ? (e) => handleContextMenu(e, quiz, true) : undefined}
                        style={{ cursor: 'pointer', paddingLeft: '20px', paddingRight: '10px' }}
                        title={canEditOrDelete ? `${quiz.title} (Right-click for options)` : quiz.title}
                      >
                        {quiz.title}
                        {type === 'guest' && <span className="badge bg-secondary ms-2 float-end">Temporary</span>}
                      </ListGroup.Item>
                    );
                  })}
                </ListGroup>
              </div>
            ))}
        </>
      );
    }

    // Normal flat rendering when clustering is disabled
    return (
     <>
        {list.length > 0 && <h5 className="mt-3 mb-1 text-muted">{title}</h5>}
        <ListGroup variant="flush">
          {list.map((quiz) => {
            const canEditOrDelete = type === 'user' && !!currentUser;
            return (
                <ListGroup.Item
                  action
                  active={selectedQuizId === quiz.id}
                  key={`${type}-${quiz.id}`}
                  onClick={() => handleQuizSelect(quiz.id)}
                  onContextMenu={canEditOrDelete ? (e) => handleContextMenu(e, quiz, true) : undefined}
                  style={{ cursor: 'pointer', paddingLeft: '10px', paddingRight: '10px' }}
                  title={canEditOrDelete ? `${quiz.title} (Right-click for options)` : quiz.title}
                >
                  {quiz.title}
                  {type === 'guest' && <span className="badge bg-secondary ms-2 float-end">Temporary</span>}
                </ListGroup.Item>
            );
          })}
        </ListGroup>
     </>
    );
  };

  // --- Component Return ---
  return (
    <>
      {/* Menu Toggle Button */}
      <Button variant="primary" style={{ position: "fixed", top: "1rem", left: "1rem", zIndex: 0 }} onClick={handleShowOffcanvas}>
        ☰ Menu
      </Button>

      {/* Context Menu - Render only if needed */}
      {contextMenu.visible && contextMenu.isOwned && currentUser && (
          <Dropdown.Menu show style={{ position: 'absolute', left: `${contextMenu.x}px`, top: `${contextMenu.y}px`, zIndex: 1100 }}>
              <Dropdown.Header>{contextMenu.quizTitle || "Actions"}</Dropdown.Header>
              <Dropdown.Item onClick={handleEditClick}>Edit Quiz</Dropdown.Item>
              <Dropdown.Item onClick={handleDeleteClick} className="text-danger">Delete Quiz</Dropdown.Item>
              <Dropdown.Divider />
              <Dropdown.Item onClick={closeContextMenu}>Cancel</Dropdown.Item>
          </Dropdown.Menu>
      )}

      {/* Offcanvas Sidebar */}
      <Offcanvas id="offcanvasQuizManager" show={showOffcanvas} onHide={handleCloseOffcanvas} placement="start" backdrop={false} scroll={true}>
        <Offcanvas.Header closeButton>
          <Offcanvas.Title>Quizzy Menu</Offcanvas.Title>
        </Offcanvas.Header>
        <Offcanvas.Body className="d-flex flex-column">

          {/* --- Authentication Section --- */}
          <div className="mb-3 border-bottom pb-3">
              {/* Conditionally render based on authLoading FIRST */}
              {authLoading ? (
                   <div className="text-center"><Spinner animation="border" size="sm" /> Loading User...</div>
              ) : currentUser ? (
                  // Render Logged-in view if user exists
                  <div className="d-flex flex-column align-items-center">
                      {currentUser.picture && (
                          <img src={currentUser.picture} alt="User profile" referrerPolicy="no-referrer" style={{ width: '40px', height: '40px', borderRadius: '50%', marginBottom: '5px'}}/>
                      )}
                      <span className="mb-1 text-center small">Welcome, {currentUser.name}!</span>
                      <Button variant="outline-secondary" size="sm" onClick={handleLogoutClick} disabled={isLoggingOut}>
                          {isLoggingOut ? <Spinner animation="border" size="sm" /> : "Logout"}
                      </Button>
                  </div>
              ) : (
                  // Render Logged-out view ONLY if not loading AND no user
                  <div className="d-grid">
                      <GoogleLogin
                          onSuccess={onLoginSuccess}
                          onError={onLoginError}
                          useOneTap={false} // Keep disabled for testing
                          theme="outline"
                          size="medium"
                       />
                       {loginApiError && <Alert variant="danger" className="mt-2 p-1 text-center small">{loginApiError}</Alert>}
                  </div>
              )}
          </div>
          {/* --- End Authentication Section --- */}

          {/* --- Rest of the Offcanvas Body --- */}
          {/* Ensure these sections are OUTSIDE the conditional auth rendering */}

          {/* Create Quiz Button */}
          <Button variant="success" className="w-100 mb-3" onClick={handleCreateClick}>
            + Create New Quiz (AI)
          </Button>

          {/* Quiz Display Options */}
          <div className="mb-3 border p-2 rounded bg-light">
            <Form.Label className="fw-bold small">Quiz Display Options</Form.Label>
            <Form.Check
                type="switch" id="shuffle-questions-check" label="Shuffle Questions"
                checked={shuffleQuestions} onChange={onShuffleQuestionsToggle} className="small"
            />
            <Form.Check
                type="switch" id="shuffle-answers-check" label="Shuffle Answers"
                checked={shuffleAnswers} onChange={onShuffleAnswersToggle} className="small"
            />
            <hr className="my-2"/>
            <Form.Check
                type="switch" id="clusterize-check" label={isClustering ? "Clustering quizzes..." : "Clusterize Quizzes"}
                checked={clusterizeEnabled} 
                disabled={isClustering}
                onChange={() => {
                    const newState = !clusterizeEnabled;
                    setClusterizeEnabled(newState);
                    
                    if (!newState) {
                       setClusters(null);
                       // Keep cluster names cached for next toggle
                    }
                }} 
                className="small"
            />
          </div>

          {/* Quiz Lists Section */}
           <div style={{ flexGrow: 1, overflowY: 'auto', borderTop: '1px solid #eee', paddingTop: '10px' }}>
               {/* Conditionally render lists based on currentUser */}
               {!currentUser && renderQuizList(guestQuizList, "Temporary Quizzes", 'guest', 0)}
               {currentUser && renderQuizList(userQuizList, "My Quizzes", 'user', 0)}
               {/* Public quizzes are never clustered, always flat */}
               {renderQuizList(publicQuizList, "Public Quizzes", 'public', -1)}

               {/* Overall empty state check */}
               {!authLoading && guestQuizList.length === 0 && userQuizList.length === 0 && publicQuizList.length === 0 && (
                   <p className="text-center text-muted mt-3">No quizzes found. Create one!</p>
               )}
            </div>

        </Offcanvas.Body>
      </Offcanvas>
    </>
  );
}; // End of QuizManager component

export default QuizManager;