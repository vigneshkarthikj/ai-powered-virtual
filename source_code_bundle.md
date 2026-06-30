{% raw %}
# Source Code Bundle

This document contains the complete code for all new and modified files in both the frontend and backend. You can use this to review, copy, or verify the code on your end.

---

## 📂 Backend Files

````carousel
### schemas.py
File Link: [schemas.py](file:///c:/Users/Karthik/OneDrive/Attachments/Intenship/backend/schemas.py)

```python
from pydantic import BaseModel, EmailStr, Field
from typing import List, Optional
from datetime import datetime

# User schemas
class UserCreate(BaseModel):
    name: str
    email: EmailStr
    password: str
    branch: Optional[str] = None
    year: Optional[int] = None

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class Token(BaseModel):
    access_token: str
    token_type: str

class ForgotPasswordRequest(BaseModel):
    email: EmailStr
    new_password: str
    nic_code: str
    manufacturing_unit: str
    security_answer: str

class UserResponse(BaseModel):
    id: int
    name: str
    email: EmailStr
    branch: Optional[str] = None
    year: Optional[int] = None
    created_at: datetime

    class Config:
        from_attributes = True

# Chat schemas
class ChatAsk(BaseModel):
    question: str
    session_id: Optional[str] = None

class ChatResponse(BaseModel):
    id: int
    session_id: str
    question: str
    answer: str
    timestamp: datetime

    class Config:
        from_attributes = True

# Uploaded File schemas
class FileResponse(BaseModel):
    id: int
    file_name: str
    file_size: int
    upload_date: datetime

    class Config:
        from_attributes = True

# RAG Chat schema
class RagAsk(BaseModel):
    file_id: int
    question: str

# Quiz schemas
class QuizQuestion(BaseModel):
    question_text: str
    options: List[str]
    correct_answer: str # matches one of the option strings
    explanation: str

class QuizGenerateRequest(BaseModel):
    topic: str
    num_questions: int = Field(default=5, ge=1, le=10)
    file_id: Optional[int] = None # Generate quiz from a uploaded PDF directly if provided!

class QuizRecordCreate(BaseModel):
    topic: str
    score: int
    total_questions: int

class QuizRecordResponse(BaseModel):
    id: int
    topic: str
    score: int
    total_questions: int
    taken_at: datetime

    class Config:
        from_attributes = True

# Notes Summarization schemas
class SummarizeRequest(BaseModel):
    file_id: int
    detail_level: str = "medium" # short, medium, detailed

# Study Planner schemas
class PlannerRequest(BaseModel):
    exam_name: str
    days_left: int = Field(..., ge=1)
    subjects: List[str]
    hours_per_day: float = Field(..., ge=0.5, le=24.0)

# Dashboard statistics schema
class DashboardStats(BaseModel):
    total_chats: int
    total_uploads: int
    total_quizzes_taken: int
    average_quiz_score: float
    recent_quizzes: List[QuizRecordResponse]
    recent_files: List[FileResponse]
```
<!-- slide -->
### main.py
File Link: [main.py](file:///c:/Users/Karthik/OneDrive/Attachments/Intenship/backend/main.py)

```python
import os
import shutil
import json
from typing import List, Optional
from fastapi import FastAPI, Depends, HTTPException, status, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime

import models
import schemas
import auth
import ai
import rag
from scheduler_ga import GeneticScheduler
from database import engine, Base, get_db

# Initialize DB tables
Base.metadata.create_all(bind=engine)

app = FastAPI(title="AI-Powered Virtual Academic Assistant API")

# Configure CORS for local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # In development, allow all. In production, restrict.
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Upload directory setup
UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

# ----------------- AUTHENTICATION ENDPOINTS -----------------

@app.post("/api/auth/register", response_model=schemas.UserResponse, status_code=status.HTTP_201_CREATED)
def register(user_data: schemas.UserCreate, db: Session = Depends(get_db)):
    # Check if user already exists
    db_user = db.query(models.User).filter(models.User.email == user_data.email).first()
    if db_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )
    
    # Create new user
    hashed_password = auth.get_password_hash(user_data.password)
    new_user = models.User(
        name=user_data.name,
        email=user_data.email,
        hashed_password=hashed_password,
        branch=user_data.branch,
        year=user_data.year
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user

@app.post("/api/auth/login", response_model=schemas.Token)
def login(login_data: schemas.UserLogin, db: Session = Depends(get_db)):
    # Authenticate credentials
    user = db.query(models.User).filter(models.User.email == login_data.email).first()
    if not user or not auth.verify_password(login_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Generate access token
    access_token = auth.create_access_token(data={"sub": user.email})
    return {"access_token": access_token, "token_type": "bearer"}

@app.post("/api/auth/forgot-password")
def forgot_password(forgot_data: schemas.ForgotPasswordRequest, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.email == forgot_data.email).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User with this email not found"
        )
    
    if forgot_data.nic_code.strip() != "2620":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid NIC Code. Authorized hardware manufacturing units only (NIC 2620)."
        )
    
    clean_ans = forgot_data.security_answer.strip().lower()
    if "computer" not in clean_ans or "peripheral" not in clean_ans:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Incorrect industrial vertical verification answer."
        )
    
    user.hashed_password = auth.get_password_hash(forgot_data.new_password)
    db.commit()
    return {"message": "Password reset successfully! Please sign in with your new credentials."}

@app.get("/api/user/me", response_model=schemas.UserResponse)
def read_current_user(current_user: models.User = Depends(auth.get_current_user)):
    return current_user

# ----------------- DASHBOARD STATISTICS -----------------

@app.get("/api/user/stats", response_model=schemas.DashboardStats)
def get_dashboard_stats(current_user: models.User = Depends(auth.get_current_user), db: Session = Depends(get_db)):
    total_chats = db.query(models.ChatHistory).filter(models.ChatHistory.user_id == current_user.id).count()
    total_uploads = db.query(models.UploadedFile).filter(models.UploadedFile.user_id == current_user.id).count()
    total_quizzes = db.query(models.QuizRecord).filter(models.QuizRecord.user_id == current_user.id).count()
    
    avg_score = 0.0
    if total_quizzes > 0:
        quiz_stats = db.query(
            func.sum(models.QuizRecord.score).label("total_score"),
            func.sum(models.QuizRecord.total_questions).label("total_q")
        ).filter(models.QuizRecord.user_id == current_user.id).first()
        
        if quiz_stats and quiz_stats.total_q:
            avg_score = (quiz_stats.total_score / quiz_stats.total_q) * 100.0

    recent_quizzes = db.query(models.QuizRecord).filter(
        models.QuizRecord.user_id == current_user.id
    ).order_by(models.QuizRecord.taken_at.desc()).limit(5).all()

    recent_files = db.query(models.UploadedFile).filter(
        models.UploadedFile.user_id == current_user.id
    ).order_by(models.UploadedFile.upload_date.desc()).limit(5).all()

    return {
        "total_chats": total_chats,
        "total_uploads": total_uploads,
        "total_quizzes_taken": total_quizzes,
        "average_quiz_score": round(avg_score, 1),
        "recent_quizzes": recent_quizzes,
        "recent_files": recent_files
    }

# ----------------- CHATBOT ENDPOINTS -----------------

@app.post("/api/chat/ask", response_model=schemas.ChatResponse)
def ask_assistant(payload: schemas.ChatAsk, current_user: models.User = Depends(auth.get_current_user), db: Session = Depends(get_db)):
    session_id = payload.session_id or f"session_{int(datetime.utcnow().timestamp())}"
    past_chats = db.query(models.ChatHistory).filter(
        models.ChatHistory.user_id == current_user.id,
        models.ChatHistory.session_id == session_id
    ).order_by(models.ChatHistory.timestamp.asc()).all()
    
    gemini_history = []
    for chat in past_chats:
        gemini_history.append({"role": "user", "parts": [chat.question]})
        gemini_history.append({"role": "model", "parts": [chat.answer]})
    
    system_instruction = (
        f"You are an AI-Powered Virtual Academic Assistant. You are currently assisting {current_user.name}, "
        f"a B.Tech CSE student (Branch: {current_user.branch or 'CSE'}, Year: {current_user.year or '2nd'}). "
        f"Keep explanations highly academic, clear, and tailored to computer science and engineering coursework. "
        f"Write source code segments where appropriate using Markdown code syntax blocks, and explain the steps."
    )
    
    response_text = ai.ask_gemini_chatbot(gemini_history, payload.question, system_instruction)
    new_chat = models.ChatHistory(
        user_id=current_user.id,
        session_id=session_id,
        question=payload.question,
        answer=response_text
    )
    db.add(new_chat)
    db.commit()
    db.refresh(new_chat)
    return new_chat

@app.get("/api/chat/history", response_model=List[schemas.ChatResponse])
def get_chat_history(session_id: Optional[str] = None, current_user: models.User = Depends(auth.get_current_user), db: Session = Depends(get_db)):
    query = db.query(models.ChatHistory).filter(models.ChatHistory.user_id == current_user.id)
    if session_id:
        query = query.filter(models.ChatHistory.session_id == session_id)
    return query.order_by(models.ChatHistory.timestamp.desc()).all()

@app.get("/api/chat/sessions")
def get_chat_sessions(current_user: models.User = Depends(auth.get_current_user), db: Session = Depends(get_db)):
    sessions = db.query(
        models.ChatHistory.session_id,
        func.max(models.ChatHistory.timestamp).label("last_active"),
        func.min(models.ChatHistory.question).label("title")
    ).filter(
        models.ChatHistory.user_id == current_user.id
    ).group_by(
        models.ChatHistory.session_id
    ).order_by(
        func.max(models.ChatHistory.timestamp).desc()
    ).all()
    
    return [
        {"session_id": s[0], "last_active": s[1], "title": s[2][:40] + "..." if len(s[2]) > 40 else s[2]}
        for s in sessions
    ]

# ----------------- PDF RAG ENDPOINTS -----------------

@app.post("/api/files/upload", response_model=schemas.FileResponse)
def upload_file(file: UploadFile = File(...), current_user: models.User = Depends(auth.get_current_user), db: Session = Depends(get_db)):
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only PDF documents are supported"
        )
        
    new_file = models.UploadedFile(
        user_id=current_user.id,
        file_name=file.filename,
        file_path="",  
        file_size=0    
    )
    db.add(new_file)
    db.commit()
    db.refresh(new_file)
    
    file_extension = os.path.splitext(file.filename)[1]
    local_filename = f"{new_file.id}_{int(datetime.utcnow().timestamp())}{file_extension}"
    local_path = os.path.join(UPLOAD_DIR, local_filename)
    
    try:
        with open(local_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        file_size = os.path.getsize(local_path)
        new_file.file_path = local_path
        new_file.file_size = file_size
        db.commit()
        db.refresh(new_file)
    except Exception as e:
        db.delete(new_file)
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to save file: {str(e)}"
        )
        
    success = rag.index_pdf_file(new_file.id, local_path)
    if not success:
        print(f"RAG warning: File ID {new_file.id} index failed.")
        
    return new_file

@app.get("/api/files", response_model=List[schemas.FileResponse])
def get_uploaded_files(current_user: models.User = Depends(auth.get_current_user), db: Session = Depends(get_db)):
    return db.query(models.UploadedFile).filter(models.UploadedFile.user_id == current_user.id).order_by(models.UploadedFile.upload_date.desc()).all()

@app.delete("/api/files/{file_id}")
def delete_file(file_id: int, current_user: models.User = Depends(auth.get_current_user), db: Session = Depends(get_db)):
    db_file = db.query(models.UploadedFile).filter(
        models.UploadedFile.id == file_id,
        models.UploadedFile.user_id == current_user.id
    ).first()
    if not db_file:
        raise HTTPException(status_code=404, detail="File not found")
        
    try:
        if os.path.exists(db_file.file_path):
            os.remove(db_file.file_path)
        index_path = os.path.join(rag.INDEX_DIR, f"{file_id}.json")
        if os.path.exists(index_path):
            os.remove(index_path)
    except Exception as e:
        print(f"Error deleting local assets: {e}")
        
    db.delete(db_file)
    db.commit()
    return {"message": "File deleted successfully"}

@app.post("/api/files/ask")
def ask_pdf(payload: schemas.RagAsk, current_user: models.User = Depends(auth.get_current_user), db: Session = Depends(get_db)):
    db_file = db.query(models.UploadedFile).filter(
        models.UploadedFile.id == payload.file_id,
        models.UploadedFile.user_id == current_user.id
    ).first()
    
    if not db_file:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Uploaded file not found"
        )
        
    answer = rag.query_pdf_rag(db_file.id, db_file.file_name, payload.question)
    return {"answer": answer}

# ----------------- QUIZ GENERATION ENDPOINTS -----------------

@app.post("/api/quiz/generate", response_model=List[schemas.QuizQuestion])
def get_quiz_questions(payload: schemas.QuizGenerateRequest, current_user: models.User = Depends(auth.get_current_user), db: Session = Depends(get_db)):
    context_text = None
    if payload.file_id:
        db_file = db.query(models.UploadedFile).filter(
            models.UploadedFile.id == payload.file_id,
            models.UploadedFile.user_id == current_user.id
        ).first()
        if db_file:
            context_text = rag.extract_pdf_text(db_file.file_path)
            
    questions = ai.generate_quiz(payload.topic, payload.num_questions, context_text)
    if not questions:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to generate quiz. Check API configurations."
        )
    return questions

@app.post("/api/quiz/record", response_model=schemas.QuizRecordResponse)
def record_quiz_score(payload: schemas.QuizRecordCreate, current_user: models.User = Depends(auth.get_current_user), db: Session = Depends(get_db)):
    record = models.QuizRecord(
        user_id=current_user.id,
        topic=payload.topic,
        score=payload.score,
        total_questions=payload.total_questions
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return record

@app.get("/api/quiz/history", response_model=List[schemas.QuizRecordResponse])
def get_quiz_history(current_user: models.User = Depends(auth.get_current_user), db: Session = Depends(get_db)):
    return db.query(models.QuizRecord).filter(models.QuizRecord.user_id == current_user.id).order_by(models.QuizRecord.taken_at.desc()).all()

# ----------------- SUMMARIZATION & RECOMMENDATIONS -----------------

@app.post("/api/summarize")
def summarize_pdf(payload: schemas.SummarizeRequest, current_user: models.User = Depends(auth.get_current_user), db: Session = Depends(get_db)):
    db_file = db.query(models.UploadedFile).filter(
        models.UploadedFile.id == payload.file_id,
        models.UploadedFile.user_id == current_user.id
    ).first()
    
    if not db_file:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="File not found"
        )
        
    text = rag.extract_pdf_text(db_file.file_path)
    if not text.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Could not extract readable text from this PDF file"
        )
        
    summary = ai.summarize_notes(text, payload.detail_level)
    return {"summary": summary}

@app.get("/api/recommendations")
def get_topic_recommendations(topic: str, current_user: models.User = Depends(auth.get_current_user)):
    if not topic.strip():
        raise HTTPException(status_code=400, detail="Topic string cannot be empty")
    recommendations = ai.recommend_resources(topic)
    return {"topic": topic, "recommendations": recommendations}

# ----------------- STUDY PLANNER ENDPOINTS -----------------

@app.post("/api/planner")
def build_study_plan(payload: schemas.PlannerRequest, current_user: models.User = Depends(auth.get_current_user)):
    plan = ai.generate_study_plan(
        exam_name=payload.exam_name,
        days_left=payload.days_left,
        subjects=payload.subjects,
        hours_per_day=payload.hours_per_day
    )
    return {"study_plan": plan}

@app.get("/api/planner/subjects")
def get_planner_subjects(current_user: models.User = Depends(auth.get_current_user)):
    subjects_file = os.path.join(os.path.dirname(__file__), "data", "hardware_subjects.json")
    try:
        with open(subjects_file, "r") as f:
            data = json.load(f)
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to load subjects dataset: {str(e)}")

@app.post("/api/planner/optimize")
def optimize_study_plan(payload: schemas.PlannerRequest, current_user: models.User = Depends(auth.get_current_user)):
    subjects_file = os.path.join(os.path.dirname(__file__), "data", "hardware_subjects.json")
    try:
        with open(subjects_file, "r") as f:
            all_subjects = json.load(f)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to load subjects dataset: {str(e)}")
        
    selected_subjects = [s for s in all_subjects if s["name"] in payload.subjects]
    
    scheduler = GeneticScheduler(
        selected_subjects=selected_subjects,
        days_left=payload.days_left,
        hours_per_day=payload.hours_per_day
    )
    result = scheduler.run()
    return result
```
<!-- slide -->
### scheduler_ga.py
File Link: [scheduler_ga.py](file:///c:/Users/Karthik/OneDrive/Attachments/Intenship/backend/scheduler_ga.py)

```python
import random
import math

class GeneticScheduler:
    def __init__(self, selected_subjects, days_left, hours_per_day):
        self.subjects = selected_subjects
        self.num_subjects = len(selected_subjects)
        self.D = int(days_left)
        self.H = max(1, min(12, round(hours_per_day)))
        self.total_slots = self.D * self.H
        self.target_hours = self._calculate_target_hours()
        
    def _calculate_target_hours(self):
        total_required = sum(s['required_hours'] for s in self.subjects)
        targets = {}
        for s in self.subjects:
            if total_required > self.total_slots:
                scaled = (s['required_hours'] / total_required) * self.total_slots
                targets[s['name']] = max(1, round(scaled))
            else:
                targets[s['name']] = s['required_hours']
        
        while sum(targets.values()) > self.total_slots:
            max_sub = max(targets, key=targets.get)
            if targets[max_sub] > 1:
                targets[max_sub] -= 1
            else:
                break
        return targets

    def _generate_chromosome(self):
        chromosome = []
        for _ in range(self.total_slots):
            if random.random() < 0.85 and self.num_subjects > 0:
                chromosome.append(random.randint(0, self.num_subjects - 1))
            else:
                chromosome.append(-1)
        return chromosome

    def evaluate_fitness(self, chromosome):
        if self.num_subjects == 0:
            return 0.0
            
        allocated_hours = {s['name']: 0 for s in self.subjects}
        break_count = 0
        for gene in chromosome:
            if gene == -1:
                break_count += 1
            else:
                subj_name = self.subjects[gene]['name']
                allocated_hours[subj_name] += 1
                
        coverage_error = sum(abs(allocated_hours[s['name']] - self.target_hours[s['name']]) for s in self.subjects)
        fitness_coverage = max(0.0, 1.0 - (coverage_error / max(1, self.total_slots)))

        daily_study_hours = []
        for d in range(self.D):
            day_slots = chromosome[d * self.H : (d + 1) * self.H]
            study_hours = sum(1 for slot in day_slots if slot != -1)
            daily_study_hours.append(study_hours)
            
        mean_hours = sum(daily_study_hours) / self.D
        variance = sum((h - mean_hours)**2 for h in daily_study_hours) / self.D
        fitness_balance = max(0.0, 1.0 - (variance / max(1, self.H**2)))

        consecutive_penalty_count = 0
        for d in range(self.D):
            day_slots = chromosome[d * self.H : (d + 1) * self.H]
            if len(day_slots) <= 2:
                continue
            run_length = 1
            for i in range(1, len(day_slots)):
                if day_slots[i] == day_slots[i-1] and day_slots[i] != -1:
                    run_length += 1
                    if run_length > 2:
                        consecutive_penalty_count += 1
                else:
                    run_length = 1
        fitness_consecutive = max(0.0, 1.0 - (consecutive_penalty_count / max(1, self.total_slots)))

        spacing_score_total = 0
        for idx in range(self.num_subjects):
            days_studied = set()
            for d in range(self.D):
                day_slots = chromosome[d * self.H : (d + 1) * self.H]
                if idx in day_slots:
                    days_studied.add(d)
            
            target_spacing = min(3, self.D)
            spacing_score_total += min(len(days_studied), target_spacing) / target_spacing
        fitness_spacing = spacing_score_total / self.num_subjects

        total_fitness = (
            0.40 * fitness_coverage +
            0.20 * fitness_balance +
            0.20 * fitness_consecutive +
            0.20 * fitness_spacing
        )
        return total_fitness

    def tournament_selection(self, population, fitnesses, k=3):
        selected_indices = random.sample(range(len(population)), k)
        best_idx = max(selected_indices, key=lambda idx: fitnesses[idx])
        return population[best_idx]

    def crossover(self, parent1, parent2):
        if len(parent1) <= 1:
            return parent1.copy(), parent2.copy()
        split_point = random.randint(1, len(parent1) - 1)
        child1 = parent1[:split_point] + parent2[split_point:]
        child2 = parent2[:split_point] + parent1[split_point:]
        return child1, child2

    def mutate(self, chromosome, mutation_rate=0.15):
        mutated = chromosome.copy()
        for idx in range(len(mutated)):
            if random.random() < mutation_rate:
                if random.random() < 0.85 and self.num_subjects > 0:
                    mutated[idx] = random.randint(0, self.num_subjects - 1)
                else:
                    mutated[idx] = -1
        return mutated

    def run(self, pop_size=50, generations=100, crossover_rate=0.8, mutation_rate=0.15):
        if self.num_subjects == 0:
            return {
                "schedule": [], "history": [0.0] * generations,
                "metadata": {
                    "generations": generations, "initial_fitness": 0.0, "final_fitness": 0.0,
                    "mutation_rate": mutation_rate, "crossover_rate": crossover_rate
                }
            }

        population = [self._generate_chromosome() for _ in range(pop_size)]
        fitnesses = [self.evaluate_fitness(chrom) for chrom in population]
        initial_best_fitness = max(fitnesses)
        fitness_history = []
        
        for gen in range(generations):
            fitnesses = [self.evaluate_fitness(chrom) for chrom in population]
            best_idx = max(range(len(population)), key=lambda idx: fitnesses[idx])
            best_fitness = fitnesses[best_idx]
            fitness_history.append(best_fitness)
            
            next_pop = []
            sorted_indices = sorted(range(len(population)), key=lambda idx: fitnesses[idx], reverse=True)
            next_pop.append(population[sorted_indices[0]].copy())
            next_pop.append(population[sorted_indices[1]].copy())
            
            while len(next_pop) < pop_size:
                p1 = self.tournament_selection(population, fitnesses)
                p2 = self.tournament_selection(population, fitnesses)
                if random.random() < crossover_rate:
                    c1, c2 = self.crossover(p1, p2)
                else:
                    c1, c2 = p1.copy(), p2.copy()
                c1 = self.mutate(c1, mutation_rate)
                c2 = self.mutate(c2, mutation_rate)
                next_pop.extend([c1, c2])
                
            population = next_pop[:pop_size]

        fitnesses = [self.evaluate_fitness(chrom) for chrom in population]
        best_idx = max(range(len(population)), key=lambda idx: fitnesses[idx])
        best_chromosome = population[best_idx]
        final_best_fitness = fitnesses[best_idx]
        
        schedule_output = self._format_schedule(best_chromosome)
        
        return {
            "schedule": schedule_output,
            "history": fitness_history,
            "metadata": {
                "generations": generations,
                "initial_fitness": round(initial_best_fitness, 4),
                "final_fitness": round(final_best_fitness, 4),
                "mutation_rate": mutation_rate,
                "crossover_rate": crossover_rate
            }
        }

    def _format_schedule(self, chromosome):
        schedule = []
        activities = [
            "Theoretical Study & Conceptual Review",
            "Peripheral Circuit Simulation / Diagram Drafting",
            "Solve Numerical Hardware Problems",
            "Active Recall & Technical Term Quiz",
            "Hardware Safety & Solder QC Analysis",
            "Device Driver Code Implementation",
            "Component Layout & Interconnect Review"
        ]
        
        for d in range(self.D):
            day_schedule = {"day_number": d + 1, "slots": []}
            day_slots = chromosome[d * self.H : (d + 1) * self.H]
            for slot_idx, gene in enumerate(day_slots):
                if gene == -1:
                    day_schedule["slots"].append({
                        "slot_number": slot_idx + 1,
                        "subject": "Self-Study & Revision Break",
                        "category": "Rest & Integration",
                        "activity": "Consolidate previous notes, clear study fatigue, and review system layouts.",
                        "difficulty": 0
                    })
                else:
                    sub = self.subjects[gene]
                    act_seed = (sub['id'] + slot_idx + d) % len(activities)
                    day_schedule["slots"].append({
                        "slot_number": slot_idx + 1,
                        "subject": sub["name"],
                        "category": sub["category"],
                        "activity": activities[act_seed],
                        "difficulty": sub["difficulty"]
                    })
            schedule.append(day_schedule)
        return schedule
```
<!-- slide -->
### hardware_subjects.json
File Link: [hardware_subjects.json](file:///c:/Users/Karthik/OneDrive/Attachments/Intenship/backend/data/hardware_subjects.json)

```json
[
  {
    "id": 1,
    "name": "Desktop & Laptop Logic Architecture",
    "category": "Computer Assembly",
    "difficulty": 5,
    "importance": 5,
    "required_hours": 15
  },
  {
    "id": 2,
    "name": "Keyboard & Mouse Input Peripheral Interfacing",
    "category": "Peripheral Devices",
    "difficulty": 3,
    "importance": 4,
    "required_hours": 10
  },
  {
    "id": 3,
    "name": "Display Panels & Monitor Control Electronics",
    "category": "Peripheral Devices",
    "difficulty": 4,
    "importance": 4,
    "required_hours": 12
  },
  {
    "id": 4,
    "name": "Printers, Scanners & Plotters Mechanical Systems",
    "category": "Peripheral Devices",
    "difficulty": 4,
    "importance": 3,
    "required_hours": 10
  },
  {
    "id": 5,
    "name": "Flash Memory & Hard Drive Storage Media",
    "category": "Storage Devices",
    "difficulty": 5,
    "importance": 4,
    "required_hours": 14
  },
  {
    "id": 6,
    "name": "Embedded Microcontrollers for Device Drivers",
    "category": "Computer Assembly",
    "difficulty": 5,
    "importance": 5,
    "required_hours": 18
  },
  {
    "id": 7,
    "name": "PCB Manufacturing & Solder Quality Control",
    "category": "Quality Assurance",
    "difficulty": 3,
    "importance": 3,
    "required_hours": 8
  },
  {
    "id": 8,
    "name": "Hardware Safety, Grounding & Electromagnetic Compatibility (EMC)",
    "category": "Quality Assurance",
    "difficulty": 3,
    "importance": 4,
    "required_hours": 9
  }
]
```
````

---

## 💻 Frontend Views

````carousel
### Login.jsx
File Link: [Login.jsx](file:///c:/Users/Karthik/OneDrive/Attachments/Intenship/frontend/src/views/Login.jsx)

```javascript
import React, { useState } from 'react';

function Login({ onLogin }) {
  const [isRegister, setIsRegister] = useState(false);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [branch, setBranch] = useState('Computer Science & Engineering');
  const [year, setYear] = useState(2);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Forgot password fields themed around NIC 2620
  const [nicCode, setNicCode] = useState('');
  const [manufacturingUnit, setManufacturingUnit] = useState('Desktop & Laptop Computers');
  const [securityAnswer, setSecurityAnswer] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (isForgotPassword) {
      fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          email,
          new_password: password,
          nic_code: nicCode,
          manufacturing_unit: manufacturingUnit,
          security_answer: securityAnswer
        })
      })
        .then(async (res) => {
          const data = await res.json();
          if (!res.ok) {
            throw new Error(data.detail || 'Password reset failed');
          }
          return data;
        })
        .then((data) => {
          setIsForgotPassword(false);
          setError('Password reset successfully! Please sign in with your new password.');
          setPassword('');
          setNicCode('');
          setSecurityAnswer('');
          setLoading(false);
        })
        .catch((err) => {
          setError(err.message);
          setLoading(false);
        });
      return;
    }

    const endpoint = isRegister ? '/api/auth/register' : '/api/auth/login';
    const bodyData = isRegister 
      ? { name, email, password, branch, year: parseInt(year) }
      : { email, password };

    fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(bodyData)
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.detail || 'Authentication failed');
        }
        return data;
      })
      .then((data) => {
        if (isRegister) {
          setIsRegister(false);
          setError('Account created successfully! Please log in.');
          setLoading(false);
        } else {
          onLogin(data.access_token);
        }
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
      position: 'relative',
      overflow: 'hidden'
    }}>
      <div style={{
        position: 'absolute',
        width: '400px',
        height: '400px',
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(99,102,241,0.2) 0%, transparent 70%)',
        top: '-10%',
        left: '-10%',
        zIndex: 0
      }} />
      <div style={{
        position: 'absolute',
        width: '400px',
        height: '400px',
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(168,85,247,0.15) 0%, transparent 70%)',
        bottom: '-10%',
        right: '-10%',
        zIndex: 0
      }} />

      <div className="glass-panel" style={{
        width: '100%',
        maxWidth: '480px',
        padding: '40px',
        borderRadius: '24px',
        zIndex: 1,
        position: 'relative'
      }}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div className="float-anim" style={{
            fontSize: '48px',
            marginBottom: '12px',
            display: 'inline-block'
          }}>
            {isForgotPassword ? '🔒' : '🎓'}
          </div>
          <h2 style={{ fontSize: '28px', fontWeight: '800' }}>
            {isForgotPassword ? 'Reset Password' : isRegister ? 'Create Account' : 'Welcome Back'}
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginTop: '6px' }}>
            {isForgotPassword 
              ? 'Authorized Hardware Manufacturing Unit Verification (NIC 2620)' 
              : isRegister ? 'Join your Virtual Academic Assistant' : 'Sign in to access your dashboard'}
          </p>
        </div>

        {error && (
          <div style={{
            backgroundColor: error.includes('successfully') ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
            border: `1px solid ${error.includes('successfully') ? 'var(--success)' : 'var(--danger)'}`,
            color: error.includes('successfully') ? '#34d399' : '#f87171',
            padding: '12px 16px',
            borderRadius: '8px',
            marginBottom: '20px',
            fontSize: '14px',
            textAlign: 'center'
          }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {isRegister && (
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', marginBottom: '6px', textTransform: 'uppercase' }}>
                Full Name
              </label>
              <input
                type="text"
                className="input-glass"
                placeholder="E.g. Karthik"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
          )}

          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', marginBottom: '6px', textTransform: 'uppercase' }}>
              Email Address
            </label>
            <input
              type="email"
              className="input-glass"
              placeholder="name@university.edu"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', marginBottom: '6px', textTransform: 'uppercase' }}>
              {isForgotPassword ? 'New Password' : 'Password'}
            </label>
            <input
              type="password"
              className="input-glass"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          {isForgotPassword && (
            <>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', marginBottom: '6px', textTransform: 'uppercase' }}>
                  NIC Code Verification
                </label>
                <input
                  type="text"
                  className="input-glass"
                  placeholder="Enter 4-digit NIC code (e.g. 2620)"
                  value={nicCode}
                  onChange={(e) => setNicCode(e.target.value)}
                  required
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', marginBottom: '6px', textTransform: 'uppercase' }}>
                  Manufacturing Segment
                </label>
                <select
                  className="input-glass"
                  value={manufacturingUnit}
                  onChange={(e) => setManufacturingUnit(e.target.value)}
                  style={{ cursor: 'pointer' }}
                >
                  <option value="Desktop & Laptop Computers">Desktop & Laptop Computers</option>
                  <option value="Storage Devices">Magnetic/Optical Storage Devices</option>
                  <option value="Displays & Monitors">Computer Monitors/Displays</option>
                  <option value="Input Peripherals">Keyboards, Mice & Input Devices</option>
                  <option value="Printers & Scanners">Printers, Scanners & Plotters</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', marginBottom: '6px', textTransform: 'uppercase' }}>
                  Industrial Vertical Security Question:
                  <div style={{ textTransform: 'none', color: '#a855f7', fontWeight: 'bold', marginTop: '2px' }}>
                    What industrial category does NIC Code 2620 correspond to?
                  </div>
                </label>
                <input
                  type="text"
                  className="input-glass"
                  placeholder="E.g., Manufacture of computers and peripheral equipment"
                  value={securityAnswer}
                  onChange={(e) => setSecurityAnswer(e.target.value)}
                  required
                />
              </div>
            </>
          )}

          {isRegister && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', marginBottom: '6px', textTransform: 'uppercase' }}>
                  Branch
                </label>
                <select 
                  className="input-glass"
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                  style={{ cursor: 'pointer' }}
                >
                  <option value="Computer Science & Engineering">CSE</option>
                  <option value="Information Technology">IT</option>
                  <option value="Electronics & Communication">ECE</option>
                  <option value="Electrical Engineering">EE</option>
                  <option value="Mechanical Engineering">ME</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', marginBottom: '6px', textTransform: 'uppercase' }}>
                  Year
                </label>
                <select 
                  className="input-glass"
                  value={year}
                  onChange={(e) => setYear(e.target.value)}
                  style={{ cursor: 'pointer' }}
                >
                  <option value={1}>1st Year</option>
                  <option value={2}>2nd Year</option>
                  <option value={3}>3rd Year</option>
                  <option value={4}>4th Year</option>
                </select>
              </div>
            </div>
          )}

          {!isRegister && !isForgotPassword && (
            <div style={{ textAlign: 'right', marginTop: '-8px' }}>
              <button
                type="button"
                onClick={() => {
                  setIsForgotPassword(true);
                  setError('');
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  fontSize: '12px',
                  cursor: 'pointer',
                  textDecoration: 'underline'
                }}
              >
                Forgot Password?
              </button>
            </div>
          )}

          <button 
            type="submit" 
            className="btn-primary" 
            style={{ marginTop: '12px', padding: '14px' }}
            disabled={loading}
          >
            {loading 
              ? 'Processing...' 
              : isForgotPassword ? 'Reset Password' : isRegister ? 'Create Account' : 'Sign In'}
          </button>
        </form>

        <div style={{
          textAlign: 'center',
          marginTop: '24px',
          paddingTop: '20px',
          borderTop: '1px solid var(--border-glass)',
          fontSize: '14px'
        }}>
          {isForgotPassword ? (
            <>
              <span style={{ color: 'var(--text-muted)' }}>Remember your password? </span>
              <button 
                onClick={() => {
                  setIsForgotPassword(false);
                  setError('');
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--accent)',
                  fontWeight: '600',
                  cursor: 'pointer',
                  textDecoration: 'underline'
                }}
              >
                Sign In
              </button>
            </>
          ) : (
            <>
              <span style={{ color: 'var(--text-muted)' }}>
                {isRegister ? 'Already have an account? ' : "Don't have an account? "}
              </span>
              <button 
                onClick={() => {
                  setIsRegister(!isRegister);
                  setError('');
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--accent)',
                  fontWeight: '600',
                  cursor: 'pointer',
                  textDecoration: 'underline'
                }}
              >
                {isRegister ? 'Sign In' : 'Create One'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default Login;
```
<!-- slide -->
### Planner.jsx
File Link: [Planner.jsx](file:///c:/Users/Karthik/OneDrive/Attachments/Intenship/frontend/src/views/Planner.jsx)

```javascript
import React, { useState, useEffect } from 'react';

function Planner({ user, headers }) {
  const [mode, setMode] = useState('ga');
  const [examName, setExamName] = useState('Hardware Certification Exam');
  const [daysLeft, setDaysLeft] = useState(7);
  const [hoursPerDay, setHoursPerDay] = useState(4.0);
  const [loading, setLoading] = useState(false);
  
  const [subjectInput, setSubjectInput] = useState('');
  const [aiSubjects, setAiSubjects] = useState(['Data Structures & Algorithms', 'Database Management Systems']);
  
  const [curriculumSubjects, setCurriculumSubjects] = useState([]);
  const [selectedCurriculumNames, setSelectedCurriculumNames] = useState([]);
  
  const [aiPlan, setAiPlan] = useState('');
  const [gaResult, setGaResult] = useState(null);

  useEffect(() => {
    fetch('/api/planner/subjects', { headers })
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch subjects');
        return res.json();
      })
      .then(data => {
        setCurriculumSubjects(data);
        setSelectedCurriculumNames(data.map(s => s.name));
      })
      .catch(err => console.error("Error loading curriculum subjects:", err));
  }, []);

  const handleAddAiSubject = (e) => {
    e.preventDefault();
    if (subjectInput.trim() && !aiSubjects.includes(subjectInput.trim())) {
      setAiSubjects([...aiSubjects, subjectInput.trim()]);
      setSubjectInput('');
    }
  };

  const handleRemoveAiSubject = (sub) => {
    setAiSubjects(aiSubjects.filter(s => s !== sub));
  };

  const handleToggleCurriculumSubject = (name) => {
    if (selectedCurriculumNames.includes(name)) {
      setSelectedCurriculumNames(selectedCurriculumNames.filter(n => n !== name));
    } else {
      setSelectedCurriculumNames([...selectedCurriculumNames, name]);
    }
  };

  const handleGenerate = (e) => {
    e.preventDefault();
    if (!examName.trim()) {
      alert("Please enter the exam/goal name.");
      return;
    }

    const currentSubjects = mode === 'ga' ? selectedCurriculumNames : aiSubjects;
    if (currentSubjects.length === 0) {
      alert("Please select or add at least one subject.");
      return;
    }

    setLoading(true);
    setAiPlan('');
    setGaResult(null);

    const endpoint = mode === 'ga' ? '/api/planner/optimize' : '/api/planner';
    
    fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        exam_name: examName,
        days_left: parseInt(daysLeft),
        subjects: currentSubjects,
        hours_per_day: parseFloat(hoursPerDay)
      })
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.detail || 'Optimization failed');
        }
        return data;
      })
      .then((data) => {
        if (mode === 'ga') {
          setGaResult(data);
        } else {
          setAiPlan(data.study_plan);
        }
        setLoading(false);
      })
      .catch((err) => {
        alert("Failed to generate plan: " + err.message);
        setLoading(false);
      });
  };

  const handleCopy = () => {
    const textToCopy = mode === 'ga' ? JSON.stringify(gaResult.schedule, null, 2) : aiPlan;
    navigator.clipboard.writeText(textToCopy);
    alert("Study plan copied to clipboard!");
  };

  const handleDownload = () => {
    const docName = examName.toLowerCase().replace(/\s+/g, '_');
    const element = document.createElement("a");
    let fileContent;
    let extension;
    
    if (mode === 'ga') {
      let md = `# Optimized Study Schedule for ${examName}\n\n`;
      md += `Generated using Genetic Algorithm Optimization (NIC 2620 Vertical)\n`;
      md += `* Days: ${daysLeft} | Daily slots: ${Math.round(hoursPerDay)} hrs\n`;
      md += `* Target Fitness: ${gaResult.metadata.final_fitness} (Initial: ${gaResult.metadata.initial_fitness})\n\n`;
      
      gaResult.schedule.forEach(day => {
        md += `## Day ${day.day_number}\n\n`;
        md += `| Slot | Subject | Category | Activity | Difficulty |\n`;
        md += `|---|---|---|---|---|\n`;
        day.slots.forEach(slot => {
          md += `| ${slot.slot_number} | ${slot.subject} | ${slot.category} | ${slot.activity} | ${slot.difficulty} |\n`;
        });
        md += `\n`;
      });
      fileContent = new Blob([md], { type: 'text/plain' });
      extension = 'md';
    } else {
      fileContent = new Blob([aiPlan], { type: 'text/plain' });
      extension = 'md';
    }
    
    element.href = URL.createObjectURL(fileContent);
    element.download = `${docName}_study_plan.${extension}`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  const formatMarkdown = (text) => {
    if (!text) return '';
    let clean = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    clean = clean.replace(/```(\w*)\n([\s\S]*?)```/gm, '<pre style="background: rgba(0,0,0,0.3); border: 1px solid var(--border-glass); padding: 12px; border-radius: 8px; font-family: monospace; overflow-x: auto; margin: 12px 0; color: #38bdf8;"><code>$2</code></pre>');
    clean = clean.replace(/`([^`]+)`/g, '<code style="background: rgba(255,255,255,0.08); padding: 2px 6px; border-radius: 4px; font-family: monospace; color: #f472b6;">$1</code>');
    clean = clean.replace(/\*\*([^*]+)\*\*/g, '<strong style="color: white; font-weight: 700;">$1</strong>');
    clean = clean.replace(/^### (.*$)/gim, '<h4 style="margin-top: 16px; margin-bottom: 8px; color: var(--accent); font-weight: 700;">$1</h4>');
    clean = clean.replace(/^## (.*$)/gim, '<h3 style="margin-top: 20px; margin-bottom: 8px; color: var(--secondary); font-weight: 700;">$1</h3>');
    clean = clean.replace(/^\> (.*$)/gim, '<blockquote style="border-left: 3px solid var(--primary); background: rgba(99, 102, 241, 0.05); padding: 8px 12px; margin: 12px 0; border-radius: 0 6px 6px 0; font-style: italic;">$1</blockquote>');
    clean = clean.replace(/\n/g, '<br />');
    return clean;
  };

  const getCategoryColor = (category) => {
    switch (category) {
      case 'Computer Assembly': return '#f43f5e';
      case 'Peripheral Devices': return '#3b82f6';
      case 'Storage Devices': return '#10b981';
      case 'Quality Assurance': return '#f59e0b';
      default: return '#a855f7';
    }
  };

  const getChartBars = (history) => {
    if (!history || history.length === 0) return [];
    const step = Math.max(1, Math.floor(history.length / 15));
    const result = [];
    for (let i = 0; i < history.length; i += step) {
      result.push({ generation: i + 1, fitness: history[i] });
    }
    if (result[result.length - 1].generation !== history.length) {
      result.push({ generation: history.length, fitness: history[history.length - 1] });
    }
    return result;
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '350px 1fr', gap: '24px', height: 'calc(100vh - 64px)' }}>
      <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px', overflowY: 'auto' }}>
        <h2 style={{ fontSize: '20px', fontWeight: '800' }}>Study Planner</h2>
        
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', backgroundColor: 'rgba(255,255,255,0.04)', padding: '4px', borderRadius: '10px', border: '1px solid var(--border-glass)' }}>
          <button
            onClick={() => { setMode('ga'); setAiPlan(''); setGaResult(null); }}
            style={{
              padding: '8px', fontSize: '11px', fontWeight: '700', borderRadius: '8px', border: 'none', cursor: 'pointer',
              background: mode === 'ga' ? 'linear-gradient(135deg, #06b6d4, #6366f1)' : 'transparent',
              color: 'white', boxShadow: mode === 'ga' ? 'var(--shadow-neon-cyan)' : 'none', transition: 'all 0.3s ease'
            }}
          >
            🧬 GA Optimizer
          </button>
          <button
            onClick={() => { setMode('ai'); setAiPlan(''); setGaResult(null); }}
            style={{
              padding: '8px', fontSize: '11px', fontWeight: '700', borderRadius: '8px', border: 'none', cursor: 'pointer',
              background: mode === 'ai' ? 'linear-gradient(135deg, #a855f7, #6366f1)' : 'transparent',
              color: 'white', boxShadow: mode === 'ai' ? 'var(--shadow-neon-purple)' : 'none', transition: 'all 0.3s ease'
            }}
          >
            🤖 Gemini Planner
          </button>
        </div>

        <form onSubmit={handleGenerate} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: 'var(--text-muted)', marginBottom: '6px', textTransform: 'uppercase' }}>
              Exam / Goal Name
            </label>
            <input
              type="text" className="input-glass" placeholder="E.g. Hardware Assembly Certification"
              value={examName} onChange={(e) => setExamName(e.target.value)} required
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: 'var(--text-muted)', marginBottom: '6px', textTransform: 'uppercase' }}>
                Days Left
              </label>
              <input
                type="number" min="1" max="90" className="input-glass"
                value={daysLeft} onChange={(e) => setDaysLeft(parseInt(e.target.value))} required
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: 'var(--text-muted)', marginBottom: '6px', textTransform: 'uppercase' }}>
                Hours / Day
              </label>
              <input
                type="number" min="1" max="12" className="input-glass"
                value={hoursPerDay} onChange={(e) => setHoursPerDay(parseFloat(e.target.value))} required
              />
            </div>
          </div>

          {mode === 'ga' ? (
            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: 'var(--text-muted)', marginBottom: '8px', textTransform: 'uppercase' }}>
                Hardware Curriculum Subjects (NIC 2620)
              </label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '250px', overflowY: 'auto', paddingRight: '4px' }}>
                {curriculumSubjects.map(sub => (
                  <div 
                    key={sub.name} onClick={() => handleToggleCurriculumSubject(sub.name)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', borderRadius: '8px',
                      backgroundColor: selectedCurriculumNames.includes(sub.name) ? 'rgba(99, 102, 241, 0.08)' : 'rgba(255,255,255,0.02)',
                      border: `1px solid ${selectedCurriculumNames.includes(sub.name) ? 'rgba(99, 102, 241, 0.3)' : 'var(--border-glass)'}`,
                      cursor: 'pointer', transition: 'all 0.2s ease'
                    }}
                  >
                    <input 
                      type="checkbox" checked={selectedCurriculumNames.includes(sub.name)}
                      onChange={() => {}} style={{ cursor: 'pointer' }}
                    />
                    <div style={{ flexGrow: 1 }}>
                      <div style={{ fontSize: '12px', fontWeight: '600', color: 'white' }}>{sub.name}</div>
                      <div style={{ display: 'flex', gap: '6px', marginTop: '4px', alignItems: 'center' }}>
                        <span style={{ fontSize: '9px', backgroundColor: getCategoryColor(sub.category) + '22', color: getCategoryColor(sub.category), padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold' }}>
                          {sub.category}
                        </span>
                        <span style={{ fontSize: '9px', color: 'var(--text-muted)' }}>
                          ⏱️ {sub.required_hours}h req
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: 'var(--text-muted)', marginBottom: '6px', textTransform: 'uppercase' }}>
                Syllabus Subjects
              </label>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
                <input
                  type="text" className="input-glass" placeholder="E.g. Computer Networks"
                  value={subjectInput} onChange={(e) => setSubjectInput(e.target.value)} style={{ padding: '8px' }}
                />
                <button type="button" onClick={handleAddAiSubject} className="btn-secondary" style={{ padding: '8px 12px' }}>
                  +
                </button>
              </div>
              
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', maxHeight: '120px', overflowY: 'auto' }}>
                {aiSubjects.map(s => (
                  <span key={s} style={{
                    fontSize: '11px', backgroundColor: 'rgba(255,255,255,0.06)', border: '1px solid var(--border-glass)',
                    padding: '4px 8px', borderRadius: '16px', display: 'flex', alignItems: 'center', gap: '6px'
                  }}>
                    {s}
                    <button type="button" onClick={() => handleRemoveAiSubject(s)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontWeight: 'bold' }}>
                      ✕
                    </button>
                  </span>
                ))}
                {aiSubjects.length === 0 && (
                  <span style={{ fontSize: '11px', color: 'var(--danger)', fontStyle: 'italic' }}>
                    No subjects added yet.
                  </span>
                )}
              </div>
            </div>
          )}

          <button 
            type="submit" className="btn-primary" 
            style={{ 
              width: '100%', padding: '12px', marginTop: '8px', 
              background: mode === 'ga' ? 'linear-gradient(135deg, #06b6d4, #6366f1)' : 'linear-gradient(135deg, #a855f7, #6366f1)',
              boxShadow: mode === 'ga' ? 'var(--shadow-neon-cyan)' : 'var(--shadow-neon-purple)'
            }}
            disabled={loading || (mode === 'ga' ? selectedCurriculumNames.length === 0 : aiSubjects.length === 0)}
          >
            {mode === 'ga' ? '🧬 Run Genetic Optimization' : '📅 Generate Gemini Plan'}
          </button>
        </form>
      </div>

      <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
        {loading ? (
          <div style={{
            flexGrow: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px', color: 'var(--text-muted)', textAlign: 'center', gap: '16px'
          }}>
            <div style={{
              width: '60px', height: '60px', border: `5px solid ${mode === 'ga' ? 'rgba(6, 182, 212, 0.1)' : 'rgba(168, 85, 247, 0.1)'}`,
              borderTopColor: mode === 'ga' ? '#06b6d4' : '#a855f7', borderRadius: '50%', animation: 'spin 1s linear infinite'
            }} />
            <p style={{ color: '#e2e8f0', fontSize: '15px', fontFamily: 'Outfit, sans-serif', fontWeight: 'bold' }}>
              {mode === 'ga' 
                ? 'Running Evolutionary Chromosome Selection & Multi-Objective Optimization (Generations: 100)...' 
                : 'Formulating prompts and querying Google Gemini LLM study advisor...'}
            </p>
          </div>
        ) : gaResult || aiPlan ? (
          <>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-glass)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ fontSize: '18px', fontWeight: '800', color: 'white' }}>
                  {mode === 'ga' ? '🧬 Optimized Evolutionary Schedule' : '📅 AI Academic Study Calendar'}
                </h3>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                  Target: {examName} • {daysLeft} Days • {Math.round(hoursPerDay)} Slots/Day
                </p>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={handleCopy} className="btn-secondary" style={{ padding: '8px 14px', fontSize: '12px' }}>
                  📋 Copy Content
                </button>
                <button onClick={handleDownload} className="btn-primary" style={{ padding: '8px 14px', fontSize: '12px' }}>
                  ⬇️ Download Calendar (.md)
                </button>
              </div>
            </div>

            <div style={{ flexGrow: 1, overflowY: 'auto', padding: '24px' }}>
              {mode === 'ga' && gaResult && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                  <div style={{
                    backgroundColor: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-glass)', borderRadius: '16px',
                    padding: '20px', display: 'grid', gridTemplateColumns: '1fr 320px', gap: '24px'
                  }}>
                    <div>
                      <h4 style={{ fontSize: '14px', fontWeight: '800', color: '#06b6d4', textTransform: 'uppercase', marginBottom: '14px', letterSpacing: '0.5px' }}>
                        Optimization Analytics
                      </h4>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                        <div style={{ padding: '12px', backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: '10px', border: '1px solid var(--border-glass)' }}>
                          <span style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Initial Fitness</span>
                          <span style={{ fontSize: '20px', fontWeight: 'bold', color: '#f43f5e' }}>
                            {Math.round(gaResult.metadata.initial_fitness * 100)}%
                          </span>
                        </div>
                        <div style={{ padding: '12px', backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: '10px', border: '1px solid var(--border-glass)' }}>
                          <span style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Final Optimized Fitness</span>
                          <span style={{ fontSize: '20px', fontWeight: 'bold', color: '#10b981' }}>
                            {Math.round(gaResult.metadata.final_fitness * 100)}%
                          </span>
                        </div>
                        <div style={{ padding: '12px', backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: '10px', border: '1px solid var(--border-glass)' }}>
                          <span style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Generations Run</span>
                          <span style={{ fontSize: '20px', fontWeight: 'bold', color: 'white' }}>
                            {gaResult.metadata.generations}
                          </span>
                        </div>
                        <div style={{ padding: '12px', backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: '10px', border: '1px solid var(--border-glass)' }}>
                          <span style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Mutation & Crossover</span>
                          <span style={{ fontSize: '13px', fontWeight: 'bold', color: 'white', display: 'block', marginTop: '6px' }}>
                            Mut: {gaResult.metadata.mutation_rate} | Cross: {gaResult.metadata.crossover_rate}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div>
                      <h4 style={{ fontSize: '11px', fontWeight: '800', color: '#a855f7', textTransform: 'uppercase', marginBottom: '14px', letterSpacing: '0.5px', textAlign: 'center' }}>
                        Fitness Convergence Curve
                      </h4>
                      <div style={{
                        display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', height: '110px',
                        backgroundColor: 'rgba(0,0,0,0.2)', padding: '12px 16px 4px 16px', borderRadius: '12px',
                        border: '1px solid var(--border-glass)', position: 'relative'
                      }}>
                        {getChartBars(gaResult.history).map((bar, idx) => (
                          <div 
                            key={idx} 
                            style={{
                              width: '10px', height: `${Math.max(10, Math.round(bar.fitness * 95))}%`,
                              background: 'linear-gradient(to top, #6366f1, #06b6d4)', borderRadius: '2px',
                              cursor: 'pointer', position: 'relative'
                            }}
                            title={`Gen ${bar.generation}: ${Math.round(bar.fitness * 100)}%`}
                          />
                        ))}
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: 'var(--text-muted)', marginTop: '6px', padding: '0 4px' }}>
                        <span>Gen 1</span>
                        <span>Evolution Progress</span>
                        <span>Gen {gaResult.metadata.generations}</span>
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {gaResult.schedule.map(day => (
                      <div key={day.day_number} className="glass-panel" style={{ padding: '20px', borderRadius: '16px' }}>
                        <h4 style={{ fontSize: '15px', fontWeight: '800', color: 'white', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ display: 'flex', width: '28px', height: '28px', borderRadius: '50%', backgroundColor: 'rgba(99,102,241,0.15)', color: '#818cf8', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 'bold' }}>
                            {day.day_number}
                          </span>
                          Day {day.day_number}
                        </h4>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                          {day.slots.map(slot => (
                            <div 
                              key={slot.slot_number}
                              style={{
                                display: 'grid', gridTemplateColumns: '80px 240px 1fr 120px', gap: '16px', alignItems: 'center',
                                padding: '12px 16px', borderRadius: '10px',
                                backgroundColor: slot.difficulty === 0 ? 'rgba(255,255,255,0.01)' : 'rgba(255,255,255,0.03)',
                                border: slot.difficulty === 0 ? '1px dashed var(--border-glass)' : '1px solid var(--border-glass)',
                                transition: 'transform 0.2s ease',
                              }}
                            >
                              <div style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--text-muted)' }}>
                                Hour Slot {slot.slot_number}
                              </div>

                              <div>
                                <div style={{ fontSize: '13px', fontWeight: '700', color: slot.difficulty === 0 ? 'var(--text-muted)' : 'white' }}>
                                  {slot.subject}
                                </div>
                                <span style={{ 
                                  fontSize: '9px', backgroundColor: getCategoryColor(slot.category) + '15', color: getCategoryColor(slot.category), 
                                  padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold', marginTop: '4px', display: 'inline-block'
                                }}>
                                  {slot.category}
                                </span>
                              </div>

                              <div style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: '1.4' }}>
                                {slot.activity}
                              </div>

                              <div style={{ textAlign: 'right' }}>
                                {slot.difficulty > 0 ? (
                                  <div style={{ display: 'flex', gap: '3px', justifyContent: 'flex-end' }}>
                                    {[...Array(5)].map((_, i) => (
                                      <span key={i} style={{ 
                                        color: i < slot.difficulty ? '#f59e0b' : 'rgba(255,255,255,0.1)', fontSize: '12px' 
                                      }}>
                                        ★
                                      </span>
                                    ))}
                                  </div>
                                ) : (
                                  <span style={{ fontSize: '11px', color: '#10b981', fontWeight: '600' }}>
                                    💤 Rest Slot
                                  </span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {mode === 'ai' && aiPlan && (
                <div className="markdown-content" style={{ lineHeight: '1.6' }}>
                  <div 
                    dangerouslySetInnerHTML={{ __html: formatMarkdown(aiPlan) }} 
                    style={{ color: '#e2e8f0' }}
                  />
                </div>
              )}
            </div>
          </>
        ) : (
          <div style={{
            flexGrow: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px', color: 'var(--text-muted)', textAlign: 'center', gap: '16px'
          }}>
            <span style={{ fontSize: '64px' }}>{mode === 'ga' ? '🧬' : '📅'}</span>
            <div>
              <h3 style={{ color: 'var(--text-main)', marginBottom: '8px' }}>
                {mode === 'ga' ? 'Evolutionary Optimization Engine' : 'AI Study Planner Console'}
              </h3>
              <p style={{ maxWidth: '450px', fontSize: '14px', lineHeight: '1.5' }}>
                {mode === 'ga' 
                  ? 'Select courses from the official NIC 2620 Computer & Peripheral Hardware curriculum, specify daily slots, and run the Genetic Algorithm to optimize a balanced study schedule that converges over 100 generations.'
                  : 'Configure target exam details, add custom subjects list, choose study availability, and let Google Gemini AI build a customized study calendar.'}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default Planner;
```
````

{% endraw %}
