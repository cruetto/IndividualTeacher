// frontend/src/components/ChatApp.tsx
import React, { useState, useEffect, useRef } from "react";
import { Button, Offcanvas, Form, InputGroup, Spinner } from "react-bootstrap";
import "bootstrap/dist/css/bootstrap.min.css";
import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL as string; // Backend URL


interface ChatMessage {
  sender: "user" | "assistant";
  message: string;
}

// Define the expected structure of the context object from App
interface ChatContext {
    quizTitle?: string;
    questionText?: string;
    options?: string[];
    isReviewMode?: boolean;
    userAnswerText?: string | null; // null if skipped
    correctAnswerText?: string;
    wasCorrect?: boolean;
}

interface Props {
  chatContext: ChatContext; // Receive the prepared context object
}

const ChatApp: React.FC<Props> = ({ chatContext }) => {
  const [showChat, setShowChat] = useState(false);
  const [message, setMessage] = useState("");
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([
    { sender: "assistant", message: "Hello! Ask me about the current quiz or question." },
  ]);
  const [isLoading, setIsLoading] = useState(false);
  const chatBoxRef = useRef<HTMLDivElement>(null);

  // Scroll chat box to bottom
  useEffect(() => {
    if (chatBoxRef.current) {
      chatBoxRef.current.scrollTop = chatBoxRef.current.scrollHeight;
    }
  }, [chatHistory]);

    // Effect to clear chat history when quiz context significantly changes (e.g., new quiz selected)
    // We use quizTitle as a proxy for quiz change. A more robust way might involve the quiz ID.
    useEffect(() => {
        console.log("ChatApp: Quiz context changed, potentially resetting history.");
        // Reset history if the quiz title changes (and isn't undefined)
        // Keep the initial greeting
        setChatHistory([{ sender: "assistant", message: "Ask me about the current quiz or question." }]);
    }, [chatContext.quizTitle]); // Depend on quizTitle

  // Handle sending message
  const sendMessage = async () => {
    const userMessage = message.trim();
    if (userMessage === "" || isLoading) return;

    const currentHistory: ChatMessage[] = [...chatHistory, { sender: "user", message: userMessage }];
    setChatHistory(currentHistory); // Show user message immediately
    setMessage("");
    setIsLoading(true);

    try {
        console.log("ChatApp: Sending to /api/chat with context:", chatContext);
        const response = await axios.post(`${API_BASE_URL}/api/chat`, {
            message: userMessage,
            context: chatContext // Send the context object received from App
        });

        const assistantReply = response.data?.reply || "Sorry, I couldn't get a response.";
        setChatHistory([...currentHistory, { sender: "assistant", message: assistantReply }]);

    } catch (err) {
        console.error("Error fetching chat response:", err);
        let errorMsg = "Sorry, error contacting assistant.";
         if (axios.isAxiosError(err) && err.response?.data?.error) {
             errorMsg = `Error: ${err.response.data.error}`;
         }
        setChatHistory([...currentHistory, { sender: "assistant", message: errorMsg }]);
    } finally {
        setIsLoading(false);
    }
  };

  const handleKeyPress = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' && !isLoading) sendMessage();
  };

  return (
    <>
      {/* Chat Button */}
      <Button
        variant="primary"
        className="chat-button"
        style={{
          position: "fixed", bottom: "2rem", right: "2rem", width: "60px", height: "60px",
          borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: "1.5rem", boxShadow: '0 4px 8px rgba(0,0,0,0.2)', zIndex: 1040, color: '#fff',
        }}
        onClick={() => setShowChat(true)} aria-label="Open Chat"
      > 💬 </Button>

      {/* Chat Interface Offcanvas */}
      <Offcanvas
        show={showChat} onHide={() => setShowChat(false)} placement="end"
        backdrop={false} scroll={true} style={{ zIndex: 1045, height: '80vh', maxHeight: '600px', width: '350px', top: 'auto', bottom: 'calc(2rem + 60px + 1rem)', right: '1rem', borderRadius: '10px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }} // Adjusted style for floating effect
      >
        <Offcanvas.Header closeButton>
          <Offcanvas.Title>Quiz Assistant</Offcanvas.Title>
        </Offcanvas.Header>
        <Offcanvas.Body style={{ display: "flex", flexDirection: "column", padding: '0.5rem' }}> {/* Reduced padding */}
          <div ref={chatBoxRef} className="chat-box mb-2" style={{ flexGrow: 1, overflowY: "auto", padding: '10px' }}>
            {chatHistory.map((chat, index) => (
              <div key={index} className={`d-flex ${chat.sender === 'user' ? 'justify-content-end' : 'justify-content-start'} mb-2`}>
                 <div
                    className={`p-2 rounded shadow-sm ${ chat.sender === 'assistant' ? 'bg-light text-dark' : 'bg-primary text-white' }`} // Added shadow
                    style={{ maxWidth: '85%', wordWrap: 'break-word', fontSize: '0.95rem' }} // Slightly smaller font
                   >
                    {chat.message}
                 </div>
              </div>
            ))}
            {isLoading && <div className="text-center mt-2"><Spinner animation="border" size="sm" /></div>}
          </div>
          <InputGroup className="mt-auto p-2 bg-light border-top">
            <Form.Control
              value={message} onChange={(e) => setMessage(e.target.value)}
              onKeyDown={handleKeyPress} placeholder="Ask a question..." // Shorter placeholder
              disabled={isLoading} aria-label="Chat message input"
              style={{ fontSize: '0.95rem' }}
            />
            <Button variant="primary" onClick={sendMessage} disabled={isLoading || message.trim() === ''}> Send </Button>
          </InputGroup>
        </Offcanvas.Body>
      </Offcanvas>
    </>
  );
};

export default ChatApp;