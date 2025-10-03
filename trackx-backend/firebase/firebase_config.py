import firebase_admin
from firebase_admin import credentials, firestore
from dotenv import load_dotenv
import os
print("OPENAI_API_KEY:", os.getenv("OPENAI_API_KEY"))

load_dotenv()
# Path to the Firebase Admin SDK JSON file
cred_path = "/Users/shewetarumbwa/Downloads/Trackx/trackx-backend/firebase/firebase-adminsdk.json"

if not firebase_admin._apps:
    cred = credentials.Certificate(cred_path)
    firebase_admin.initialize_app(cred)

db = firestore.client()
