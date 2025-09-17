# routes/ai_routes.py
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import List
from services.ai_service import generate_briefing_markdown

router = APIRouter()

class BriefingRequest(BaseModel):
    user_id: str = Field(..., description="Caller’s Firebase UID")
    user_role: str = Field("user", description="Role: 'admin' or 'user'")
    case_ids: List[str] = Field(..., min_items=1)

@router.post("/briefings")
async def create_briefing(req: BriefingRequest):
    try:
        md = await generate_briefing_markdown(
            user_id=req.user_id,
            user_role=req.user_role,
            case_ids=req.case_ids
        )
        return {"markdown": md}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
