# routes/reports.py
from fastapi import APIRouter, HTTPException
from models.report_model import ReportGenerationRequest, ReportGenerationResponse
from services.report_service import create_google_doc

router = APIRouter(prefix="/reports", tags=["reports"])

@router.post("/google-doc", response_model=ReportGenerationResponse)
def create_google_doc_route(payload: ReportGenerationRequest):
    """
    Create a Google Doc for a report.
    Note: We pass the Pydantic model directly (no **kwargs).
    """
    try:
        return create_google_doc(payload)  # <-- pass model, not **payload.dict()
    except Exception as e:
        # Surface the error message to the client
        raise HTTPException(status_code=500, detail=str(e))
