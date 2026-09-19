import os
from dotenv import load_dotenv
import google.generativeai as genai
from google.genai.errors import ServerError

genai.configure(api_key=os.getenv("GEMINI_API_KEY"))
model = genai.GenerativeModel("gemini-1.5-flash")

load_dotenv()
import json
from datetime import datetime, timedelta
from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field
from google import genai
from google.genai import types

from database import engine, get_db
import models


models.Base.metadata.create_all(bind=engine)

app = FastAPI()


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))


class ExpenseExtraction(BaseModel):
    description: str = Field(description="Short description of the expense or subscription")
    amount: float = Field(description="The monetary amount spent")
    category: str = Field(description="Category from the user list, or 'Uncategorized'")
    is_recurring: bool = Field(description="True if user mentions this is recurring or a subscription")
    frequency_days: int = Field(description="Frequency in days (e.g. 30, 60). 0 if one-time expense.")


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
            model="gemini-3.6-flash",
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=ExpenseExtraction,
                temperature=0.1,
            ),
        )
    except ServerError:
        return {"status": "error", "message": "The AI is currently busy due to high traffic. Please try again in a few seconds."}
    
    ai_data = json.loads(response.text)
    
   
    if ai_data.get("is_recurring") and ai_data.get("frequency_days", 0) > 0:
        next_due = datetime.now() + timedelta(days=ai_data["frequency_days"])
        new_sub = models.Subscription(
            description=ai_data["description"],
            amount=ai_data["amount"],
            frequency_days=ai_data["frequency_days"],
            next_due_date=next_due
        )
        db.add(new_sub)
        db.commit()
        return {"status": "success", "message": f"Added recurring {ai_data['description']} for ₹{ai_data['amount']} every {ai_data['frequency_days']} days."}
    
  
    else:
        new_tx = models.Transaction(
            raw_description=ai_data["description"], 
            amount=ai_data["amount"],
            category=ai_data["category"],
            date=datetime.now().date() 
        )
        db.add(new_tx)
        db.commit()
        return {"status": "success", "message": f"Logged ₹{ai_data['amount']} to {ai_data['category']}."}
    
    

@app.get("/sync-subscriptions")
def process_auto_billing(db: Session = Depends(get_db)):
    today = datetime.now()
    due_subs = db.query(models.Subscription).filter(models.Subscription.next_due_date <= today).all()
    
    processed_count = 0
    for sub in due_subs:
        new_tx = models.Transaction(
            raw_description=f"Auto-bill: {sub.description}", 
            amount=sub.amount,
            category="Subscription",
            date=today.date() 
        )
        db.add(new_tx)
        sub.next_due_date = today + timedelta(days=sub.frequency_days)
        processed_count += 1
        
    db.commit()
    return {"message": f"Processed {processed_count} automated charges."}