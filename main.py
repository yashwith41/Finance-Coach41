from fastapi import FastAPI, Depends
from sqlalchemy.orm import Session
from pydantic import BaseModel
from datetime import date
import models
import analyzer
from database import engine, SessionLocal

models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="AI Finance Coach API")

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