from firebase.firebase_config import db
from fastapi import HTTPException

def update_email(user_id: str, new_email: str):
    user_ref = db.collection("users").document(user_id)
    if not user_ref.get().exists:
        raise HTTPException(status_code=404, detail="User not found")
    user_ref.update({"email": new_email})
    return True
