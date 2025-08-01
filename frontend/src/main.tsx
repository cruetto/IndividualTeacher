// frontend/src/main.tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App'; // Your main App component
import { GoogleOAuthProvider } from '@react-oauth/google';
import 'bootstrap/dist/css/bootstrap.min.css'; // Import Bootstrap CSS


// Load Google Client ID from environment variables (Vite specific)
const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

if (!googleClientId) {
    console.error("FATAL ERROR: VITE_GOOGLE_CLIENT_ID environment variable not set.");
    // Optionally render an error message instead of the app
    ReactDOM.createRoot(document.getElementById('root')!).render(
      <React.StrictMode>
        <div style={{ padding: '20px', color: 'red', textAlign: 'center', border: '1px solid red', margin: '20px' }}>
          <strong>Configuration Error:</strong> Google Client ID is missing.
          Please ensure the <code>VITE_GOOGLE_CLIENT_ID</code> environment variable is set correctly in your <code>frontend/.env</code> file.
        </div>
      </React.StrictMode>,
    );
} else {
    ReactDOM.createRoot(document.getElementById('root')!).render(
      <React.StrictMode>
        {/* Wrap the entire App with the GoogleOAuthProvider */}
        <GoogleOAuthProvider clientId={googleClientId}>
          <App />
        </GoogleOAuthProvider>
      </React.StrictMode>,
    );
}