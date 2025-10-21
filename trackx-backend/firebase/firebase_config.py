# trackx-backend/firebase/firebase_config.py
import os, json
from pathlib import Path
from dotenv import load_dotenv
import firebase_admin
from firebase_admin import credentials, firestore

load_dotenv()  # loads trackx-backend/.env if present

# You already have this in .env (path like "./firebase/firebase-adminsdk.json")
CRED_PATH_ENV = os.getenv("FIREBASE_CREDENTIALS")  # existing var
# Optional CI-friendly: whole JSON as one env var (GitHub Actions Secret)
CRED_JSON_ENV = os.getenv("FIREBASE_SERVICE_ACCOUNT_JSON")

BASE_DIR = Path(__file__).resolve().parent  # .../trackx-backend/firebase

def _load_credentials():
    # Option B: inline JSON (preferred for CI)
    if CRED_JSON_ENV:
        data = json.loads(CRED_JSON_ENV.replace("\\n", "\n"))
        return credentials.Certificate(data)

    # Option A: path from FIREBASE_CREDENTIALS (your current .env)
    if CRED_PATH_ENV:
        p = Path(CRED_PATH_ENV)
        if not p.is_absolute():
            p = (BASE_DIR / p).resolve()
        if not p.exists():
            raise FileNotFoundError(f"Service account file not found: {p}")
        return credentials.Certificate(str(p))

    # Fallback: file next to this module
    fallback = BASE_DIR / "firebase-adminsdk.json"
    if fallback.exists():
        return credentials.Certificate(str(fallback))

    raise RuntimeError(
        "Firebase credentials not found. Set FIREBASE_SERVICE_ACCOUNT_JSON "
        "or FIREBASE_CREDENTIALS (path), or place firebase-adminsdk.json next to firebase_config.py."
    )

if not firebase_admin._apps:
    cred = _load_credentials()
    firebase_admin.initialize_app(cred)

db = firestore.client()
