  // // Handler for the "Add Quiz" form submission
  // const handleAddQuiz = async (e: React.FormEvent<HTMLFormElement>) => {
  //   e.preventDefault(); // Prevent default page reload
  //   if (!newQuizTitle.trim()) return; // Basic validation

  //   try {
  //       console.log(`Adding quiz with title: ${newQuizTitle}`);
  //       // Send POST request to the backend
  //       const response = await axios.post<QuizData>(`${API_BASE_URL}/api/quizzes`, {
  //           title: newQuizTitle,
  //           // Add other fields if your backend expects them (e.g., question_count: 0)
  //       });
  //       console.log('Quiz added successfully:', response.data);

  //       // Option 1: Add the new quiz directly to the state (optimistic/direct update)
  //       // setQuizzes([...quizzes, response.data]);

  //       // Option 2: Refetch the entire list from the backend (simpler, ensures consistency)
  //       fetchQuizzes();

  //       setNewQuizTitle(''); // Clear the input field
  //       setError(null); // Clear any previous errors

  //   } catch (err) {
  //       console.error("Error adding quiz:", err);
  //       let message = 'Failed to add quiz.';
  //       if (axios.isAxiosError(err)) {
  //         message = err.response?.data?.error || err.message || message;
  //       } else if (err instanceof Error) {
  //         message = err.message;
  //       }
  //       setError(message); // Display error to the user
  //   }
  // };



// frontend/src/App.tsx
import { useState, useEffect } from 'react'; // Import hooks
import axios from 'axios'; // Import axios for HTTP requests

import ChatApp from './components/Chat';
import Quiz from './components/Quiz';
import QuizManager from './components/QuizManager';

// Import your QuizData interface for json parsing
import { QuizData} from './interfaces/interfaces.ts'

// Define the base URL for your backend API
// Make sure this matches the address and port your Flask backend is running on!
const API_BASE_URL = 'http://localhost:5001'; // Example: Adjust if your backend runs elsewhere

// Define an interface for the Quiz object structure coming from the backend



function App() {
  // --- State Variables ---
  // State to hold the list of quizzes fetched from the backend
  const [quizzes, setQuizzes] = useState<QuizData[]>([]); // Use the interface for type safety
  // State to track loading status
  const [currentQuiz, setCurrentQuiz] = useState<QuizData>();

  const [loading, setLoading] = useState<boolean>(true);
  // State to hold potential errors during fetch
  const [error, setError] = useState<string | null>(null);




  // --- Data Fetching ---
  // Function to fetch quizzes from the backend API
  const fetchQuizzes = async () => {
    setLoading(true); // Start loading
    setError(null);   // Clear previous errors
    try {

      console.log(`Fetching quizzes from: ${API_BASE_URL}/api/quizzes`);
      const response = await axios.get<QuizData[]>(`${API_BASE_URL}/api/quizzes`); // Specify expected data type
      console.log('API Response:', response.data);
      setQuizzes(response.data); // Update state with fetched data
      setCurrentQuiz(response.data[0]); // Set the first quiz as the current quiz

    } 
    catch (err) {

      console.error("Error fetching quizzes:", err);

      // Try to get a more specific error message
      let message = 'Failed to fetch quizzes.';
      if (axios.isAxiosError(err)) {
        message = err.response?.data?.error || err.message || message;
      } 
      else if (err instanceof Error) {
        message = err.message;
      }
      setError(message);
    } 
    finally {

      setLoading(false); // Stop loading regardless of success or error
    }
  };



  // useEffect hook to call fetchQuizzes when the component mounts
  useEffect(() => {
    fetchQuizzes();
    
  }, []); 

  // --- Event Handlers ---
  // Handler for selecting a quiz from QuizManager (adapt as needed)
  const handleSelectQuiz = (id: number) => {
    setCurrentQuiz(quizzes.find(quiz => quiz.id === id)); // Find and set the selected quiz
    console.log("Selected Quiz ID:", id);
  };


  const handleSelectAnswer = (answer: string) => {
    console.log("Selected Answer:", answer);
  };

  // --- Render Logic ---
  return (
    <>
      {/* Display Loading or Error State */}
      {!loading && !error && currentQuiz != undefined && (
        <>
          <h1 style={{ textAlign: 'center' }}>
            {currentQuiz.title}
          </h1>
          <QuizManager
            quizTitleList={quizzes.map(quiz => quiz.title)}
            idList={quizzes.map(quiz => quiz.id)}
            onSelectTitleItem={handleSelectQuiz}
          />


          <Quiz
            key={currentQuiz.id} // Needed to force re-render on quiz change
            questions={currentQuiz.questions}
            // onSelectItem={handleSelectAnswer} 
          />

          <ChatApp />
        </>
      )}
    </>
  );
}

export default App;