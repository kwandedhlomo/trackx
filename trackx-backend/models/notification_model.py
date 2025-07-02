from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class Notification(BaseModel):
    id: Optional[str] = None  # Firestore document ID
    title: str
    message: str
    type: str  # e.g., "case-update", "system"
    timestamp: datetime
    read: bool

class UpdateNotificationRequest(BaseModel):
    read: bool