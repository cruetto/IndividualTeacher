# IndividualTeacher
IndividualTeacher is a web application that helps users learn and understand topics more effectively by generating interactive quizzes using advanced language models (LLMs). 

Key features:
- **AI-powered quiz generation:** Instantly create multiple-choice(in deployment) and single-choice quizzes based on any topic or custom information you provide.
- **Quiz editing:** Edit generated quizzes or add your own questions manually for a personalized learning experience.
- **Flexible learning:** Practice answering questions, review your results, and reinforce your knowledge.

The app is designed to make studying engaging and adaptive, leveraging AI to support deeper understanding and


# Start
frontend:
    cd frontend
    npm run dev

backend:
    source .venv/bin/activate
    python backend/app.py


# First initialization
frontend:
    cd frontend
    npm install

backend:
    cd backend
    python3 -m venv .venv
    source .venv/bin/activate
    pip install -r requirements.txt