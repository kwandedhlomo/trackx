from fastapi import APIRouter, Query, Request, HTTPException
from services.case_service import search_cases
from services.case_service import update_case
from services.case_service import delete_case
from fastapi.responses import JSONResponse
from fastapi.encoders import jsonable_encoder

router = APIRouter()

@router.get("/cases/search")
async def search_cases_route(
    case_name: str = Query(None),
    region: str = Query(None),
    date: str = Query(None)
):
    results = await search_cases(case_name=case_name, region=region, date=date)
    return JSONResponse(content=jsonable_encoder({"cases": results}))


@router.put("/cases/update")
async def update_case_route(request: Request):
    payload = await request.json()
    success, message = await update_case(payload)
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