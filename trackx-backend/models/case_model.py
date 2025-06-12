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
    between: Optional[str] = None
    csv_data: List[GpsPoint]  
    all_points: List[GpsPoint] 
