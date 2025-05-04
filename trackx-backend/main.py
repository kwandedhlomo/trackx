from fastapi import FastAPI, Request, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from auth.firebase_auth import verify_token
import os

# Load environment variables from .env
load_dotenv()

# Create FastAPI instance
app = FastAPI()

#  Setup CORS to allow frontend to access backend
origins = os.getenv("ALLOWED_ORIGINS", "").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routes
@app.get("/ping")
def ping():
    return {"message": "pong"}

@app.get("/secure")
def secure_endpoint(user=Depends(verify_token)):
    return {"message": f"Welcome, {user.get('email', 'unknown user')}"}

@app.get("/")
def read_root():
    return {"status": "TrackX Backend is running"}
