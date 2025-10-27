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
    province_code: Optional[str] = Field(default=None, alias="provinceCode")
    province_name: Optional[str] = Field(default=None, alias="provinceName")
    district_code: Optional[str] = Field(default=None, alias="districtCode")
    district_name: Optional[str] = Field(default=None, alias="districtName")
    between: Optional[str] = None
    urgency: str  
    csv_data: List[GpsPoint]  
    all_points: List[GpsPoint]
    user_id: Optional[str] = Field(default=None, alias="userId")
    user_ids: Optional[List[str]] = Field(default_factory=list, alias="userIds")
    legacy_user_id: Optional[str] = Field(default=None, alias="userID")
    legacy_user_ids: Optional[List[str]] = Field(default_factory=list, alias="userIDs")

    class Config:
        allow_population_by_field_name = True
