# IndividualTeacher
App is made to generate quizzes/questions based on topic or provided information.

There's also function to edit generated quizzes and add new questions (not generate with LLM).

App purpose is to help to learn, understand topics more effectively using LLM via answering multiplechoise, singlechoice... questions


# Start

frontend:
    cd frontend
    npm run dev

backend
    source .venv/bin/activate
    python backend/app.py


# First initialization
    
frontend:
    cd frontend
    npm install

    npm install --save-dev <package-name> ?

backend
    cd backend
    python3 -m venv .venv
    source .venv/bin/activate
    pip install -r requirements.txt