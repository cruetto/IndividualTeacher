import ChatApp from "./components/Chat";
import Quiz from "./components/Quiz";
import QuizManager from "./components/QuizManager";

function App() {
  let answers = [
    "Answer asdfafasdfasdfasdfasdfas asdfafasdfasdfasdfasdfasd1",
    "Answer 2 asdfafasdfasdfasdfasdfas asdfafasdfasdfasdfasdfas",
    "Answer  asdfafasdfasdfasdfasdfas3",
    "Answer 4 asdfafasdfasdfasdfasdfas",
  ];
  const handleSelectItemAnswer = (answer: string) => {
    console.log(answer);
  };

  // let quizzes = ["Computer Science", "Biology"];
  // const handleSelectItemQuiz = (answer: string) => {
  //   console.log(answer);
  // };

  return (
    <>
      <QuizManager></QuizManager>

      <Quiz
        answers={answers}
        heading="Questionasdfasdfasdfa?"
        onSelectItem={handleSelectItemAnswer}
      ></Quiz>

      <ChatApp></ChatApp>
    </>
  );
}

export default App;
