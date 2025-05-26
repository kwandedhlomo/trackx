from firebase.firebase_config import db
from google.cloud.firestore_v1 import DocumentReference
from google.api_core.datetime_helpers import DatetimeWithNanoseconds
from google.cloud.firestore_v1 import SERVER_TIMESTAMP
from models.case_model import CaseCreateRequest
import uuid
from google.cloud import firestore
import logging
from collections import defaultdict
from datetime import datetime

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

    filters_applied = []

    if case_name:
        filters_applied.append(("caseTitle", "==", case_name))
    if region:
        filters_applied.append(("region", "==", region))
    if date:
        filters_applied.append(("dateOfIncident", "==", date))

    # If no filters provided, fetch all cases
    if not filters_applied:
        print("No filters provided — fetching all cases.")
        documents = list(cases_ref.stream())
    else:
        # Apply filters sequentially
        query = cases_ref
        for field, op, value in filters_applied:
            query = query.where(field, op, value)
        documents = list(query.stream())

    results = []
    for doc in documents:
        data = doc.to_dict()
        sanitized = sanitize_firestore_data(data)
        sanitized["doc_id"] = doc.id
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
            "status": "unresolved"
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

async def update_case(data: dict):
    try:
        print("Received update payload:", data)

        doc_id = data.get("doc_id")
        if not doc_id:
            print("Missing document ID")
            return False, "Missing document ID"

        doc_ref = db.collection("cases").document(doc_id)

        update_fields = {
            "caseNumber": data.get("caseNumber"),
            "caseTitle": data.get("caseTitle"),
            "dateOfIncident": data.get("dateOfIncident"),
            "region": data.get("region"),
            "between": data.get("between"),
            "status": data.get("status", "unresolved"),
            "updatedBy": "system",
            "updatedAt": SERVER_TIMESTAMP,
        }

        print("Attempting to update Firestore with:", update_fields)

        doc_ref.update(update_fields)
        print("Update successful")
        return True, "Update successful"

    except Exception as e:
        print("Exception during update:", str(e))
        return False, f"Update failed: {str(e)}"


async def delete_case(doc_id: str):
    try:
        doc_ref = db.collection("cases").document(doc_id)
        doc = doc_ref.get()

        if not doc.exists:
            return False, "Case not found"

        doc_ref.delete()
        print(f"Deleted case with doc_id: {doc_id}")
        return True, "Deleted successfully"

    except Exception as e:
        print("Error deleting case:", e)
        return False, f"Delete failed: {str(e)}"

async def fetch_recent_cases():
    try:
        query = db.collection("cases").order_by("createdAt", direction=firestore.Query.DESCENDING).limit(4)
        documents = list(query.stream())

        results = []
        for doc in documents:
            data = doc.to_dict()
            sanitized = sanitize_firestore_data(data)
            sanitized["doc_id"] = doc.id
            results.append(sanitized)
        return results
    except Exception as e:
        print(f"Error fetching recent cases: {e}")
        return []

async def get_case_counts_by_month():
    try:
        cases_ref = db.collection("cases")
        documents = list(cases_ref.stream())

        month_counts = defaultdict(int)

        for doc in documents:
            data = doc.to_dict()
            incident_date = data.get("dateOfIncident")
            if incident_date:
                try:
                    parsed_date = datetime.fromisoformat(incident_date.split("T")[0])
                    month_key = parsed_date.strftime("%Y-%m")  
                    month_counts[month_key] += 1
                except Exception as e:
                    print(f"Skipping invalid date for doc {doc.id}: {incident_date}", e)

        # Convert to list of {month, count} dicts and sort
        result = [
            {"month": k, "count": v} for k, v in sorted(month_counts.items())
        ]

        return result
    except Exception as e:
        print("Error aggregating case counts by month:", e)
        return []

async def get_region_case_counts():
    try:
        docs = db.collection("cases").stream()
        region_counts = {}

        for doc in docs:
            data = doc.to_dict()
            region = data.get("region", "Unknown")
            region_counts[region] = region_counts.get(region, 0) + 1

        # Convert to list of dictionaries
        return [{"region": region, "count": count} for region, count in region_counts.items()]

    except Exception as e:
        print(f"Error calculating region case counts: {e}")
        return []

async def fetch_all_case_points():
    try:
        all_points = []
        cases_ref = db.collection("cases")
        case_docs = list(cases_ref.stream())

        for case_doc in case_docs:
            case_id = case_doc.id
            points_ref = cases_ref.document(case_id).collection("points")
            points = list(points_ref.stream())

            for point in points:
                data = point.to_dict()
                lat = data.get("lat")
                lng = data.get("lng")
                if lat is not None and lng is not None:
                    all_points.append({"lat": lat, "lng": lng})

        print(f"✅ Fetched {len(all_points)} points:")
        for p in all_points:
            print(f"→ lat: {p['lat']}, lng: {p['lng']}")

        return all_points
    except Exception as e:
        print("❌ Error fetching case points:", e)
        return []

async def fetch_last_points_per_case():
    try:
        cases_ref = db.collection("cases")
        case_docs = list(cases_ref.stream())

        last_points = []

        for case_doc in case_docs:
            case_id = case_doc.id
            case_data = case_doc.to_dict()
            status = case_data.get("status", "unresolved")  # default to unresolved if missing

            # Determine color based on status
            color = "#1E40AF" if status == "resolved" else "#B91C1C"  # Tailwind blue-800 or red-700

            # Fetch the most recent point
            points_ref = cases_ref.document(case_id).collection("points")
            points = list(points_ref.order_by("timestamp", direction=firestore.Query.DESCENDING).limit(1).stream())

            for point in points:
                data = point.to_dict()
                lat = data.get("lat")
                lng = data.get("lng")
                if lat is not None and lng is not None:
                    last_points.append({
                        "lat": lat,
                        "lng": lng,
                        "color": color,
                        "size": 0.3,
                        "caseTitle": case_data.get("caseTitle", "Unknown Case"),
                        "doc_id": case_id
                    })

        return last_points
    except Exception as e:
        print("Error fetching last points:", e)
        return []