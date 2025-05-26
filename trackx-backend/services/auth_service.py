from firebase_admin import auth
from firebase_admin.auth import EmailAlreadyExistsError
from firebase.firebase_config import db
from datetime import datetime
from fastapi import HTTPException
from models.user_model import UserRegisterRequest
def verify_firebase_token(id_token: str):
    try:
        decoded_token = auth.verify_id_token(id_token)
        return decoded_token  
    except Exception as e:
        raise HTTPException(status_code=401, detail="Invalid or expired token")


async def register_user(user: UserRegisterRequest, id_token: str):
    decoded_token = verify_firebase_token(id_token)
    uid = decoded_token["uid"]

    user_doc = {
        "firstName": user.first_name,
        "surname": user.surname,
        "email": user.email,
        "idNumber": user.id_number,
        "investigatorId": user.investigator_id,
        "dob": user.dob,
        "createdAt": datetime.utcnow().isoformat()
    }

    try:
        db.collection("users").document(uid).set(user_doc)
        return uid
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save user data: {str(e)}")