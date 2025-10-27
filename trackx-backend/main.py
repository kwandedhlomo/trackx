from fastapi import FastAPI, Request, HTTPException, Depends, Query
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import os

from routes import admin
from routes import auth
from routes import cases
from routes import reports
from routes.notifications import router as notifications_router  # Import the notifications router
from routes import derivations
from routes import ai
import base64
import mimetypes
import requests





# Load environment variables from .env
load_dotenv()

# Create FastAPI instance
app = FastAPI()

#  Setup CORS to allow frontend to access backend
raw_origins = os.getenv("ALLOWED_ORIGINS", "")
origins = [origin.strip() for origin in raw_origins.split(",") if origin.strip()]

default_origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "https://trackx-frontend-n3bc.onrender.com",
]

if "*" in origins:
    origins = ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins or default_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount routers
app.include_router(auth.router, prefix="/auth")
app.include_router(cases.router)
app.include_router(admin.admin_router)
app.include_router(notifications_router, prefix="/notifications")  # Add the notifications router
app.include_router(reports.router, prefix="/api")  # → POST /api/reports/google-doc
app.include_router(derivations.router,        tags=["derive"])       # -> POST /derive/cases/{case_id}
app.include_router(ai.router,          prefix="/ai",              tags=["ai"])   


# Routes
@app.get("/ping")
def ping():
    return {"message": "pong"}

# @app.get("/secure")
# def secure_endpoint(user=Depends(verify_token)):
#     return {"message": f"Welcome, {user.get('email', 'unknown user')}"}

@app.get("/")
def read_root():
    return {"status": "TrackX Backend is running"}


# --- add this route ---
@app.get("/api/proxy-image-data-url")
def proxy_image_data_url(url: str = Query(..., description="Public image URL to proxy")):
    """
    Server-side fetch of an image (e.g., Google Static Maps / Street View),
    returned as a data URL string to bypass browser CORS/canvas tainting.
    """
    try:
        r = requests.get(url, timeout=15)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Fetch failed: {e}")

    if r.status_code != 200 or not r.content:
        raise HTTPException(status_code=502, detail=f"Upstream status {r.status_code}")

    # Try to keep real content-type; default to PNG if unknown
    content_type = r.headers.get("Content-Type") or mimetypes.guess_type(url)[0] or "image/png"
    b64 = base64.b64encode(r.content).decode("ascii")
    return {"dataUrl": f"data:{content_type};base64,{b64}"}

