# models/report_model.py
from typing import List, Optional
from pydantic import BaseModel

class Location(BaseModel):
    lat: float
    lng: float
    timestamp: Optional[str] = None
    address: Optional[str] = None
    title: Optional[str] = None

class Snapshot(BaseModel):
    index: int
    mapImage: Optional[str] = None
    streetViewImage: Optional[str] = None
    description: Optional[str] = None

class ReportGenerationRequest(BaseModel):
    # Case meta
    caseNumber: str
    caseTitle: str
    dateOfIncident: str
    region: str
    between: Optional[str] = "Not specified"

    # Narrative
    intro: Optional[str] = ""
    conclusion: Optional[str] = ""

    # Content
    locations: List[Location]
    selectedIndices: List[int]
    snapshots: List[Snapshot] = []

    # NEW: if present, use OAuth access token to call Docs/Drive as the user.
    # If omitted/None, we fall back to the service account.
    user_access_token: Optional[str] = None

class ReportGenerationResponse(BaseModel):
    documentId: str
    webViewLink: str
    title: str
