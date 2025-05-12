from firebase.firebase_config import db
from google.cloud.firestore_v1 import DocumentReference
from google.api_core.datetime_helpers import DatetimeWithNanoseconds
from google.cloud.firestore_v1 import SERVER_TIMESTAMP

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

    # If no filters provided, return an empty list
    if not filters_applied:
        print("No search filters provided — returning empty result.")
        return []

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