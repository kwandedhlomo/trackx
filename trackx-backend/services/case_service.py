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
import pytz
import json
import requests
import time
from datetime import timedelta
from datetime import timezone
from datetime import datetime
from services.notifications_service import add_notification  # Import the notifications service
import os
from openai import OpenAI
from dotenv import load_dotenv

load_dotenv()
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

async def generate_ai_description(lat, lng, timestamp, status="", snapshot=None):
    """
    Generate a forensic-style description for a GPS point.
    Optionally uses a snapshot image if provided (base64).
    """

    # Build the prompt
    prompt = (
        f"You are a forensic investigator. Write a single concise paragraph describing the event.\n"
        f"Focus only on the narrative description. Do not include headings, labels, or metadata.\n\n"
        f"Location: ({lat}, {lng})\n"
        f"Time: {timestamp}\n"
        f"Status: {status}\n"
    )
    if snapshot:
        prompt += "The snapshot image is provided (e.g., map or CCTV)."

    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "You describe vehicle movement and events in a forensic report style."},
                {"role": "user", "content": prompt}
            ],
            max_tokens=100
        )
        description = response.choices[0].message.content.strip()
        return description
    
    except Exception as e:
        import traceback
        traceback.print_exc()  # full stack trace in logs

        # return explicit error message instead of silent fallback
        return f"AI description unavailable. Error: {str(e)}"

# SIMULATION_PROGRESS = {}
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

async def search_cases(case_name: str = "", region: str = "", date: str = "", user_id: str = "", status: str = "", urgency: str = ""):
    try:
        print(f"Received filters: case_name={case_name}, region={region}, date={date}, user_id={user_id}, status={status}, urgency={urgency}")
        
        cases_ref = db.collection("cases")
        query = cases_ref

        # Always filter by user_id
        if user_id:
            query = query.where("userID", "==", user_id)

        # Dynamically chain other filters
        if case_name:
            query = query.where("caseTitle", "==", case_name)
        if region:
            query = query.where("region", "==", region)
        if date:
            query = query.where("dateOfIncident", "==", date)
        if status:
            query = query.where("status", "==", status)
        if urgency:
            query = query.where("urgency", "==", urgency)

        documents = list(query.stream())
        results = []
        for doc in documents:
            data = doc.to_dict()
            sanitized = sanitize_firestore_data(data)
            sanitized["doc_id"] = doc.id
            results.append(sanitized)

        return results

    except Exception as e:
        print(f"Unhandled exception in search_cases: {e}")
        raise

async def create_case(payload: CaseCreateRequest) -> str:
    """Create a new case with optional GPS points and allPoints data."""
    try:
        case_id = str(uuid.uuid4())

        # Main case metadata
        case_data = {
            "caseNumber": payload.case_number,
            "caseTitle": payload.case_title,
            "dateOfIncident": payload.date_of_incident,
            "region": payload.region,
            "between": payload.between,
            "urgency": payload.urgency, 
            "createdAt": firestore.SERVER_TIMESTAMP,
            "status": "in progress",
            "userID": getattr(payload, "userID", None)
        }

        # Save case document
        db.collection("cases").document(case_id).set(case_data)
        logger.info(f"Created case document with ID: {case_id}")

        # Handle `csv_data` → "points" subcollection
        if payload.csv_data:
            batch = db.batch()
            points_ref = db.collection("cases").document(case_id).collection("points")

            for point in payload.csv_data:
                point_doc = points_ref.document()
                batch.set(point_doc, {
                    "lat": point.latitude,
                    "lng": point.longitude,
                    "timestamp": point.timestamp,
                    "speed": getattr(point, "speed", None),
                    "altitude": getattr(point, "altitude", None),
                    "heading": getattr(point, "heading", None),
                    "accuracy": getattr(point, "accuracy", None),
                    "additional_data": getattr(point, "additional_data", None),
                    "createdAt": firestore.SERVER_TIMESTAMP
                })

            batch.commit()
            logger.info(f"Added {len(payload.csv_data)} points to case {case_id}")

        # Handle `all_points` → "allPoints" subcollection
        if hasattr(payload, "all_points") and payload.all_points:
            batch = db.batch()
            allpoints_ref = db.collection("cases").document(case_id).collection("allPoints")

            for point in payload.all_points:
                point_doc = allpoints_ref.document()
                batch.set(point_doc, {
                    "lat": point.latitude,
                    "lng": point.longitude,
                    "timestamp": point.timestamp,
                    "description": getattr(point, "description", None),
                    "createdAt": firestore.SERVER_TIMESTAMP
                })

            batch.commit()
            logger.info(f"Added {len(payload.all_points)} allPoints to case {case_id}")
        
                # Trigger notification
        if case_data["userID"]:
            await add_notification(
                user_id=case_data["userID"],
                title="Case Created",
                message=f"A new case titled '{case_data['caseTitle']}' has been created.",
                notification_type="case-created"
            )
            logger.info(f"Notification sent to user {case_data['userID']} for case creation.")

        return case_id

    except Exception as e:
        logger.error(f"Error creating case: {str(e)}")
        raise Exception(f"Failed to create case: {str(e)}")

async def update_case(data: dict):
    """
    Update a case document in Firestore and trigger a detailed notification for the user.
    """
    try:
        print("Received update payload:", data)

        doc_id = data.get("doc_id")
        if not doc_id:
            print("Missing document ID")
            return False, "Missing document ID"

        doc_ref = db.collection("cases").document(doc_id)

        # Fetch the current case data
        current_data = doc_ref.get().to_dict()
        if not current_data:
            return False, "Case not found"

        # Prepare the fields to update
        update_fields = {
            "caseNumber": data.get("caseNumber"),
            "caseTitle": data.get("caseTitle"),
            "dateOfIncident": data.get("dateOfIncident"),
            "region": data.get("region"),
            "between": data.get("between"),
            "status": data.get("status", "in progress"),
            "urgency": data.get("urgency"),
            "updatedBy": "system",
            "updatedAt": SERVER_TIMESTAMP,
        }

        # Remove fields that are not being updated
        update_fields = {k: v for k, v in update_fields.items() if v is not None}

        print("Attempting to update Firestore with:", update_fields)

        # Update the case in Firestore
        doc_ref.update(update_fields)
        print("Update successful")

        # Compare old and new data to determine what changed
        changes = []
        for key, new_value in update_fields.items():
            if key in ["updatedBy", "updatedAt"]:  
                continue
            old_value = current_data.get(key)
            if old_value != new_value:
                changes.append(f"{key} changed from '{old_value}' to '{new_value}'")

        # Generate a notification message
        case_title = current_data.get("caseTitle", "Unknown Case")
        if changes:
            notification_message = f"The following updates were made to your case '{case_title}': " + ", ".join(changes)
        else:
            notification_message = f"Your case '{case_title}' has been updated."

        # Fetch the user ID associated with the case
        user_id = current_data.get("userID")

        # Trigger a notification for the user
        if user_id:
            await add_notification(
                user_id=user_id,
                title="Case Updated",
                message=notification_message,
                notification_type="case-update"
            )
            print(f"Notification sent to user {user_id} for case update.")

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

        case_data = doc.to_dict()
        user_id = case_data.get("userID")
        case_title = case_data.get("caseTitle", "Unknown Case")

        # Delete the case
        doc_ref.delete()
        print(f"Deleted case with doc_id: {doc_id}")

        # Trigger notification if user ID is found
        if user_id:
            await add_notification(
                user_id=user_id,
                title="Case Deleted",
                message=f"Your case titled '{case_title}' has been deleted.",
                notification_type="case-delete"
            )
            print(f"Notification sent to user {user_id} for deleted case.")

        return True, "Deleted successfully"

    except Exception as e:
        print("Error deleting case:", e)
        return False, f"Delete failed: {str(e)}"

async def fetch_recent_cases(sort_by: str = "dateEntered", user_id: str = ""):
    query = db.collection("cases")
    if user_id:
        query = query.where("userID", "==", user_id)

    sort_field = "createdAt" if sort_by == "dateEntered" else "dateOfIncident"
    query = query.order_by(sort_field, direction=firestore.Query.DESCENDING).limit(4)

    documents = list(query.stream())
    results = []

    for doc in documents:
        data = doc.to_dict()
        sanitized = sanitize_firestore_data(data)
        sanitized["doc_id"] = doc.id
        results.append(sanitized)

    return results

async def get_case_counts_by_month(user_id: str = ""):
    print(f"get_case_counts_by_month() called with user_id: {user_id}")
    query = db.collection("cases")
    if user_id:
        query = query.where("userID", "==", user_id)

    documents = list(query.stream())
    print(f" Found {len(documents)} case documents for monthly count")

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

    return [{"month": k, "count": v} for k, v in sorted(month_counts.items())]


async def get_region_case_counts(user_id: str = ""):
    query = db.collection("cases")
    if user_id:
        query = query.where("userID", "==", user_id)

    docs = list(query.stream())
    print(f" Found {len(docs)} cases for region count (user_id={user_id})")

    region_counts = {}
    for doc in docs:
        data = doc.to_dict()
        region = data.get("region", "Unknown")
        region_counts[region] = region_counts.get(region, 0) + 1

    return [{"region": r, "count": c} for r, c in region_counts.items()]


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

        print(f" Fetched {len(all_points)} points:")
        for p in all_points:
            print(f"→ lat: {p['lat']}, lng: {p['lng']}")

        return all_points
    except Exception as e:
        print("Error fetching case points:", e)
        return []

    
async def fetch_interpolated_points(case_id: str) -> list:
    try:
        points_ref = db.collection("cases").document(case_id).collection("interpolatedPoints")
        docs = list(points_ref.stream())
        return [doc.to_dict() for doc in docs]
    except Exception as e:
        print(f"Failed to fetch interpolated points: {e}")
        return []

async def store_interpolated_points(case_id: str, points: list):
    try:
        batch = db.batch()
        points_ref = db.collection("cases").document(case_id).collection("interpolatedPoints")

        for pt in points:
            doc = points_ref.document()

            # Safely parse timestamp
            ts = pt.get("timestamp")
            parsed_ts = None

            if isinstance(ts, str):
                try:
                    parsed_ts = datetime.fromisoformat(ts.replace("Z", "+00:00"))
                except:
                    parsed_ts = None
            elif isinstance(ts, list) and ts:
                try:
                    parsed_ts = datetime.fromisoformat(str(ts[0]).replace("Z", "+00:00"))
                except:
                    parsed_ts = None
            elif isinstance(ts, datetime):
                parsed_ts = ts

            # Store Firestore-native timestamp (or None)
            batch.set(doc, {
                "lat": pt["lat"],
                "lng": pt["lng"],
                "timestamp": parsed_ts,
            })

        batch.commit()
        print(f"Stored {len(points)} interpolated points for case {case_id}")
    except Exception as e:
        print(f"Failed to store interpolated points: {e}")


async def fetch_all_points_by_case_number(case_number: str):
    try:
        db_ref = db.collection("cases")
        
        # Find the case with this case_number
        matching_case_query = db_ref.where("caseNumber", "==", case_number)
        case_docs = matching_case_query.stream()
        case_doc_list = list(case_docs)  

        if not case_doc_list:
            print(f"No case found with caseNumber: {case_number}")
            return []

        case_doc = case_doc_list[0]
        case_ref = case_doc.reference

        all_points_ref = case_ref.collection("allPoints").order_by("timestamp")
        all_points_docs = all_points_ref.stream()
        all_points = [doc.to_dict() for doc in all_points_docs]  

        return all_points

    except Exception as e:
        print(f"Error fetching allPoints for caseNumber {case_number}: {e}")
        return []
    
def generate_czml(case_id: str, points: list) -> list:
    """
    Generates a CZML document for Cesium animation from a list of GPS points,
    using a simple polyline path instead of a 3D model.
    """
    if not points:
        raise ValueError("No points provided for CZML generation")

    print(f"🚀 Starting CZML generation with {len(points)} points")
    
    for i, point in enumerate(points):
        if i < 5 or i > len(points) - 5:  # show first and last few
            print(f"\n--- Processing point {i} ---")

    def to_iso_zulu(ts_val):
        print(f"Processing timestamp: {repr(ts_val)} (type: {type(ts_val)})")
        
        if isinstance(ts_val, list):
            print(f"Timestamp is a list with {len(ts_val)} items: {ts_val}")
            if len(ts_val) == 0:
                print("Empty list provided as timestamp")
                return None
            ts_val = ts_val[0]
            print(f"Using first item from list: {repr(ts_val)} (type: {type(ts_val)})")
        
        if isinstance(ts_val, list):
            print(f"Timestamp is STILL a list after extraction: {ts_val}")
            return None

        if ts_val is None or ts_val == "":
            print("Timestamp is None or empty")
            return None

        try:
            if not isinstance(ts_val, str):
                print(f"Converting {type(ts_val)} to string: {ts_val}")
                ts_val = str(ts_val)

            print(f"About to replace Z in: {repr(ts_val)}")
            
            if ts_val.endswith("Z") and "+00:00" not in ts_val:
                ts_val = ts_val.replace("Z", "+00:00")
            print(f"After Z replacement: {repr(ts_val)}")

            dt = datetime.fromisoformat(ts_val)
            result = dt.astimezone(pytz.utc).isoformat().replace("+00:00", "Z")
            print(f"Successfully converted to: {result}")
            return result
        except Exception as e:
            print(f"Failed to convert timestamp {repr(ts_val)}: {e}")
            import traceback
            traceback.print_exc()
            return None

    cleaned_points = []
    for i, p in enumerate(points):
        print(f"\n--- Processing point {i} ---")
        ts = p.get("timestamp")
        print(f"Raw timestamp from point: {repr(ts)} (type: {type(ts)})")
        
        if not ts:
            print(f"Skipping point {i} with missing timestamp")
            continue

        iso_ts = to_iso_zulu(ts)
        if not iso_ts:
            print(f"Skipping point {i} with bad timestamp: {repr(ts)}")
            continue

        cleaned_points.append({
            "lat": p["lat"],
            "lng": p["lng"],
            "timestamp": iso_ts
        })
        print(f"Added cleaned point {i}")

    cleaned_points.sort(key=lambda x: x["timestamp"])

    if len(cleaned_points) < 2:
        raise ValueError("Not enough valid points after cleaning to generate CZML.")

    print(f"🧹 Cleaned points: {len(cleaned_points)}")
    
    availability_start = cleaned_points[0]["timestamp"]
    availability_end = cleaned_points[-1]["timestamp"]
    print(f"CZML Interval - Start: {availability_start}, End: {availability_end}")


    czml = [
        {
            "id": "document",
            "name": f"Track for case {case_id}",
            "version": "1.0",
            "clock": {
                "interval": f"{availability_start}/{availability_end}",
                "currentTime": availability_start,
                "multiplier": 10,
                "range": "LOOP_STOP",
                "step": "SYSTEM_CLOCK_MULTIPLIER"
            }
        },
        {
            "id": "pathEntity",
            "availability": f"{availability_start}/{availability_end}",
            "position": {
                "interpolationAlgorithm": "LAGRANGE",
                "interpolationDegree": 1,
                "referenceFrame": "FIXED",
                "epoch": availability_start,
                "cartographicDegrees": []
            },
            "path": {
                "material": {
                    "solidColor": {
                        "color": {
                            "rgba": [0, 255, 255, 255]
                        }
                    }
                },
                "width": 4,
                "leadTime": 0,
                "trailTime": 2000,
                "resolution": 5
            }
        }
    ]

    start_time = datetime.fromisoformat(availability_start.replace("Z", "+00:00"))
    for point in cleaned_points:
        point_time = datetime.fromisoformat(point["timestamp"].replace("Z", "+00:00"))
        time_offset = (point_time - start_time).total_seconds()
        czml[1]["position"]["cartographicDegrees"].extend([
            time_offset,
            point["lng"],
            point["lat"],
            0
        ])

    print(f"Generated CZML with {len(cleaned_points)} points.")
    return czml


async def fetch_all_points_for_case(case_id: str) -> list:
    """
    Retrieve allPoints subcollection for a given case.
    """
    try:
        points_ref = db.collection("cases").document(case_id).collection("allPoints")
        docs = points_ref.stream()
        return [doc.to_dict() for doc in docs]
    except Exception as e:
        raise Exception(f"Failed to fetch allPoints: {str(e)}")
    

# HELPER FUNCTION FOR POINTS api service.

ORS_API_KEY = "5b3ce3597851110001cf6248c3b41afd16e04795a3eaaf7b3c0cd61f"  # Replace with your actual key or use an environment variable


try:
    from google.api_core.datetime_helpers import DatetimeWithNanoseconds
except ImportError:
    try:
        from google.cloud.firestore_v1._helpers import DatetimeWithNanoseconds
    except ImportError:
        # Fallback - create a dummy class if we can't import it
        class DatetimeWithNanoseconds:
            pass

def interpolate_points_with_ors(points: list) -> list:
    """
    Efficiently interpolates a GPS route by calling ORS API with multiple points at once.
    Includes retry logic and ensures strictly ordered timestamps for Cesium playback.
    """

    if not points or len(points) < 2:
        print("Not enough points to interpolate.")
        return points

    # --- Step 1: Sanitize points ---
    sanitized_points = []
    for pt in points:
        lat = pt.get("lat")
        lng = pt.get("lng")
        timestamp = pt.get("timestamp")

        if not lat or not lng or not timestamp:
            continue

        if hasattr(timestamp, "isoformat"):
            timestamp_str = timestamp.isoformat().replace("+00:00", "Z")
        elif isinstance(timestamp, str):
            timestamp_str = timestamp
        elif isinstance(timestamp, list) and timestamp:
            timestamp_str = str(timestamp[0])
        else:
            continue

        sanitized_points.append({
            "lat": lat,
            "lng": lng,
            "timestamp": timestamp_str
        })

    if len(sanitized_points) < 2:
        print("Not enough valid points after sanitization.")
        return sanitized_points

    # --- Prepare ORS API request ---
    url = "https://api.openrouteservice.org/v2/directions/driving-car/geojson"
    headers = {
        "Authorization": ORS_API_KEY,
        "Content-Type": "application/json"
    }

    # ORS accepts multiple coordinates in one call
    coordinates = [[p["lng"], p["lat"]] for p in sanitized_points]
    body = {"coordinates": coordinates}

    # --- Call ORS with retry logic ---
    max_retries = 3
    route = None
    for attempt in range(max_retries):
        try:
            res = requests.post(url, headers=headers, json=body)
            if res.status_code == 429:
                wait = 2 ** attempt
                print(f"ORS rate limit hit. Retrying in {wait}s...")
                time.sleep(wait)
                continue
            res.raise_for_status()
            route = res.json()["features"][0]["geometry"]["coordinates"]
            break
        except Exception as e:
            print(f"ORS failed (attempt {attempt + 1}): {e}")
            if attempt == max_retries - 1:
                print("Returning sanitized points due to repeated failures.")
                return sanitized_points

    if not route:
        print("No route returned by ORS.")
        return sanitized_points

    # --- Interpolate timestamps across route ---
    t_start = datetime.fromisoformat(sanitized_points[0]["timestamp"].replace("Z", "+00:00"))
    t_end = datetime.fromisoformat(sanitized_points[-1]["timestamp"].replace("Z", "+00:00"))
    total_duration = (t_end - t_start).total_seconds()
    num_steps = max(2, len(route))

    padded = []
    for i, [lng, lat] in enumerate(route):
        frac = i / (num_steps - 1)
        interp_time = t_start + timedelta(seconds=total_duration * frac)

        padded.append({
            "lat": lat,
            "lng": lng,
            "timestamp": interp_time.replace(tzinfo=timezone.utc).isoformat().replace("+00:00", "Z")
        })

    # --- Finalize ---
    padded.sort(key=lambda p: p["timestamp"])
    print(f"Final padded point count: {len(padded)}")
    return padded

async def fetch_all_case_points_with_case_ids(): #this is the newest function for heatmap - 2025/06/26
    """
    Returns all GPS points from all cases, with each point tagged with its parent caseId.
    """
    try:
        all_points = []
        cases_ref = db.collection("cases")
        case_docs = list(cases_ref.stream())

        for case_doc in case_docs:
            case_id = case_doc.id
            points_ref = db.collection("cases").document(case_id).collection("points")
            points = list(points_ref.stream())

            for point in points:
                data = point.to_dict()
                lat = data.get("lat")
                lng = data.get("lng")
                timestamp = data.get("timestamp")

                if lat is not None and lng is not None and timestamp:
                    all_points.append({
                        "lat": lat,
                        "lng": lng,
                        "timestamp": timestamp,
                        "caseId": case_id
                    })

        print(f"Custom route fetched {len(all_points)} points with case IDs.")
        return all_points
    except Exception as e:
        print("Error in fetch_all_case_points_with_case_ids:", e)
        return []
async def fetch_last_points_per_case():
    try:
        cases_ref = db.collection("cases")
        case_docs = list(cases_ref.stream())
        result = []

        for case_doc in case_docs:
            case_data = case_doc.to_dict()
            doc_id = case_doc.id
            case_title = case_data.get("caseTitle", "")
            status = case_data.get("status", "")

            # Pull from allPoints subcollection
            points_ref = db.collection("cases").document(doc_id).collection("allPoints")
            last_points = list(points_ref.order_by("timestamp", direction=firestore.Query.DESCENDING).limit(1).stream())

            if last_points:
                last_point_data = last_points[0].to_dict()
                last_point_data["doc_id"] = doc_id
                last_point_data["caseTitle"] = case_title
                last_point_data["status"] = status
                result.append(last_point_data)

        return result
    except Exception as e:
        print(f"Error in fetch_last_points_per_case: {e}")
        return []

def serialize_firestore_data(data: dict) -> dict:
    """
    Convert Firestore DatetimeWithNanoseconds and other non-JSON types.
    """
    from google.cloud.firestore_v1 import _helpers

    def convert_value(value):
        if isinstance(value, datetime):
            return value.isoformat()
        if isinstance(value, _helpers.DatetimeWithNanoseconds):
            return value.isoformat()
        if isinstance(value, dict):
            return {k: convert_value(v) for k, v in value.items()}
        if isinstance(value, list):
            return [convert_value(v) for v in value]
        return value

    return {k: convert_value(v) for k, v in data.items()}