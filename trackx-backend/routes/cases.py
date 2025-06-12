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
async def get_recent_cases():
    """
    Return the 4 most recently created cases, ordered by createdAt.
    """
    from services.case_service import fetch_recent_cases
    cases = await fetch_recent_cases()
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

#@router.get("/cases/last-points")
#async def get_last_case_points():
#    from services.case_service import fetch_last_points_per_case
#    points = await fetch_last_points_per_case()
#    return {"points": points}

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