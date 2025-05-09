from firebase.firebase_config import db
from google.cloud.firestore_v1 import DocumentReference
from google.api_core.datetime_helpers import DatetimeWithNanoseconds
from models.case_model import CaseCreateRequest
import uuid
from google.cloud import firestore
import logging

logger = logging.getLogger(__name__)

def sanitize_firestore_data(data):
    clean = {}
    for key, value in data.items():
        if isinstance(value, (str, int, float, bool)) or value is None:
            clean[key] = value
        elif isinstance(value, DatetimeWithNanoseconds):
            clean[key] = value.isoformat()
        elif isinstance(value, DocumentReference):
            clean[key] = value.id
        else:
            clean[key] = str(value)
    return clean

async def search_cases(case_name: str = "", region: str = "", date: str = ""):
    cases_ref = db.collection("cases")
    query = cases_ref

    if case_name:
        query = query.where("caseTitle", "==", case_name)
    if region:
        query = query.where("region", "==", region)
    if date:
        query = query.where("dateOfIncident", "==", date)

    documents = list(query.stream())

    results = []
    for doc in documents:
        data = doc.to_dict()
        sanitized = sanitize_firestore_data(data)
        print(f"Sanitized result for document {doc.id}:\n{sanitized}")
        results.append(sanitized)

    return results

async def create_case(payload: CaseCreateRequest) -> str:
    """Create a new case with optional GPS points"""
    try:
        case_id = str(uuid.uuid4())

        # Save to Firestore "cases" collection
        case_data = {
            "caseNumber": payload.case_number,
            "caseTitle": payload.case_title,
            "dateOfIncident": payload.date_of_incident,
            "region": payload.region,
            "between": payload.between,
            "createdAt": firestore.SERVER_TIMESTAMP,
            "status": "New"
        }

        # Create case document
        db.collection("cases").document(case_id).set(case_data)
        logger.info(f"Created case document with ID: {case_id}")

        if not payload.csv_data:
            return case_id

        # Save csv_data points under "points" subcollection
        batch = db.batch()
        points_ref = db.collection("cases").document(case_id).collection("points")

        for point in payload.csv_data: 
            point_doc = points_ref.document()
            batch.set(point_doc, {
                 "lat": point.latitude,      
                 "lng": point.longitude,    
                 "timestamp": point.timestamp,
                 "speed": point.speed,
                 "altitude": point.altitude,
                 "heading": point.heading,
                 "accuracy": point.accuracy,
                 "additional_data": point.additional_data,
                 "createdAt": firestore.SERVER_TIMESTAMP
    })

        # Commit the batch
        batch.commit()
        logger.info(f"Added {len(payload.csv_data)} points to case {case_id}")

        return case_id

    except Exception as e:
        logger.error(f"Error creating case: {str(e)}")
        raise Exception(f"Failed to create case: {str(e)}")