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
def chat_log(payload: ChatRequest, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.id == payload.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    categories = db.query(models.Transaction.category).filter(
        models.Transaction.user_id == payload.user_id
    ).distinct().all()
    user_categories = [c[0] for c in categories]

    prompt = f"""
    Analyze the user's text and determine their intent.
    User text: "{payload.user_text}"
    Existing Categories: {', '.join(user_categories) if user_categories else 'None'}

    Return a JSON response with:
    1. "action": either "log_expense" or "set_budget"
    2. If "log_expense": extract "amount" (float), "description" (string), and "category" (string).
    3. If "set_budget": extract "budget_amount" (float).
    """

    try:
        response = client.models.generate_content(
            model="gemini-3.6-flash",
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json"
            )
        )
        
        # Clean markdown code blocks if present
        raw_text = response.text.strip()
        if raw_text.startswith("```json"):
            raw_text = raw_text[7:]
        if raw_text.startswith("```"):
            raw_text = raw_text[3:]
        if raw_text.endswith("```"):
            raw_text = raw_text[:-3]
            
        result = json.loads(raw_text.strip())
        action = result.get("action")

        # Handle Budget Setting / Updating via Chat
        if action == "set_budget":
            budget_amount = float(result.get("budget_amount", 0))
            
            overall_budget = db.query(models.Budget).filter(
                models.Budget.user_id == payload.user_id,
                models.Budget.category == "_OVERALL_BUDGET_"
            ).first()

            if overall_budget:
                overall_budget.limit_amount = budget_amount
                msg = f"Your overall monthly budget has been successfully updated to ₹{budget_amount:,.2f}!"
            else:
                new_budget = models.Budget(
                    user_id=payload.user_id,
                    category="_OVERALL_BUDGET_",
                    limit_amount=budget_amount
                )
                db.add(new_budget)
                msg = f"Your overall monthly budget has been set to ₹{budget_amount:,.2f}!"
            
            db.commit()
            return {"status": "success", "message": msg}

        # Handle Standard Expense Logging
        elif action == "log_expense":
            amount = float(result.get("amount", 0))
            description = result.get("description", "Unknown Expense")
            category = result.get("category", "Uncategorized").title()

            new_tx = models.Transaction(
                user_id=payload.user_id,
                amount=amount,
                raw_description=description,
                category=category,
                date=datetime.now(timezone.utc).date()
            )
            db.add(new_tx)
            db.commit()

            return {
                "status": "success", 
                "message": f"Logged ₹{amount:,.2f} for '{description}' under {category}."
            }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/user/budget")
def create_budget(payload: BudgetCreate, db: Session = Depends(get_db)):
    target_category = "_OVERALL_BUDGET_" if payload.category == "__OVERALL__" else payload.category.title()
    
    existing = db.query(models.Budget).filter(
        models.Budget.user_id == payload.user_id, 
        func.lower(models.Budget.category) == target_category.lower()
    ).first()
    
    if existing:
        existing.limit_amount = payload.limit_amount
    else:
        new_b = models.Budget(
            user_id=payload.user_id, 
            category=target_category, 
            limit_amount=payload.limit_amount
        )
        db.add(new_b)
        
    db.commit()
    return {"status": "success"}

@app.post("/user/budget")
def create_budget(payload: BudgetCreate, db: Session = Depends(get_db)):
    
    target_category = "_OVERALL_BUDGET_" if payload.category == "__OVERALL__" else payload.category.title()
    
    existing = db.query(models.Budget).filter(
        models.Budget.user_id == payload.user_id, 
        func.lower(models.Budget.category) == target_category.lower()
    ).first()
    
    if existing:
        existing.limit_amount = payload.limit_amount
    else:
        new_b = models.Budget(
            user_id=payload.user_id, 
            category=target_category, 
            limit_amount=payload.limit_amount
        )
        db.add(new_b)
        
    db.commit()
    return {"status": "success"}

@app.get("/user/budgets/{user_id}")
def get_user_budgets(user_id: int, db: Session = Depends(get_db)):
    
    budgets = db.query(models.Budget).filter(
        models.Budget.user_id == user_id,
        models.Budget.category != "_OVERALL_BUDGET_",
        models.Budget.category != "__Overall__"
    ).all()

    overall_budget_obj = db.query(models.Budget).filter(
        models.Budget.user_id == user_id,
        models.Budget.category == "_OVERALL_BUDGET_"
    ).first()
    
    overall_limit = overall_budget_obj.limit_amount if overall_budget_obj else 0.0

    today = datetime.now(timezone.utc).date()
    months_data = []
    
    
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
        month_total_spent = 0.0

        for b in budgets:
            txs = db.query(models.Transaction).filter(
                models.Transaction.user_id == user_id,
                models.Transaction.category == b.category,
                models.Transaction.date >= start_date,
                models.Transaction.date < end_date
            ).order_by(models.Transaction.date.desc()).all()
            
            spent = sum(t.amount for t in txs)
            month_total_spent += spent
            
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
            "overall_limit": overall_limit,
            "overall_spent": month_total_spent,
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

@app.get("/user/ai-advice/{user_id}")
def get_ai_financial_advice(user_id: int, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    today = datetime.now(timezone.utc).date()
    start_of_month = today.replace(day=1)

    txs = db.query(models.Transaction).filter(
        models.Transaction.user_id == user_id,
        models.Transaction.date >= start_of_month
    ).all()

    total_spent = sum(t.amount for t in txs)
    
    category_breakdown = {}
    for t in txs:
        category_breakdown[t.category] = category_breakdown.get(t.category, 0) + t.amount

    prompt = f"""
    You are WealthWise AI, a friendly and sharp personal finance advisor.
    User's Monthly Income: ₹{user.monthly_income}
    Total Spent This Month: ₹{total_spent}
    Spending Breakdown by Category: {json.dumps(category_breakdown)}

    Provide a short, direct, and encouraging financial advice report (max 3 sentences). 
    Highlight if any category is taking up too much of their income and give a specific tip to help them save.
    """

    try:
        response = client.models.generate_content(
            model="gemini-3.6-flash",
            contents=prompt,
            config=types.GenerateContentConfig(temperature=0.7),
        )
        advice = response.text
    except Exception as e:
        advice = "Keep tracking your expenses consistently to unlock deeper monthly insights!"

    return {"status": "success", "advice": advice}

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