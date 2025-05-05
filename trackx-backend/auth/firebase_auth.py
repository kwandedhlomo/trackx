'''
import firebase_admin
from firebase_admin import credentials
from dotenv import load_dotenv
from fastapi import Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from services.auth_service import verify_firebase_token
import os

# Load environment variables and initialize Firebase
load_dotenv()
cred_path = os.getenv("FIREBASE_CREDENTIALS")

if not firebase_admin._apps:
    cred = credentials.Certificate(cred_path)
    firebase_admin.initialize_app(cred)

# Set up Bearer token scheme for FastAPI
bearer_scheme = HTTPBearer()

# Dependency for protected endpoints
async def verify_token(credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme)):
    id_token = credentials.credentials
    return verify_firebase_token(id_token)
'''