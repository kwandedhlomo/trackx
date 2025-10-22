from fastapi import APIRouter, Query, HTTPException, Body, Form, UploadFile, File, Request, FastAPI
from services.case_service import search_cases
from services.case_service import update_case
from services.case_service import delete_case
from services.case_service import get_region_case_counts
from services.case_service import get_case_counts_by_month
from fastapi.responses import JSONResponse
from fastapi.encoders import jsonable_encoder
from models.case_model import CaseCreateRequest, GpsPoint
from services.case_service import create_case  
import json
import csv
import io
from typing import Optional
from firebase.firebase_config import db  
from datetime import datetime
from services.case_service import generate_ai_description
from fastapi.middleware.cors import CORSMiddleware
from firebase_admin import firestore
from services.case_service import add_intro_conclusion  # Import your AI service function
from services.case_service import generate_case_intro, generate_case_conclusion, fetch_annotation_descriptions, add_intro_conclusion
from firebase.firebase_config import db
from google.cloud.firestore_v1 import SERVER_TIMESTAMP
from services.case_service import suggest_text_improvement

db = firestore.client()

router = APIRouter()

@router.post("/cases/{case_id}/ai-intro")
async def ai_intro(case_id: str):
    doc_ref = db.collection("cases").document(case_id)
    doc = doc_ref.get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Case not found")

    case = doc.to_dict() or {}
    intro = await generate_case_intro(case.get("caseTitle", ""), case.get("region", ""), case.get("dateOfIncident", ""))
    # update Firestore (use frontend-friendly keys)
    doc_ref.update({"reportIntro": intro, "updatedAt": SERVER_TIMESTAMP})
    return JSONResponse({"reportIntro": intro})

@router.post("/cases/{case_id}/ai-conclusion")
async def ai_conclusion(case_id: str):
    doc_ref = db.collection("cases").document(case_id)
    doc = doc_ref.get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Case not found")

    case = doc.to_dict() or {}

    # fetch annotations and evidence
    annotation_texts = await fetch_annotation_descriptions(case_id)
    evidence_items = case.get("evidenceItems", [])

    # intro text can come from saved intro or blank
    intro_text = case.get("reportIntro") or case.get("intro") or ""

    # pass both annotations + evidence
    conclusion = await generate_case_conclusion(
        case.get("caseTitle", ""),
        case.get("region", ""),
        intro_text,
        annotation_texts,
        evidence_items
    )

    # update Firestore (frontend-friendly)
    doc_ref.update({
        "reportConclusion": conclusion,
        "updatedAt": SERVER_TIMESTAMP
    })

    return JSONResponse({"reportConclusion": conclusion})

@router.post("/cases/ai-review")
async def ai_review_text(request: dict = Body(...)):
    text = request.get("text", "")
    context_type = request.get("contextType", "general")
    if not text.strip():
        raise HTTPException(status_code=400, detail="No text provided for review")

    try:
        improved = await suggest_text_improvement(text, context_type)
        return JSONResponse({"suggestedText": improved})
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/cases/search")
async def search_cases_route(
    #user_id: Optional[str] = "", 
    user_id: str = "",
    case_name: str = Query("", alias="searchTerm"),
    region: str = "",
    date: str = "",
    status: str = "",
    urgency: str = "",
):
    print(f"Received query parameters: user_id={user_id}, case_name={case_name}, region={region}, date={date}, status={status}, urgency={urgency}")
    
    results = await search_cases(
        case_name=case_name,
        region=region,
        date=date,
        user_id=user_id,
        status=status,
        urgency=urgency,
    )
    return {"cases": results}

@router.post("/cases/create")
async def create_case_route(case_request: CaseCreateRequest):
    """
    Accepts a new case submission with case info + CSV data in JSON.
    """
    try:
        # Call the service to create the case
        new_case_id = await create_case(case_request)
        return JSONResponse(content={"caseId": new_case_id})

    except Exception as e:
        print(f"Error in create_case_route: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/cases/recent")
async def get_recent_cases(
    sortBy: str = Query("dateEntered", enum=["dateEntered", "dateOfIncident"]),
    user_id: str = ""
):
    from services.case_service import fetch_recent_cases
    cases = await fetch_recent_cases(sort_by=sortBy, user_id=user_id)
    return JSONResponse(content={"cases": cases})


@router.put("/cases/update")
async def update_case_route(request: Request):
    data = await request.json()
    success, message = await update_case(data)
    if success:
        return {"success": True}
    else:
        raise HTTPException(status_code=400, detail=message)

@router.delete("/cases/delete/{doc_id}")
async def delete_case_route(doc_id: str):
    success, message = await delete_case(doc_id)
    if success:
        return {"success": True}
    else:
        raise HTTPException(status_code=400, detail=message)
    #
@router.get("/cases/monthly-counts")
async def get_monthly_case_counts(user_id: str = ""):
    print(f"Backend received monthly count request with user_id: {user_id}")
    counts = await get_case_counts_by_month(user_id)
    return JSONResponse(content={"counts": counts})

@router.get("/cases/region-counts")
async def get_region_counts_route(user_id: str = ""):
    print(f"/cases/region-counts called with user_id: {user_id}")
    data = await get_region_case_counts(user_id)
    return JSONResponse(content={"counts": data})

@router.get("/cases/all-points")
async def get_all_case_points():
    from services.case_service import fetch_all_case_points
    points = await fetch_all_case_points()
    return {"points": points}


#new attempt: 
@router.get("/cases/czml/{case_number}")
async def get_case_czml(case_number: str):
    from services.case_service import (
        generate_czml,
        fetch_all_points_by_case_number,
        interpolate_points_with_ors,
        fetch_interpolated_points,
        store_interpolated_points,
    )

    try:
        print(f"🔍 Fetching allPoints for case: {case_number}")
        # Get the case document by caseNumber
        matching_query = db.collection("cases").where("caseNumber", "==", case_number).stream()
        case_docs = list(matching_query)
        if not case_docs:
            raise HTTPException(status_code=404, detail="Case not found.")

        case_doc = case_docs[0]
        case_doc_id = case_doc.id

        # Get the actual allPoints
        raw_points = await fetch_all_points_by_case_number(case_number)
        if not raw_points:
            raise HTTPException(status_code=404, detail="No allPoints found.")

        print("Checking for saved interpolated points...")
        cached_points = await fetch_interpolated_points(case_doc_id)

        if cached_points:
            print(f"Using {len(cached_points)} cached interpolated points.")
            interpolated_points = cached_points
        else:
            print(f"Interpolating {len(raw_points)} points...")
            interpolated_points = interpolate_points_with_ors(raw_points)
            await store_interpolated_points(case_doc_id, interpolated_points)

        print(f"Generating CZML from {len(interpolated_points)} points...")
        czml_data = generate_czml(case_number, interpolated_points)

        return JSONResponse(content=czml_data)

    except Exception as e:
        import traceback
        print("Exception in get_case_czml:")
        traceback.print_exc()
        return JSONResponse(status_code=500, content={"error": str(e)})





# @router.get("/cases/czml/{case_number}")
# async def get_case_czml(case_number: str):
#     from services.case_service import generate_czml, fetch_all_points_by_case_number, interpolate_points_with_ors

#     try:
#         print(f"🔍 Fetching allPoints for case: {case_number}")
#         raw_points = await fetch_all_points_by_case_number(case_number)
#         if not raw_points:
#             raise HTTPException(status_code=404, detail="No allPoints found.")

#         print(f"Retrieved {len(raw_points)} points. Now interpolating...")
#         interpolated_points = interpolate_points_with_ors(raw_points)

#         print(f" Interpolated to {len(interpolated_points)} points. Now generating CZML...")
#         czml_data = generate_czml(case_number, interpolated_points)

#         return JSONResponse(content=czml_data)

    except Exception as e:
        print(f"Error generating CZML: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to generate CZML.")
    
@router.get("/cases/last-points")
async def get_last_case_points():
    from services.case_service import fetch_last_points_per_case
    points = await fetch_last_points_per_case()
    return {"points": points}

    # For the heatmap page: Added by jon
@router.get("/cases/all-points-with-case-ids")
async def get_all_points_with_case_ids():
    from services.case_service import fetch_all_case_points_with_case_ids
    points = await fetch_all_case_points_with_case_ids()
    return {"points": points}

@router.get("/cases/all")
async def get_all_cases():
    try:
        cases_ref = db.collection("cases").stream()
        cases = [{"id": doc.id, **doc.to_dict()} for doc in cases_ref]
        return cases
    except Exception as e:
        return {"error": str(e)}

#     except Exception as e:
#         import traceback
#         print("Exception in get_case_czml:")
#         traceback.print_exc()
#         return JSONResponse(status_code=500, content={"error": str(e)})
######---------------- end

# @router.get("/cases/simulation-progress/{case_id}")
# def simulation_progress(case_id: str):
#     progress = SIMULATION_PROGRESS.get(case_id)
#     if not progress:
#         return {"done": 0, "total": 0, "status": "not_started"}

#     status = "done" if progress["done"] >= progress["total"] else "in_progress"
#     return {**progress, "status": status}
@router.get("/cases/czml/{case_number}")
async def get_case_czml(case_number: str):
    from services.case_service import generate_czml, fetch_all_points_by_case_number

    try:
        points = await fetch_all_points_by_case_number(case_number)
        if not points:
            raise HTTPException(status_code=404, detail="No allPoints found.")

        czml_data = generate_czml(case_number, points)
        return JSONResponse(content=czml_data)

    except Exception as e:
        print(f"Error generating CZML: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to generate CZML.")

@router.get("/cases/{case_id}/all-points")
async def get_case_all_points(case_id: str):
    from services.case_service import fetch_all_points_for_case
    points = await fetch_all_points_for_case(case_id)
    return {"points": points}

@router.post("/cases/{case_id}/points/generate-description")
async def generate_description_route(case_id: str, request: Request):
    """
    Generate an AI description for a GPS point in a case.
    Body expects:
      {
        "lat": <number>,
        "lng": <number>,
        "timestamp": <string ISO or freeform> (optional),
        "status": <string> (optional),
        "snapshot": <dataURL or base64 image> (optional)
      }
    Returns: {"description": "<AI text>"}
    """
    try:
        data = await request.json()
        lat = data.get("lat")
        lng = data.get("lng")
        timestamp = data.get("timestamp") or datetime.utcnow().isoformat()
        status = data.get("status", "")
        snapshot = data.get("snapshot")  # optional (data URL/base64)

        if lat is None or lng is None:
            raise HTTPException(status_code=400, detail="lat and lng required.")

        description = await generate_ai_description(
            lat=lat,
            lng=lng,
            timestamp=timestamp,
            status=status,
            snapshot=snapshot,
        )

        return JSONResponse(content={"description": description})

    except Exception as e:
        print(f"Error generating AI description: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to generate AI description.")
