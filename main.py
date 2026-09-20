import os
import json
from datetime import datetime, timedelta
from typing import Optional, List

from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
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

# Gemini API Client
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

class ExpenseExtraction(BaseModel):
    description: str = Field(description="Short description of the expense or subscription")
    amount: float = Field(description="The monetary amount spent")
    category: str = Field(description="Category from the user list, or 'Uncategorized'")
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
            "name": display_name
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
            "name": display_name
        }
    }


@app.post("/chat/log")
def log_expense_via_chat(user_text: str, db: Session = Depends(get_db)):
    categories = ["Food", "Transport", "Entertainment", "Rent", "Gaming"]

    prompt = f"""
Analyze the user's text and extract the expense details.
User text: "{user_text}"
Allowed categories: {', '.join(categories)}
"""

    try:
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=ExpenseExtraction,
                temperature=0.1,
            ),
        )
    except ServerError:
        return {
            "status": "error",
            "message": "The AI is currently busy due to high traffic. Please try again in a few seconds."
        }
    except Exception as e:
        return {"status": "error", "message": f"Failed to process expense: {str(e)}"}

    ai_data = json.loads(response.text)

    
    if ai_data.get("is_recurring") and ai_data.get("frequency_days", 0) > 0:
        next_due = datetime.now() + timedelta(days=ai_data["frequency_days"])
        new_sub = models.Subscription(
            description=ai_data["description"],
            amount=ai_data["amount"],
            frequency_days=ai_data["frequency_days"],
        )
        db.add(new_sub)
        db.commit()
        return {
            "status": "success",
            "message": f"Added recurring {ai_data['description']} for ₹{ai_data['amount']} every {ai_data['frequency_days']} days."
        }

    
    new_tx = models.Transaction(
        raw_description=ai_data["description"],
        amount=ai_data["amount"],
        category=ai_data["category"],
        date=datetime.now().date()
    )
    db.add(new_tx)
    db.commit()

    return {
        "status": "success",
        "message": f"Logged ₹{ai_data['amount']} to {ai_data['category']}."
    }


@app.get("/sync-subscriptions")
def process_auto_billing(db: Session = Depends(get_db)):
    today = datetime.now()
    due_subs = db.query(models.Subscription).all()

    processed_count = 0
    
    return {"status": "success", "processed": processed_count}