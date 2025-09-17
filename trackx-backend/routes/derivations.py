# routes/derivations_routes.py
from fastapi import APIRouter, HTTPException
from services.derivations_service import compute_and_store_rollup

router = APIRouter(prefix="/derive", tags=["Derivations"])

@router.post("/cases/{case_id}")
def derive_case(case_id: str):
    try:
        out = compute_and_store_rollup(case_id)
        if not out.get("success"):
            raise HTTPException(status_code=400, detail=out.get("message","failed"))
        return out
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
