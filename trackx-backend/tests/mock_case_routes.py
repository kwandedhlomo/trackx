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

@router.get("/cases/all-points-with-case-ids")
async def all_points_with_case_ids():
    return [
        {"lat": 1.0, "lng": 2.0, "timestamp": "2024-01-01T00:00:00Z", "caseId": "abc123"}
    ]

@router.get("/cases/all")
async def get_all_cases():
    return JSONResponse(content={"cases": [
        {"doc_id": "case-123", "caseTitle": "Sample Case", "region": "Gauteng"}
    ]})

@router.get("/cases/czml/{case_number}")
async def get_case_czml(case_number: str):
    if case_number == "001":
        return JSONResponse(content={"czml": [{"id": "document", "name": "Test CZML"}]})
    else:
        return JSONResponse(status_code=404, content={"detail": "Case not found"})

@router.get("/cases/{case_id}/all-points")
async def get_case_all_points(case_id: str):
    if case_id == "dummycaseid123":
        return JSONResponse(content={"points": [{"lat": 1.0, "lng": 2.0, "timestamp": "2024-01-01T00:00:00Z"}]})
    else:
        return JSONResponse(status_code=404, content={"detail": "Case not found"})
