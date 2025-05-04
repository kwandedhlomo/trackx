import firebase_admin
from firebase_admin import credentials, auth
from dotenv import load_dotenv
from fastapi import HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import os

#  Load .env and Firebase
load_dotenv()
cred_path = os.getenv("FIREBASE_CREDENTIALS")

if not firebase_admin._apps:
    cred = credentials.Certificate(cred_path)
    firebase_admin.initialize_app(cred)

#  Set up bearer token scheme for FastAPI
bearer_scheme = HTTPBearer()

#  Dependency for protected endpoints
async def verify_token(credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme)):
    try:
        id_token = credentials.credentials
        decoded_token = auth.verify_id_token(id_token)
        return decoded_token
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
