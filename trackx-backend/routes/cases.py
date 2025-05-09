from fastapi import APIRouter, Query, HTTPException, Body, Form, UploadFile, File
from services.case_service import search_cases
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
    name: str = Query(None),
    region: str = Query(None),
    date: str = Query(None)
):
    """
    Accepts optional search filters and returns matching cases.
    """
    results = await search_cases(case_name=name, region=region, date=date)
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