from pydantic import BaseModel, Field
from typing import List, Optional, Union, Dict, Any
from datetime import datetime

class GpsPoint(BaseModel):
    latitude: float
    longitude: float
    timestamp: Union[datetime, str] = None  
    speed: Optional[float] = None
    altitude: Optional[float] = None
    heading: Optional[float] = None
    accuracy: Optional[float] = None
    additional_data: Optional[Dict[str, Any]] = None

class CaseCreateRequest(BaseModel):
    case_number: str
    case_title: str
    date_of_incident: str
    region: str
    provinceCode: Optional[str] = None
    provinceName: Optional[str] = None
    districtCode: Optional[str] = None
    districtName: Optional[str] = None
    between: Optional[str] = None
    urgency: str  
    csv_data: List[GpsPoint]  
    all_points: List[GpsPoint] 
    userID: Optional[str] = None
    userIDs: Optional[List[str]] = Field(default_factory=list)
