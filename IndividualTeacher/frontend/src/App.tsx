// import ChatApp from "./components/Chat";
// import Quiz from "./components/Quiz";
// import QuizManager from "./components/QuizManager";

// function App() {
//   let answers = [
//     "Answer asdfafasdfasdfasdfasdfas asdfafasdfasdfasdfasdfasd1",
//     "Answer 2 asdfafasdfasdfasdfasdfas asdfafasdfasdfasdfasdfas",
//     "Answer  asdfafasdfasdfasdfasdfas3",
//     "Answer 4 asdfafasdfasdfasdfasdfas",
//   ];
//   let quizzes = ["Machine Learning", "Computer Science", "Biology", "Physics"];
//   const handleSelectItemAnswer = (answer: string) => {
//     console.log(answer);
//   };
//   const handleSelectQuiz = (quizName: string) => {
//     console.log(quizName);
//   };

//   // let quizzes = ["Computer Science", "Biology"];
//   // const handleSelectItemQuiz = (answer: string) => {
//   //   console.log(answer);
//   // };

//   return (
//     <>
//       <QuizManager
//         quizName={quizzes}
//         onSelectItem={handleSelectQuiz}
//       ></QuizManager>

//       <Quiz
//         answers={answers}
//         heading="Questionasdfasdfasdfa?"
//         onSelectItem={handleSelectItemAnswer}
//       ></Quiz>

//       <ChatApp></ChatApp>
//     </>
//   );
// }

// export default App;





// frontend/src/App.tsx






import { useState, useEffect } from 'react'; // Import hooks
import axios from 'axios'; // Import axios for HTTP requests

import ChatApp from './components/Chat';
import Quiz from './components/Quiz';
import QuizManager from './components/QuizManager';

// Define the base URL for your backend API
// Make sure this matches the address and port your Flask backend is running on!
const API_BASE_URL = 'http://localhost:5001'; // Example: Adjust if your backend runs elsewhere

// Define an interface for the Quiz object structure coming from the backend
interface QuizData {
  id: number;
  title: string;
  question_count: number; // Or whatever structure your backend sends
}

function App() {
  // --- State Variables ---
  // State to hold the list of quizzes fetched from the backend
  const [quizzes, setQuizzes] = useState<QuizData[]>([]); // Use the interface for type safety
  // State to track loading status
  const [loading, setLoading] = useState<boolean>(true);
  // State to hold potential errors during fetch
  const [error, setError] = useState<string | null>(null);
  // State for the new quiz title input field (for adding quizzes)
  const [newQuizTitle, setNewQuizTitle] = useState<string>('');


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
    } catch (err) {
      console.error("Error fetching quizzes:", err);
      // Try to get a more specific error message
      let message = 'Failed to fetch quizzes.';
      if (axios.isAxiosError(err)) {
        message = err.response?.data?.error || err.message || message;
      } else if (err instanceof Error) {
        message = err.message;
      }
      setError(message);
    } finally {
      setLoading(false); // Stop loading regardless of success or error
    }
  };

  // useEffect hook to call fetchQuizzes when the component mounts
  useEffect(() => {
    fetchQuizzes();
  }, []); // Empty dependency array means this runs only once on mount

  // --- Event Handlers ---
  // Handler for selecting a quiz from QuizManager (adapt as needed)
  const handleSelectQuiz = (quizTitle: string) => {
    console.log("Selected Quiz Title:", quizTitle);
    // You might want to find the full quiz object here based on the title
    const selectedQuiz = quizzes.find(q => q.title === quizTitle);
    console.log("Selected Quiz Object:", selectedQuiz);
    // TODO: Add logic to display questions for the selected quiz, etc.
  };

  // Handler for the "Add Quiz" form submission
  const handleAddQuiz = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault(); // Prevent default page reload
    if (!newQuizTitle.trim()) return; // Basic validation

    try {
        console.log(`Adding quiz with title: ${newQuizTitle}`);
        // Send POST request to the backend
        const response = await axios.post<QuizData>(`${API_BASE_URL}/api/quizzes`, {
            title: newQuizTitle,
            // Add other fields if your backend expects them (e.g., question_count: 0)
        });
        console.log('Quiz added successfully:', response.data);

        // Option 1: Add the new quiz directly to the state (optimistic/direct update)
        // setQuizzes([...quizzes, response.data]);

        // Option 2: Refetch the entire list from the backend (simpler, ensures consistency)
        fetchQuizzes();

        setNewQuizTitle(''); // Clear the input field
        setError(null); // Clear any previous errors

    } catch (err) {
        console.error("Error adding quiz:", err);
        let message = 'Failed to add quiz.';
        if (axios.isAxiosError(err)) {
          message = err.response?.data?.error || err.message || message;
        } else if (err instanceof Error) {
          message = err.message;
        }
        setError(message); // Display error to the user
    }
  };


  // --- Hardcoded data for the other components (keep for now) ---
  let answers = [
    "Answer asdfafasdfasdfasdfasdfas asdfafasdfasdfasdfasdfasd1",
    "Answer 2 asdfafasdfasdfasdfasdfas asdfafasdfasdfasdfasdfas",
    "Answer  asdfafasdfasdfasdfasdfas3",
    "Answer 4 asdfafasdfasdfasdfasdfas",
  ];
  const handleSelectItemAnswer = (answer: string) => {
    console.log(answer);
  };

  // --- Render Logic ---
  return (
    <>

      {/* Display Loading or Error State */}
      {loading && <p>Loading quizzes...</p>}
      {error && <p style={{ color: 'red' }}>Error: {error}</p>}

      {/* Only render QuizManager if not loading and no error */}
      {!loading && !error && (
        <>
          {/* Section to Add New Quiz */}
          {/* <div style={{ marginBottom: '20px', padding: '10px', border: '1px solid #ccc' }}>
            <h2>Add New Quiz</h2>
            <form onSubmit={handleAddQuiz}>
              <input
                type="text"
                value={newQuizTitle}
                onChange={(e) => setNewQuizTitle(e.target.value)}
                placeholder="Enter new quiz title"
                required
                style={{ marginRight: '10px' }}
              />
              <button type="submit">Add Quiz</button>
            </form>
          </div> */}

          {/* Display Existing Quizzes */}
          <QuizManager
            // Pass only the titles if QuizManager expects string[]
            // Or modify QuizManager to accept QuizData[]
            quizName={quizzes.map(quiz => quiz.title)}
            onSelectItem={handleSelectQuiz}
          />
        </>
      )}



      {/* Keep other components as they were for now */}
      <Quiz
        answers={answers}
        heading="Sample Question (Hardcoded)"
        onSelectItem={handleSelectItemAnswer}
      />

      <ChatApp />
    </>
  );
}

export default App;