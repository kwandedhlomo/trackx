from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from services.auth_service import verify_firebase_token
from fastapi.responses import JSONResponse
from models.user_model import UserRegisterRequest
from services.auth_service import register_user

router = APIRouter()
bearer_scheme = HTTPBearer()

@router.post("/verify")
async def verify_token(credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme)):
    try:
        decoded = verify_firebase_token(credentials.credentials)
        return JSONResponse(content={"message": f"Welcome {decoded.get('email', 'user')}"})
    except Exception as e:
        return JSONResponse(status_code=401, content={"error": "Invalid or expired token"})

@router.post("/register")
async def register(
    user_data: UserRegisterRequest,
    authorization: str = Header(None)
):
    try:
        # Get the Bearer token (e.g., "Bearer eyJ...")
        if not authorization or not authorization.startswith("Bearer "):
            raise HTTPException(status_code=401, detail="Missing or invalid token")

        id_token = authorization.split(" ")[1]

        result = await register_user(user_data, id_token)
        return {"message": "User registered successfully", "uid": result}

    except HTTPException as e:
        raise e
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
