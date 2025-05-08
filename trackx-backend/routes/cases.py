from fastapi import APIRouter, Query
from services.case_service import search_cases
from fastapi.responses import JSONResponse
from fastapi.encoders import jsonable_encoder

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