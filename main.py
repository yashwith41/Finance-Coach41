from fastapi import FastAPI, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func 
from pydantic import BaseModel
from datetime import date
import models
import analyzer
from database import engine, SessionLocal
from fastapi.middleware.cors import CORSMiddleware

models.Base.metadata.create_all(bind=engine)



app = FastAPI(title="AI Finance Coach API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all origins during local development
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

class TransactionCreate(BaseModel):
    amount: float
    date: date
    raw_description: str

@app.get("/")
def read_root():
    return {"status": "online", "message": "Database is connected!"}

@app.post("/transactions/")
def create_transaction(transaction: TransactionCreate, db: Session = Depends(get_db)):
  
    detected_category = analyzer.categorize_transaction(transaction.raw_description)

    new_tx = models.Transaction(
        amount=transaction.amount, 
        date=transaction.date, 
        raw_description=transaction.raw_description,
        category=detected_category 
    )
    db.add(new_tx)
    db.commit()
    return {"message": f"Transaction saved as {detected_category}!"}

@app.get("/transactions/")
def read_transactions(db: Session = Depends(get_db)):
    return db.query(models.Transaction).all()

@app.get("/summary/")
def get_financial_summary(db: Session = Depends(get_db)):
    # This asks the database to group transactions by category and add up the amounts
    results = db.query(
        models.Transaction.category, 
        func.sum(models.Transaction.amount).label("total")
    ).group_by(models.Transaction.category).all()
    
    # Format the results into a clean dictionary for the frontend
    summary_data = {row.category: row.total for row in results}
    
    return {
        "status": "success",
        "spending_by_category": summary_data
    }
@app.get("/recurring/")
def get_recurring_subscriptions(db: Session = Depends(get_db)):
    transactions = db.query(models.Transaction).all()
    
    # Convert the SQLAlchemy database objects into standard Python dictionaries
    tx_list = [
        {
            "raw_description": t.raw_description,
            "amount": t.amount,
            "date": t.date
        }
        for t in transactions
    ]
    
    # Pass the data to your Pandas engine
    recurring_items = analyzer.detect_recurring_expenses(tx_list)
    
    return {
        "status": "success",
        "recurring_subscriptions": recurring_items
    }
@app.get("/coach/insight/")
def get_coach_insight(db: Session = Depends(get_db)):
    # Get total spending per category
    results = db.query(
        models.Transaction.category, 
        func.sum(models.Transaction.amount).label("total")
    ).group_by(models.Transaction.category).all()
    
    if not results:
        return {"insight": "Welcome! Log a few more transactions so I can analyze your spending habits."}
    
    # Find the category where they spent the most money
    highest_spend = max(results, key=lambda x: x.total)
    
    # Generate the coaching tip
    if highest_spend.category == "Entertainment":
        tip = f"You've spent ${highest_spend.total:.2f} on Entertainment. Consider reviewing your subscriptions to see if you can cut back."
    elif highest_spend.category == "Dining":
        tip = f"Dining out is your biggest expense at ${highest_spend.total:.2f}. Try meal prepping for a few days next week to save money!"
    elif highest_spend.category == "Transport":
        tip = f"You've spent ${highest_spend.total:.2f} on Transit. If feasible, look into monthly passes or carpooling to reduce this."
    else:
        tip = f"Your highest spending category is {highest_spend.category} (${highest_spend.total:.2f}). Consider setting a strict budget limit here next month to boost your savings."
        
    return {"insight": tip}