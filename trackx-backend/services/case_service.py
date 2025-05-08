from firebase.firebase_config import db
from google.cloud.firestore_v1 import DocumentReference
from google.api_core.datetime_helpers import DatetimeWithNanoseconds

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