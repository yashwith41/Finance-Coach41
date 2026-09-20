import os
import json
from datetime import datetime, timedelta, timezone
from typing import Optional, List

from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import func
from pydantic import BaseModel, EmailStr, Field
import bcrypt
import jwt

from google import genai
from google.genai import types
from google.genai.errors import ServerError
from dotenv import load_dotenv

import models
from database import engine, SessionLocal, Base

load_dotenv()

Base.metadata.create_all(bind=engine)

app = FastAPI(title="WealthWise API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

SECRET_KEY = os.getenv("JWT_SECRET", "wealthwise_super_secret_jwt_key_development_only")
ALGORITHM = "HS256"

def get_password_hash(password: str) -> str:
    pwd_bytes = password.encode('utf-8')[:72]
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(pwd_bytes, salt).decode('utf-8')

def verify_password(plain_password: str, hashed_password: str) -> bool:
    pwd_bytes = plain_password.encode('utf-8')[:72]
    return bcrypt.checkpw(pwd_bytes, hashed_password.encode('utf-8'))

def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(days=7)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

class SignupRequest(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    email: EmailStr
    password: str

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

class OnboardRequest(BaseModel):
    user_id: int
    current_balance: float
    monthly_income: float
    payday_date: int

class ChatRequest(BaseModel):
    user_id: int
    user_text: str

class BudgetCreate(BaseModel):
    user_id: int
    category: str
    limit_amount: float

class ExpenseExtraction(BaseModel):
    description: str = Field(description="Short description of the expense or subscription")
    amount: float = Field(description="The monetary amount spent")
    category: str = Field(description="The category name")
    is_recurring: bool = Field(description="True if user mentions this is recurring or a subscription")
    frequency_days: int = Field(description="Frequency in days (e.g. 30, 60). 0 if one-time expense.")

@app.post("/auth/signup")
def signup(payload: SignupRequest, db: Session = Depends(get_db)):
    existing_user = db.query(models.User).filter(models.User.email == payload.email).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, 
            detail="An account with this email already exists."
        )
        
    new_user = models.User(
        first_name=payload.first_name,
        last_name=payload.last_name,
        email=payload.email,
        hashed_password=get_password_hash(payload.password)
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    
    display_name = f"{new_user.first_name or ''} {new_user.last_name or ''}".strip() or new_user.email
    token = create_access_token({"sub": str(new_user.id), "email": new_user.email})
    
    return {
        "status": "success", 
        "token": token, 
        "user": {
            "id": new_user.id, 
            "email": new_user.email, 
            "name": display_name, 
            "is_onboarded": new_user.is_onboarded, 
            "current_balance": new_user.current_balance, 
            "monthly_income": new_user.monthly_income
        }
    }

@app.post("/auth/login")
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.email == payload.email).first()
    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, 
            detail="Invalid email or password."
        )
        
    display_name = f"{user.first_name or ''} {user.last_name or ''}".strip() or user.email
    token = create_access_token({"sub": str(user.id), "email": user.email})
    
    return {
        "status": "success", 
        "token": token, 
        "user": {
            "id": user.id, 
            "email": user.email, 
            "name": display_name, 
            "is_onboarded": user.is_onboarded, 
            "current_balance": user.current_balance, 
            "monthly_income": user.monthly_income
        }
    }

@app.post("/user/onboard")
def complete_onboarding(payload: OnboardRequest, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.id == payload.user_id).first()
    if not user: 
        raise HTTPException(status_code=404, detail="User not found")
        
    user.current_balance = payload.current_balance
    user.monthly_income = payload.monthly_income
    user.payday_date = payload.payday_date
    user.is_onboarded = True
    db.commit()
    db.refresh(user)
    
    display_name = f"{user.first_name or ''} {user.last_name or ''}".strip() or user.email
    
    return {
        "status": "success", 
        "user": {
            "id": user.id, 
            "email": user.email, 
            "name": display_name, 
            "is_onboarded": user.is_onboarded, 
            "current_balance": user.current_balance, 
            "monthly_income": user.monthly_income
        }
    }

@app.post("/chat/log")
def log_expense_via_chat(payload: ChatRequest, db: Session = Depends(get_db)):
    user_budgets = db.query(models.Budget.category).filter(models.Budget.user_id == payload.user_id).all()
    user_categories = [b[0] for b in user_budgets]

    prompt = f"""
    Analyze the user's text and extract the expense details.
    User text: "{payload.user_text}"
    
    Categorization Rules:
    1. Check if the expense logically fits into one of the user's existing categories: {', '.join(user_categories) if user_categories else 'None'}.
    2. If it does not fit, invent a short, highly appropriate standard category name (e.g., 'Health', 'Utilities', 'Shopping').
    3. If the user's text is gibberish, nonsense, or cannot be categorized, strictly use the category name "Uncategorized".
    """

    try:
        response = client.models.generate_content(
            model="gemini-3.6-flash",
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=ExpenseExtraction,
                temperature=0.1,
            ),
        )
    except ServerError:
        return {"status": "error", "message": "The AI is currently busy. Please try again in a few seconds."}
    except Exception as e:
        return {"status": "error", "message": f"Failed to process expense: {str(e)}"}

    ai_data = json.loads(response.text)
    ai_category = ai_data["category"].strip().title()

    # Check if category exists; if not, auto-create a budget limit of 0 so it appears in the UI
    existing_budget = db.query(models.Budget).filter(
        models.Budget.user_id == payload.user_id,
        func.lower(models.Budget.category) == ai_category.lower()
    ).first()

    if not existing_budget:
        new_budget = models.Budget(
            user_id=payload.user_id, 
            category=ai_category, 
            limit_amount=0.0
        )
        db.add(new_budget)
        db.commit()

    reply_message = f"Logged ₹{ai_data['amount']} to {ai_category}."

    if ai_data.get("is_recurring") and ai_data.get("frequency_days", 0) > 0:
        next_due = datetime.now(timezone.utc).date() + timedelta(days=ai_data["frequency_days"])
        new_sub = models.Subscription(
            user_id=payload.user_id,
            description=ai_data["description"],
            amount=ai_data["amount"],
            frequency_days=ai_data["frequency_days"],
            next_due_date=next_due
        )
        db.add(new_sub)
        reply_message = f"Added recurring {ai_data['description']} for ₹{ai_data['amount']} every {ai_data['frequency_days']} days."

    new_tx = models.Transaction(
        user_id=payload.user_id,
        raw_description=ai_data["description"],
        amount=ai_data["amount"],
        category=ai_category,
        date=datetime.now(timezone.utc).date(),
        is_recurring=ai_data.get("is_recurring", False)
    )
    db.add(new_tx)
    db.commit()

    return {"status": "success", "message": reply_message}

@app.post("/user/budget")
def create_budget(payload: BudgetCreate, db: Session = Depends(get_db)):
    existing = db.query(models.Budget).filter(
        models.Budget.user_id == payload.user_id, 
        func.lower(models.Budget.category) == payload.category.lower()
    ).first()
    
    if existing:
        existing.limit_amount = payload.limit_amount
    else:
        new_b = models.Budget(
            user_id=payload.user_id, 
            category=payload.category.title(), 
            limit_amount=payload.limit_amount
        )
        db.add(new_b)
        
    db.commit()
    return {"status": "success"}

@app.get("/user/budgets/{user_id}")
def get_user_budgets(user_id: int, db: Session = Depends(get_db)):
    budgets = db.query(models.Budget).filter(models.Budget.user_id == user_id).all()
    today = datetime.now(timezone.utc).date()
    
    months_data = []
    
    # Generate exactly 5 months of history
    for i in range(5):
        m = today.month - i
        y = today.year
        while m <= 0:
            m += 12
            y -= 1
        start_date = datetime(y, m, 1).date()
        if m == 12:
            end_date = datetime(y + 1, 1, 1).date()
        else:
            end_date = datetime(y, m + 1, 1).date()
            
        month_label = start_date.strftime("%B %Y")
        
        cat_data = []
        for b in budgets:
            txs = db.query(models.Transaction).filter(
                models.Transaction.user_id == user_id,
                models.Transaction.category == b.category,
                models.Transaction.date >= start_date,
                models.Transaction.date < end_date
            ).order_by(models.Transaction.date.desc()).all()
            
            spent = sum(t.amount for t in txs)
            
            cat_data.append({
                "id": b.id,
                "category": b.category,
                "limit_amount": b.limit_amount,
                "spent": spent,
                "transactions": [
                    {
                        "id": t.id, 
                        "description": t.raw_description, 
                        "amount": t.amount, 
                        "date": t.date.strftime("%b %d")
                    } 
                    for t in txs
                ]
            })
            
        months_data.append({
            "month_label": month_label,
            "month_offset": i,
            "categories": cat_data
        })

    return {"status": "success", "months": months_data}

@app.get("/user/dashboard/{user_id}")
def get_user_dashboard(user_id: int, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user: 
        raise HTTPException(status_code=404, detail="User not found")
        
    transactions = db.query(models.Transaction).filter(
        models.Transaction.user_id == user_id
    ).order_by(models.Transaction.date.desc()).limit(50).all()
    
    total_spent = db.query(func.sum(models.Transaction.amount)).filter(
        models.Transaction.user_id == user_id
    ).scalar() or 0.0
    
    current_balance = user.current_balance - total_spent
    
    return {
        "status": "success", 
        "metrics": {
            "total_balance": current_balance, 
            "monthly_income": user.monthly_income, 
            "total_spent": total_spent
        }, 
        "transactions": [
            {
                "id": t.id, 
                "date": t.date.strftime("%b %d") if t.date else "Recent", 
                "description": t.raw_description, 
                "category": t.category, 
                "amount": t.amount
            } 
            for t in transactions
        ]
    }

@app.get("/user/notifications/{user_id}")
def get_notifications(user_id: int, db: Session = Depends(get_db)):
    today = datetime.now(timezone.utc).date()
    seven_days = today + timedelta(days=7)
    
    upcoming_subs = db.query(models.Subscription).filter(
        models.Subscription.user_id == user_id, 
        models.Subscription.next_due_date >= today, 
        models.Subscription.next_due_date <= seven_days
    ).order_by(models.Subscription.next_due_date.asc()).all()
    
    alerts = []
    for sub in upcoming_subs:
        days_left = (sub.next_due_date - today).days
        time_text = "today" if days_left == 0 else f"in {days_left} days" if days_left > 1 else "tomorrow"
        alerts.append({
            "id": sub.id, 
            "message": f"₹{sub.amount} for {sub.description} is due {time_text}."
        })
        
    return {"status": "success", "notifications": alerts}

@app.get("/sync-subscriptions")
def process_auto_billing(db: Session = Depends(get_db)):
    return {"status": "success", "processed": 0}