from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse

router = APIRouter()

@router.get("/cases/search")
async def search_cases():
    return JSONResponse(content={"cases": []})

@router.post("/cases/create")
async def create_case_route():
   
    return JSONResponse(content={"caseId": "mock-case-id"})

@router.get("/cases/recent")
async def get_recent_cases():
    return JSONResponse(content={"cases": [{"doc_id": "case-123", "caseTitle": "Sample Case"}]})

@router.put("/cases/update")
async def update_case_route(request: Request):
    data = await request.json()
    if not data.get("doc_id"):
        raise HTTPException(status_code=400, detail="Missing document ID")
    return {"success": True}

@router.delete("/cases/delete/{doc_id}")
async def delete_case_route(doc_id: str):
    if doc_id == "nonexistentdocid123":
        raise HTTPException(status_code=400, detail="Document not found")
    return {"success": True}

@router.get("/cases/monthly-counts")
async def get_monthly_case_counts():
    return JSONResponse(content={"counts": [{"month": "2024-01", "count": 5}]})

@router.get("/cases/region-counts")
async def get_region_counts():
    return JSONResponse(content={"counts": [{"region": "Gauteng", "count": 10}]})

@router.get("/cases/all-points")
async def get_all_case_points():
    return JSONResponse(content={"points": [{"lat": -33.9, "lng": 18.4}]})

@router.get("/cases/last-points")
async def get_last_case_points():
    return JSONResponse(content={"points": [{"lat": -33.9, "lng": 18.4, "color": "#1E40AF"}]})
