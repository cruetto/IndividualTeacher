// frontend/src/components/Chat.tsx

import { useState } from "react";
import { Button, Offcanvas, Form, InputGroup } from "react-bootstrap";
import "bootstrap/dist/css/bootstrap.min.css";

const ChatApp = () => {
  const [showChat, setShowChat] = useState(false);
  const [message, setMessage] = useState("");
  const [chatHistory, setChatHistory] = useState([
    { sender: "assistant", message: "Hello! How can I help you today?" },
  ]);

  // Handle sending message
  const sendMessage = () => {
    if (message.trim() !== "") {
      setChatHistory([
        ...chatHistory,
        { sender: "user", message },
        { sender: "assistant", message: "I'm here to help!" }, // Assistant's response
      ]);
      setMessage(""); // Reset the input
    }
  };

  return (
    <>
      {/* Chat Button */}
      <Button
        className="chat"
        style={{
          backgroundColor: "#007bff",
          color: "white",
          position: "fixed",
          top: "3rem",
          right: "3rem",
          // width: "90px",
          // height: "90px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "1.5rem",
        }}
        onClick={() => setShowChat(true)}
      >
        Chat
      </Button>

      {/* Chat Interface */}
      <Offcanvas
        show={showChat}
        onHide={() => setShowChat(false)}
        placement="end"
        backdrop={false}
      >
        <Offcanvas.Header closeButton>
          <Offcanvas.Title>Chat with Assistant</Offcanvas.Title>
        </Offcanvas.Header>
        <Offcanvas.Body
          style={{ display: "flex", flexDirection: "column", height: "100%" }}
        >
          {/* Chat History */}
          <div className="chat-box" style={{ flex: 1, overflowY: "scroll" }}>
            {chatHistory.map((chat, index) => (
              <div key={index} className={`chat-message ${chat.sender}`}>
                <strong>
                  {chat.sender === "assistant" ? "Assistant:" : "You:"}
                </strong>
                <p>{chat.message}</p>
              </div>
            ))}
          </div>

          {/* Message Input */}
          <InputGroup className="mt-3">
            <Form.Control
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Type your message"
            />
            <Button variant="outline-primary" onClick={sendMessage}>
              Send
            </Button>
          </InputGroup>
        </Offcanvas.Body>
      </Offcanvas>
    </>
  );
};

export default ChatApp;
