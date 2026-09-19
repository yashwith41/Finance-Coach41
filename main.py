from fastapi import FastAPI
import models
from database import engine

models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="AI Finance Coach API")

@app.get("/")
def read_root():
    return {"status": "online", "message": "Database is connected and ready!"}