from fastapi import FastAPI, Request, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import os

from routes import auth
from routes import cases

# Load environment variables from .env
load_dotenv()

# Create FastAPI instance
app = FastAPI()

#  Setup CORS to allow frontend to access backend
raw_origins = os.getenv("ALLOWED_ORIGINS", "")
origins = [origin.strip() for origin in raw_origins.split(",") if origin.strip()]
if "*" in origins:
    origins = ["*"]

app.add_middleware(
    CORSMiddleware,
     allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount auth router
app.include_router(auth.router, prefix="/auth")
app.include_router(cases.router)

# Routes
@app.get("/ping")
def ping():
    return {"message": "pong"}

# @app.get("/secure")
# def secure_endpoint(user=Depends(verify_token)):
#     return {"message": f"Welcome, {user.get('email', 'unknown user')}"}

@app.get("/")
def read_root():
    return {"status": "TrackX Backend is running"}
