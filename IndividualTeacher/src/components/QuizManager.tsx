import React, { useState } from "react";
import { Button, Offcanvas } from "react-bootstrap";
import "bootstrap/dist/css/bootstrap.min.css";

const QuizManager = () => {
  const [show, setShow] = useState(false);

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
        Open Sidebar
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
          <p>This is the Offcanvas content.</p>
        </Offcanvas.Body>
      </Offcanvas>
    </>
  );
};

export default QuizManager;
