# services/report_service.py
import os
import base64
import io
import datetime
from typing import Dict, Any, List, Optional, Union

from google.oauth2 import service_account
from google.oauth2.credentials import Credentials as UserCredentials
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

from models.report_model import ReportGenerationRequest, ReportGenerationResponse

# --- Config via env ---
SCOPES = [
    "https://www.googleapis.com/auth/documents",
    "https://www.googleapis.com/auth/drive.file",
]
GCP_SA_JSON = os.environ.get("GCP_SA_JSON", "gcp-service-account.json")
REPORTS_DRIVE_FOLDER_ID = os.environ.get("REPORTS_DRIVE_FOLDER_ID")

def _clients(user_access_token: Optional[str]):
    """
    Build Docs/Drive clients.
    - If user_access_token is provided, use it (act as the signed-in user).
    - Else, fall back to service account credentials.
    """
    if user_access_token:
        creds = UserCredentials(token=user_access_token, scopes=SCOPES)
    else:
        creds = service_account.Credentials.from_service_account_file(
            GCP_SA_JSON, scopes=SCOPES
        )
    docs = build("docs", "v1", credentials=creds)
    drive = build("drive", "v3", credentials=creds)
    return docs, drive

def _upload_data_url_to_drive(drive, data_url: str, name: str) -> str:
    """Upload a data URL (data:image/png;base64,...) to Drive; return fileId."""
    header, b64data = data_url.split(",", 1)
    mime = header.split(";")[0].split(":")[1]
    raw = base64.b64decode(b64data)

    metadata: Dict[str, Any] = {"name": name}
    if REPORTS_DRIVE_FOLDER_ID:
        metadata["parents"] = [REPORTS_DRIVE_FOLDER_ID]

    media = io.BytesIO(raw)
    file = drive.files().create(
        body=metadata, media_body=media, media_mime_type=mime, fields="id"
    ).execute()
    file_id = file["id"]

    # Optional: make image fetchable by Docs renderer.
    try:
        drive.permissions().create(
            fileId=file_id,
            body={"role": "reader", "type": "anyone"},
        ).execute()
    except HttpError:
        pass

    return file_id

# ---------- Docs helpers that APPEND to the end ----------
def _append_text(text: str) -> Dict[str, Any]:
    return {"insertText": {"endOfSegmentLocation": {}, "text": text}}

def _style_heading(named_style: str, start: int, end: int) -> Dict[str, Any]:
    return {
        "updateParagraphStyle": {
            "range": {"startIndex": start, "endIndex": end},
            "paragraphStyle": {"namedStyleType": named_style},
            "fields": "namedStyleType",
        }
    }

def _append_image(uri: str, width_pt=240, height_pt=180) -> Dict[str, Any]:
    return {
        "insertInlineImage": {
            "endOfSegmentLocation": {},
            "uri": uri,
            "objectSize": {
                "height": {"magnitude": height_pt, "unit": "PT"},
                "width": {"magnitude": width_pt, "unit": "PT"},
            },
        }
    }

def _coerce_request(req_or_dict: Union[ReportGenerationRequest, Dict[str, Any], None], **kwargs) -> ReportGenerationRequest:
    """
    Accept a Pydantic model, a dict, or kwargs and return a ReportGenerationRequest.
    This makes the service tolerant to route implementations that use **payload.dict().
    """
    if isinstance(req_or_dict, ReportGenerationRequest):
        return req_or_dict
    data: Dict[str, Any] = {}
    if isinstance(req_or_dict, dict):
        data.update(req_or_dict)
    if kwargs:
        data.update(kwargs)
    return ReportGenerationRequest(**data)

def create_google_doc(req: Union[ReportGenerationRequest, Dict[str, Any], None] = None, **kwargs) -> ReportGenerationResponse:
    """
    Create a Google Doc from the request. If user_access_token is provided,
    create the doc in the *user's* Drive; otherwise use the service account.

    Accepts either:
      - create_google_doc(ReportGenerationRequest)
      - create_google_doc(dict)
      - create_google_doc(**payload_dict)
    """
    req = _coerce_request(req, **kwargs)

    docs, drive = _clients(req.user_access_token)

    title = f"TrackX Report - {req.caseNumber} - {req.caseTitle}"
    # Create the Doc
    doc = docs.documents().create(body={"title": title}).execute()
    doc_id = doc["documentId"]

    # Optionally move the doc into a specific folder
    if REPORTS_DRIVE_FOLDER_ID:
        try:
            drive.files().update(
                fileId=doc_id, addParents=REPORTS_DRIVE_FOLDER_ID, fields="id, parents"
            ).execute()
        except HttpError:
            # Folder not accessible to this principal; skip.
            pass

    requests: List[Dict[str, Any]] = []
    cursor = 1  # Docs body starts at index 1

    def add_heading(text: str, style: str):
        nonlocal cursor
        content = (text or "") + "\n"
        requests.append(_append_text(content))
        start = cursor
        end = cursor + len(content)
        requests.append(_style_heading(style, start, end))
        cursor = end

    def add_line(text: str = ""):
        nonlocal cursor
        content = (text or "") + "\n"
        requests.append(_append_text(content))
        cursor += len(content)

    # Header
    add_heading(f"Case Report: {req.caseTitle}", "TITLE")
    add_line(f"Case Number: {req.caseNumber}")
    add_line(f"Date of Incident: {req.dateOfIncident}")
    add_line(f"Region: {req.region}")
    add_line(f"Between: {req.between}")
    add_line()

    # Intro
    if (req.intro or "").strip():
        add_heading("Introduction", "HEADING_1")
        for para in (req.intro or "").splitlines() or [""]:
            add_line(para)
        add_line()

    # Index snapshots by original location index
    snap_by_idx = {s.index: s for s in (req.snapshots or []) if s}

    # Locations using explicit selected indices
    for nth, loc_idx in enumerate(req.selectedIndices, start=1):
        loc = req.locations[loc_idx]
        add_heading(f"Location {nth}", "HEADING_1")

        title_text = (
            (loc.title or "").strip()
            or (loc.address or "").strip()
            or f"Location at {loc.lat:.6f}, {loc.lng:.6f}"
        )
        add_heading(title_text, "HEADING_2")

        add_line(f"Coordinates: {loc.lat:.6f}, {loc.lng:.6f}")
        if loc.timestamp:
            add_line(f"Time: {loc.timestamp}")
        add_line()

        snap = snap_by_idx.get(loc_idx)
        if snap:
            for label in ["mapImage", "streetViewImage"]:
                data_url = getattr(snap, label, None)
                if data_url:
                    file_id = _upload_data_url_to_drive(
                        drive, data_url, f"{req.caseNumber}-{label}-{nth}.png"
                    )
                    requests.append(_append_image(f"https://drive.google.com/uc?id={file_id}"))
                    add_line()

            if snap.description:
                add_heading("Description", "HEADING_2")
                for para in (snap.description or "").splitlines() or [""]:
                    add_line(para)
                add_line()
        else:
            add_line("No snapshot data available for this location.")
            add_line()

    # Conclusion
    if (req.conclusion or "").strip():
        add_heading("Conclusion", "HEADING_1")
        for para in (req.conclusion or "").splitlines() or [""]:
            add_line(para)

    add_line()
    add_line(f"Report generated on {datetime.datetime.now():%Y-%m-%d} by TrackX")

    # Send requests in order
    docs.documents().batchUpdate(documentId=doc_id, body={"requests": requests}).execute()

    # Return link/id
    drive_file = drive.files().get(fileId=doc_id, fields="webViewLink").execute()
    return ReportGenerationResponse(
        documentId=doc_id, webViewLink=drive_file["webViewLink"], title=title
    )
