
import { useState, useEffect, useMemo, useCallback } from "react";

import { Button, Dropdown, Spinner, Alert } from "react-bootstrap";
import { Question, AnswerOption } from "../interfaces/interfaces";
import { QuestionRecommendations } from '../interfaces/recommendations';
import VideoRecommendations from './VideoRecommendations';


function shuffleArray<T>(array: T[]): T[] {
  if (!array) return [];
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}


interface DisplayAnswer extends AnswerOption { originalIndex: number; }

interface DisplayQuestion extends Omit<Question, 'answers'> {
  originalIndex: number;
  answers: DisplayAnswer[];
}

interface Props {
    quizId: string;
    quizTitle: string;
    questions: Question[];
    userAnswers: number[];
    onAnswerUpdate: (quizId: string, originalQuestionIndex: number, originalAnswerIndex: number) => void;
    shuffleQuestions: boolean;
    shuffleAnswers: boolean;
    onResetQuiz: (quizId: string) => void;


    isReviewMode: boolean;
    currentDisplayIndex: number;
    score: number;
    setQuizFinished: (finished: boolean) => void;
    setCurrentDisplayIndex: (index: number) => void;
    setScore: (score: number) => void;


    onDisplayedQuestionChange: (question: DisplayQuestion | null) => void;


    recommendations?: QuestionRecommendations;
    loadingRecommendations?: boolean;
    recommendationsError?: string | null;
}

function Quiz({
    quizId,
    quizTitle,
    questions,
    userAnswers,
    onAnswerUpdate,
    shuffleQuestions,
    shuffleAnswers,
    onResetQuiz,

    isReviewMode,
    currentDisplayIndex,
    score,
    setQuizFinished,
    setCurrentDisplayIndex,
    setScore,
    onDisplayedQuestionChange,
    recommendations,
    loadingRecommendations,
    recommendationsError
}: Props) {


  const [displayQuestions, setDisplayQuestions] = useState<DisplayQuestion[]>([]);

  const [selectedDisplayAnswerIndex, setSelectedDisplayAnswerIndex] = useState<number>(-1);
  const [resetCounter, setResetCounter] = useState<number>(0);


  const setupDisplayQuestions = useCallback(() => {
    const processedQuestions = questions.map((q, index) => {

        const answersWithOriginalIndex = q.answers.map((a, ansIndex) => ({
            ...a,
            originalIndex: ansIndex
        }));
        return {
            ...q,
            originalIndex: index,
            answers: answersWithOriginalIndex
        };
    });

    setDisplayQuestions(shuffleQuestions ? shuffleArray(processedQuestions) : processedQuestions);
  }, [questions, shuffleQuestions]);


  useEffect(() => {
    console.log("Quiz Effect 1: Setting up display questions.");
    setupDisplayQuestions();

  }, [setupDisplayQuestions, resetCounter]);


  const currentDisplayQuestion = useMemo<DisplayQuestion | null>(() => {
    return (displayQuestions.length > 0 && currentDisplayIndex >= 0 && currentDisplayIndex < displayQuestions.length)
        ? displayQuestions[currentDisplayIndex]
        : null;
  }, [displayQuestions, currentDisplayIndex]);


  const currentDisplayAnswers = useMemo<DisplayAnswer[]>(() => {
     if (!currentDisplayQuestion) return [];

     return shuffleAnswers
        ? shuffleArray(currentDisplayQuestion.answers)
        : currentDisplayQuestion.answers;
  }, [currentDisplayQuestion, shuffleAnswers]);


  useEffect(() => {


    console.log(`Quiz Effect 2: Reporting displayed question index ${currentDisplayIndex}`, currentDisplayQuestion?.question_text);
    onDisplayedQuestionChange(currentDisplayQuestion);


  }, [currentDisplayQuestion, onDisplayedQuestionChange, currentDisplayIndex]);


  useEffect(() => {
    let newSelectedDisplayIndex = -1;

    if (currentDisplayQuestion && currentDisplayAnswers.length > 0) {
        const originalQuestionIndex = currentDisplayQuestion.originalIndex;

        const persistedAnswerOriginalIndex = userAnswers[originalQuestionIndex];

        if (persistedAnswerOriginalIndex !== -1 && persistedAnswerOriginalIndex !== undefined) {

            newSelectedDisplayIndex = currentDisplayAnswers.findIndex(a => a.originalIndex === persistedAnswerOriginalIndex);
        }
    }

    if (newSelectedDisplayIndex !== selectedDisplayAnswerIndex) {
        console.log(`Quiz Effect 3: Syncing visual selection to display index: ${newSelectedDisplayIndex}`);
        setSelectedDisplayAnswerIndex(newSelectedDisplayIndex);
    }

  }, [currentDisplayQuestion, currentDisplayAnswers, userAnswers, selectedDisplayAnswerIndex]);


  const handleAnswerSelect = (selectedDisplayIndex: number) => {
    if (isReviewMode || !currentDisplayQuestion) return;
    setSelectedDisplayAnswerIndex(selectedDisplayIndex);

    const selectedDisplayedAnswer = currentDisplayAnswers[selectedDisplayIndex];

    onAnswerUpdate(quizId, currentDisplayQuestion.originalIndex, selectedDisplayedAnswer.originalIndex);
  };


  const handleNext = () => { if (currentDisplayIndex < displayQuestions.length - 1) setCurrentDisplayIndex(currentDisplayIndex + 1); };
  const handlePrevious = () => { if (currentDisplayIndex > 0) setCurrentDisplayIndex(currentDisplayIndex - 1); };


  const handleJumpToQuestion = (index: number) => {
    if (index >= 0 && index < displayQuestions.length) {
        setCurrentDisplayIndex(index);
    }
  };

  const handleFinish = () => {
    let calculatedScore = 0;

    questions.forEach((question, originalIndex) => {
      const correctAnswerOriginalIndex = question.answers.findIndex(a => a.is_correct);

      const userAnswerOriginalIndex = userAnswers[originalIndex];
      if (correctAnswerOriginalIndex !== -1 && userAnswerOriginalIndex !== -1 && userAnswerOriginalIndex === correctAnswerOriginalIndex) {
        calculatedScore++;
      }
    });
    setScore(calculatedScore);
    setQuizFinished(true);
    setCurrentDisplayIndex(0);
  };

  const handleEndReviewClick = () => {
    onResetQuiz(quizId);
    setResetCounter(prev => prev + 1);
};


  const getReviewClass = (displayedAnswer: DisplayAnswer): string => {
     if (!currentDisplayQuestion) return "";

     const originalQuestionIndex = currentDisplayQuestion.originalIndex;

     const correctAnswerOriginalIndex = questions[originalQuestionIndex]?.answers.findIndex(a => a.is_correct);

     const userAnswerOriginalIndex = userAnswers[originalQuestionIndex];


     if (userAnswerOriginalIndex === displayedAnswer.originalIndex) {

         return userAnswerOriginalIndex === correctAnswerOriginalIndex ? "list-group-item-success" : "list-group-item-danger";
     }

      else if (displayedAnswer.originalIndex === correctAnswerOriginalIndex) {


        return (userAnswerOriginalIndex !== -1 && userAnswerOriginalIndex !== undefined) ? "list-group-item-info" : "list-group-item-secondary";
     }

     return "";
  };


  if (!currentDisplayQuestion) {

      return <div className="text-center p-3">Loading question or quiz empty...</div>;
  }

  const totalQuestions = displayQuestions.length;

  return (

    <div className="mx-auto" style={{ width: '80%', maxWidth: '600px' }}>


        <h1 style={{ textAlign: 'center', marginTop: '10rem', marginBottom: '2rem' }}>{quizTitle}</h1>


        {isReviewMode && (
            <div className="text-center mb-4">
                <div className="alert alert-success" role="alert">
                    <h4>Quiz Completed. Your Score: {score} / {questions.length}</h4>
                </div>
            </div>
        )}


        <h4>{currentDisplayQuestion.question_text}</h4>


        <div style={{ maxHeight: "300px", overflowY: "auto", marginBottom: '20px' }}>
            <ul className="list-group">

            {currentDisplayAnswers.map((answer, displayIndex) => (
                <li
                    className={`list-group-item ${ isReviewMode ? getReviewClass(answer) : selectedDisplayAnswerIndex === displayIndex ? "active" : "" }`}

                    key={`${currentDisplayQuestion.originalIndex}-${answer.originalIndex}-${answer.id}`}
                    onClick={() => handleAnswerSelect(displayIndex)}
                    style={{ cursor: isReviewMode ? 'default' : 'pointer' }}
                    aria-current={selectedDisplayAnswerIndex === displayIndex ? "true" : undefined}
                >
                {answer.answer_text}

                {isReviewMode && getReviewClass(answer) === 'list-group-item-success' && ' ✔️'}
                {isReviewMode && getReviewClass(answer) === 'list-group-item-danger' && ' ❌'}
                {isReviewMode && getReviewClass(answer) === 'list-group-item-info' && ' (Correct Answer)'}
                </li>
            ))}
            </ul>
        </div>


        <div className="d-flex justify-content-between align-items-center mt-3">

            <Button variant="secondary" onClick={handlePrevious} disabled={currentDisplayIndex === 0}> Previous </Button>


            {totalQuestions > 0 && (
                <Dropdown onSelect={(eventKey) => handleJumpToQuestion(parseInt(eventKey ?? '0', 10))}>
                    <Dropdown.Toggle variant="outline-secondary" id="dropdown-question-jump" size="sm">
                        Question: {currentDisplayIndex + 1} / {totalQuestions}
                    </Dropdown.Toggle>

                    <Dropdown.Menu style={{ maxHeight: '200px', overflowY: 'auto' }}>

                        {Array.from({ length: totalQuestions }, (_, i) => (
                            <Dropdown.Item
                                key={i}
                                eventKey={i.toString()}
                                active={currentDisplayIndex === i}
                            >
                                Question {i + 1}
                            </Dropdown.Item>
                        ))}
                    </Dropdown.Menu>
                </Dropdown>
            )}


            {!isReviewMode ? (
                currentDisplayIndex === totalQuestions - 1 ? (
                    <Button variant="success" onClick={handleFinish}> Finish Quiz </Button>
                ) : (
                    <Button variant="primary" onClick={handleNext}> Next </Button>
                )
            ) : (
                currentDisplayIndex < totalQuestions - 1 ? (
                    <Button variant="primary" onClick={handleNext}> Next (Review) </Button>
                ) : (
                    <Button variant="info" onClick={handleEndReviewClick}> End Review & Reset </Button>
                )
            )}
            </div>


            {isReviewMode && (
                <div style={{ marginTop: '10rem' }}>
                    {loadingRecommendations && (
                        <div className="text-center">
                            <Spinner animation="border" size="sm" />
                            <span className="ms-2">Loading learning recommendations...</span>
                        </div>
                    )}

                    {recommendationsError && (
                        <Alert variant="warning">
                            {recommendationsError}
                        </Alert>
                    )}

                    {recommendations && !loadingRecommendations && (
                        <VideoRecommendations recommendations={recommendations} />
                    )}
                </div>
            )}

        </div>
    );
}

export default Quiz;
