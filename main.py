from fastapi import FastAPI, Depends
from sqlalchemy.orm import Session
from pydantic import BaseModel
from datetime import date
import models
from database import engine, SessionLocal

models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="AI Finance Coach API")

# Opens and closes the database connection securely
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# Validates the incoming data format
class TransactionCreate(BaseModel):
    amount: float
    date: date
    raw_description: str

@app.get("/")
def read_root():
    return {"status": "online", "message": "Database is connected!"}

# POST: Saves a new transaction to the database
@app.post("/transactions/")
def create_transaction(transaction: TransactionCreate, db: Session = Depends(get_db)):
    new_tx = models.Transaction(
        amount=transaction.amount, 
        date=transaction.date, 
        raw_description=transaction.raw_description
    )
    db.add(new_tx)
    db.commit()
    return {"message": "Transaction saved successfully!"}

# GET: Retrieves all transactions from the database
@app.get("/transactions/")
def read_transactions(db: Session = Depends(get_db)):
    return db.query(models.Transaction).all()