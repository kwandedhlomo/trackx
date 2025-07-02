from fastapi import APIRouter, Query, HTTPException, Body, Form, UploadFile, File, Request
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
from firebase.firebase_config import db  # at the top if needed


router = APIRouter()

@router.get("/cases/search")
async def search_cases_route(
    case_name: str = Query(None),
    region: str = Query(None),
    date: str = Query(None)
):
    results = await search_cases(case_name=case_name, region=region, date=date)
    return JSONResponse(content=jsonable_encoder({"cases": results}))

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
async def get_recent_cases(sortBy: str = Query("dateEntered", enum=["dateEntered", "dateOfIncident"])):
    """
    Return the 4 most recent cases based on the selected sort key.
    """
    from services.case_service import fetch_recent_cases
    cases = await fetch_recent_cases(sort_by=sortBy)
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
    
@router.get("/cases/monthly-counts")
async def get_monthly_case_counts():
    counts = await get_case_counts_by_month()
    return JSONResponse(content={"counts": counts})

@router.get("/cases/region-counts")
async def get_region_counts_route():
    data = await get_region_case_counts()
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
        # Step 1: Get the case document by caseNumber
        matching_query = db.collection("cases").where("caseNumber", "==", case_number).stream()
        case_docs = list(matching_query)
        if not case_docs:
            raise HTTPException(status_code=404, detail="Case not found.")

        case_doc = case_docs[0]
        case_doc_id = case_doc.id

        # Step 2: Get the actual allPoints
        raw_points = await fetch_all_points_by_case_number(case_number)
        if not raw_points:
            raise HTTPException(status_code=404, detail="No allPoints found.")

        print("🔎 Checking for saved interpolated points...")
        cached_points = await fetch_interpolated_points(case_doc_id)

        if cached_points:
            print(f"✅ Using {len(cached_points)} cached interpolated points.")
            interpolated_points = cached_points
        else:
            print(f"⏳ Interpolating {len(raw_points)} points...")
            interpolated_points = interpolate_points_with_ors(raw_points)
            await store_interpolated_points(case_doc_id, interpolated_points)

        print(f"🌀 Generating CZML from {len(interpolated_points)} points...")
        czml_data = generate_czml(case_number, interpolated_points)

        return JSONResponse(content=czml_data)

    except Exception as e:
        import traceback
        print("❌ Exception in get_case_czml:")
        traceback.print_exc()
        return JSONResponse(status_code=500, content={"error": str(e)})


#old: 
#@router.get("/cases/last-points")
#async def get_last_case_points():
#    from services.case_service import fetch_last_points_per_case
#    points = await fetch_last_points_per_case()
#    return {"points": points}

# @router.get("/cases/czml/{case_number}")
# async def get_case_czml(case_number: str):
#     from services.case_service import generate_czml, fetch_all_points_by_case_number, interpolate_points_with_ors

#     try:
#         print(f"🔍 Fetching allPoints for case: {case_number}")
#         raw_points = await fetch_all_points_by_case_number(case_number)
#         if not raw_points:
#             raise HTTPException(status_code=404, detail="No allPoints found.")

#         print(f"✅ Retrieved {len(raw_points)} points. Now interpolating...")
#         interpolated_points = interpolate_points_with_ors(raw_points)

#         print(f" Interpolated to {len(interpolated_points)} points. Now generating CZML...")
#         czml_data = generate_czml(case_number, interpolated_points)

#         return JSONResponse(content=czml_data)

    except Exception as e:
        print(f"Error generating CZML: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to generate CZML.")
    

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
#         print("❌ Exception in get_case_czml:")
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
