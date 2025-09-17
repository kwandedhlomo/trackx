from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class Notification(BaseModel):
    id: Optional[str] = None  
    title: str
    message: str
    type: str  
    timestamp: datetime
    read: bool

class UpdateNotificationRequest(BaseModel):
    read: bool