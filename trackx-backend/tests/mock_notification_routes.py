from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import List
from datetime import datetime
import uuid

router = APIRouter()

# In-memory mock notification store
mock_notifications = {}

# Pydantic models to simulate request structure
class UpdateNotificationRequest(BaseModel):
    read: bool

class Notification(BaseModel):
    title: str
    message: str
    type: str
    timestamp: str
    read: bool = False
    id: str = None

@router.post("/notifications/{user_id}")
async def create_notification(user_id: str, title: str, message: str, notification_type: str):
    notif_id = str(uuid.uuid4())
    notification = Notification(
        id=notif_id,
        title=title,
        message=message,
        type=notification_type,
        timestamp=datetime.utcnow().isoformat(),
        read=False
    )
    if user_id not in mock_notifications:
        mock_notifications[user_id] = []
    mock_notifications[user_id].append(notification)
    return {"success": True, "message": "Notification added successfully", "id": notif_id}

@router.get("/{user_id}")
async def get_notifications(user_id: str, page: int = 1, limit: int = 10):
    if user_id not in mock_notifications:
        return {"notifications": [], "total": 0, "page": page, "limit": limit}

    all_notifs = sorted(mock_notifications[user_id], key=lambda x: x.timestamp, reverse=True)
    start = (page - 1) * limit
    end = start + limit
    paginated = all_notifs[start:end]
    return {
        "notifications": [notif.dict() for notif in paginated],
        "total": len(all_notifs),
        "page": page,
        "limit": limit,
    }

@router.patch("/{user_id}/{notification_id}")
async def update_notification_status(user_id: str, notification_id: str, request: UpdateNotificationRequest):
    if user_id not in mock_notifications:
        raise HTTPException(status_code=404, detail="User not found")

    for notif in mock_notifications[user_id]:
        if notif.id == notification_id:
            notif.read = request.read
            return {"success": True, "message": "Notification updated successfully"}

    raise HTTPException(status_code=404, detail="Notification not found")