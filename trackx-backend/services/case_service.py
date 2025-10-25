from firebase.firebase_config import db
from google.cloud.firestore_v1 import DocumentReference, SERVER_TIMESTAMP
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
from typing import List, Dict, Any, Optional
from services.notifications_service import add_notification  # Import the notifications service
import os
from dotenv import load_dotenv
from openai import OpenAI
from firebase_admin import firestore
from firebase_admin.firestore import SERVER_TIMESTAMP
import logging

logger = logging.getLogger(__name__)

load_dotenv()  # loads OPENAI_API_KEY from .env (safe in dev)
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
db = firestore.client()

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


def _case_accessible_to_user(case_data: Dict[str, Any], user_id: str) -> bool:
    if not user_id:
        return True
    user_ids = case_data.get("userIds") or case_data.get("userIDs") or []
    if isinstance(user_ids, list) and user_id in user_ids:
        return True
    return case_data.get("userID") == user_id


def _get_case_documents_for_user(user_id: str, include_deleted: bool = False) -> Dict[str, Any]:
    """
    Returns all case documents for a user, excluding soft-deleted ones unless include_deleted=True.
    Works even if 'is_deleted' doesn't exist on some documents.
    """
    cases_ref = db.collection("cases")
    docs_map: Dict[str, Any] = {}

    # Step 1: Fetch all docs (no risky Firestore filters)
    all_docs = list(cases_ref.stream())

    for doc in all_docs:
        data = doc.to_dict() or {}

        # Skip soft-deleted unless explicitly requested
        if not include_deleted and data.get("is_deleted", False):
            continue

        # Filter by user ownership if applicable
        if user_id:
            if not _case_accessible_to_user(data, user_id):
                continue

        docs_map[doc.id] = doc

    return docs_map

from firebase_admin import firestore
from firebase_admin.firestore import SERVER_TIMESTAMP
from openai import OpenAI

client = OpenAI()
db = firestore.client()

# Helper: collect annotation descriptions from likely subcollections
async def fetch_annotation_descriptions(case_id: str) -> list:
    """
    Tries multiple subcollection names and pulls text-like fields.
    Returns a list of descriptions (strings), de-duped and filtered.
    """
    doc_ref = db.collection("cases").document(case_id)
    candidate_subcollections = [
        "locations", "annotations", "locationAnnotations", "points", "allPoints", "notes"
    ]
    descriptions = []
    for col in candidate_subcollections:
        try:
            coll_ref = doc_ref.collection(col)
            docs = list(coll_ref.stream())
            for d in docs:
                data = d.to_dict() or {}
                # common keys where human text might live
                for k in ("description", "annotation", "notes", "note", "text", "descriptionText"):
                    v = data.get(k)
                    if v and isinstance(v, str) and v.strip():
                        descriptions.append(v.strip())
        except Exception as e:
            logger.debug(f"Could not read subcollection {col} for case {case_id}: {e}")
    # also check top-level fields on the case doc
    try:
        case_doc = doc_ref.get()
        if case_doc.exists:
            case_data = case_doc.to_dict() or {}
            for k in ("reportNotes", "annotations", "locationDescriptions"):
                v = case_data.get(k)
                if isinstance(v, str) and v.strip():
                    descriptions.append(v.strip())
                # if it's a list of strings:
                if isinstance(v, list):
                    descriptions.extend([str(x).strip() for x in v if isinstance(x, str) and x.strip()])
    except Exception:
        pass

    # de-dup while preserving order
    seen = set()
    out = []
    for t in descriptions:
        if t not in seen:
            seen.add(t)
            out.append(t)
    return out

# --- AI generation helpers (improved prompts) ---

async def generate_case_intro(case_title: str, region: str, date: str) -> str:
    """
    Produce a single concise paragraph suitable for a forensic report introduction.
    Explicit instructions prevent the model from producing headers or inventing details.
    """
    # Build a short factual context string (only include if present)
    facts = []
    if case_title: facts.append(f"case title: {case_title}")
    if region: facts.append(f"region: {region}")
    if date: facts.append(f"date: {date}")
    facts_str = "; ".join(facts) if facts else "No case metadata provided."

    prompt = (
        "You are a forensic analyst. Write ONE concise paragraph (2–4 sentences) suitable as the "
        "introduction to a formal forensic report. **Important**: "
        "1) Output only the paragraph — do NOT include a title, headings, or separate lines for Date/Location/Case Title. "
        "2) Do NOT invent facts or make definitive claims about specific forensic test results unless they are explicitly provided. "
        "3) Be neutral and factual. "
        f"Context: {facts_str}"
    )

    resp = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": "You are a forensic analyst writing concise, formal introductions."},
            {"role": "user", "content": prompt}
        ],
        max_tokens=250,
        temperature=0.15,
    )
    return (resp.choices[0].message.content or "").strip()


async def generate_case_conclusion(case_title: str, region: str, intro_text: str, annotation_texts: list, evidence_items: list) -> str:
    """
    Strict evidence-driven conclusion: summarises annotations + evidenceItems + intro.
    Will not invent facts; will be cautious if evidence is limited.
    """

    # Prepare annotation block
    if annotation_texts:
        ann_lines = [f"{i+1}. {t}" for i, t in enumerate(annotation_texts)]
        annotation_block = "\n".join(ann_lines)
    else:
        annotation_block = "No annotation descriptions available."

    # Prepare evidence block
    if evidence_items:
        ev_lines = [f"{i+1}. {e}" for i, e in enumerate(evidence_items)]
        evidence_block = "\n".join(ev_lines)
    else:
        evidence_block = "No explicit evidence items recorded."

    prompt = (
        "You are a forensic analyst. Compose a single concise conclusion paragraph (2–4 sentences) that "
        "summarizes only the evidence provided below. **Do NOT invent new facts**, and do not attribute "
        "specific laboratory results unless they appear in the evidence. If the evidence is limited or inconclusive, "
        "explicitly say so and recommend further investigation.\n\n"
        f"INTRODUCTION (for context):\n{intro_text or '(none)'}\n\n"
        f"ANNOTATION DESCRIPTIONS:\n{annotation_block}\n\n"
        f"EVIDENCE ITEMS:\n{evidence_block}\n\n"
        "Output: one paragraph only."
    )

    resp = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": "You are a forensic analyst writing clear, objective conclusions."},
            {"role": "user", "content": prompt}
        ],
        max_tokens=300,
        temperature=0.15,
    )
    return (resp.choices[0].message.content or "").strip()

# --- Combined helper that creates both and stores to Firestore with aligned keys ---
async def add_intro_conclusion(case_id: str):
    doc_ref = db.collection("cases").document(case_id)
    doc = doc_ref.get()
    if not doc.exists:
        return False, "Case not found"

    case = doc.to_dict() or {}
    # fetch annotation descriptions (robust)
    annotation_texts = await fetch_annotation_descriptions(case_id)

    # include evidenceItems array as well (if any)
    evidence_items = case.get("evidenceItems", [])
    combined_evidence = annotation_texts + evidence_items

    # create intro
    intro = await generate_case_intro(
        case.get("caseTitle", "") or "",
        case.get("region", "") or "",
        case.get("dateOfIncident", "") or ""
    )

    # create conclusion based strictly on intro + annotations
    conclusion = await generate_case_conclusion(
        case.get("caseTitle", "") or "",
        case.get("region", "") or "",
        intro,
        combined_evidence
    )

    # store using the keys the frontend expects
    doc_ref.update({
        "reportIntro": intro,
        "reportConclusion": conclusion,
        "updatedAt": SERVER_TIMESTAMP
    })

    return True, {"reportIntro": intro, "reportConclusion": conclusion}

async def search_cases(case_name: str = "", region: str = "", date: str = "", user_id: str = "",
                       status: str = "", urgency: str = "", include_deleted: bool = False, province: str = "", provinceCode: str = "", provinceName: str = "", district: str = "", districtCode: str = "", districtName: str = ""):
    try:
        print(f"Received filters: case_name={case_name}, region={region}, date={date}, "
              f"user_id={user_id}, status={status}, urgency={urgency}, include_deleted={include_deleted}")

        # Normalize province/district inputs early so both user and non-user paths can use them
        eff_province_code = (provinceCode or province or "").strip()
        eff_province_name = (provinceName or region or "").strip()
        eff_district_code = (districtCode or district or "").strip()
        eff_district_name = (districtName or "").strip()

        # Precompute legacy-friendly forms to avoid NameErrors in user-scoped path
        def _slugify(name: str) -> str:
            try:
                s = ''.join(ch.lower() if ch.isalnum() else '-' for ch in name)
                while '--' in s:
                    s = s.replace('--', '-')
                return s.strip('-')
            except Exception:
                return name

        province_slug = _slugify(eff_province_name) if eff_province_name else ""
        province_lower = eff_province_name.lower() if eff_province_name else ""

        # Get all cases, applying soft-delete logic
        if user_id:
            docs_map = _get_case_documents_for_user(user_id, include_deleted=include_deleted)
            documents = list(docs_map.values())
        else:
            docs_map = _get_case_documents_for_user("", include_deleted=include_deleted)
            documents = list(docs_map.values())
            cases_ref = db.collection("cases")
            eff_province_code = (provinceCode or province).strip() if (provinceCode or province) else ""
            eff_province_name = (provinceName or region).strip() if (provinceName or region) else ""
            eff_district_code = (districtCode or district).strip() if (districtCode or district) else ""
            eff_district_name = (districtName).strip() if districtName else ""

            def apply_common(q):
                if case_name:
                    q = q.where("caseTitle", "==", case_name)
                if eff_district_code:
                    q = q.where("districtCode", "==", eff_district_code)
                elif eff_district_name:
                    q = q.where("districtName", "==", eff_district_name)
                if date:
                    q = q.where("dateOfIncident", "==", date)
                if status:
                    q = q.where("status", "==", status)
                if urgency:
                    q = q.where("urgency", "==", urgency)
                return q

            def slugify(name: str) -> str:
                try:
                    s = ''.join(ch.lower() if ch.isalnum() else '-' for ch in name)
                    while '--' in s:
                        s = s.replace('--', '-')
                    return s.strip('-')
                except Exception:
                    return name

            province_slug = slugify(eff_province_name) if eff_province_name else ""
            province_lower = (eff_province_name or "").strip().lower()

            query_refs = []
            if eff_province_code or eff_province_name:
                if eff_province_code:
                    query_refs.append(apply_common(cases_ref.where("provinceCode", "==", eff_province_code)))
                if eff_province_name:
                    # provinceName exact
                    query_refs.append(apply_common(cases_ref.where("provinceName", "==", eff_province_name)))
                    # legacy region equals human name
                    query_refs.append(apply_common(cases_ref.where("region", "==", eff_province_name)))
                    # legacy region equals slug (western-cape)
                    if province_slug and province_slug != eff_province_name:
                        query_refs.append(apply_common(cases_ref.where("region", "==", province_slug)))
                    # legacy region equals lower-case with space ("western cape")
                    if province_lower and province_lower != eff_province_name and province_lower != province_slug:
                        query_refs.append(apply_common(cases_ref.where("region", "==", province_lower)))
            else:
                base = apply_common(cases_ref)
                if region:
                    base = base.where("region", "==", region)
                    reg_slug = slugify(region)
                    if reg_slug and reg_slug != region:
                        query_refs.append(apply_common(cases_ref.where("region", "==", reg_slug)))
                    reg_lower = region.strip().lower()
                    if reg_lower and reg_lower not in (region, reg_slug):
                        query_refs.append(apply_common(cases_ref.where("region", "==", reg_lower)))
                query_refs.append(base)

            docs_map_local = {}
            for qr in query_refs:
                for d in qr.stream():
                    docs_map_local[d.id] = d
            documents = list(docs_map_local.values())

        results = []
        seen_ids = set()
        for doc in documents:
            if doc.id in seen_ids:
                continue
            data = doc.to_dict()
                # Skip deleted cases unless explicitly included
            if not include_deleted and data.get("is_deleted", False):
                continue

            if not _case_accessible_to_user(data, user_id):
                continue
            if case_name and data.get("caseTitle") != case_name:
                continue
            eff_province_code = (provinceCode or province).strip() if (provinceCode or province) else ""
            eff_province_name = (provinceName or region).strip() if (provinceName or region) else ""
            eff_district_code = (districtCode or district).strip() if (districtCode or district) else ""
            eff_district_name = (districtName).strip() if districtName else ""

            if eff_province_code:
                reg_val = (data.get("region") or "").strip()
                reg_norm = reg_val.lower()
                if not (
                    data.get("provinceCode") == eff_province_code or
                    (eff_province_name and (
                        data.get("provinceName") == eff_province_name or
                        reg_val == eff_province_name or
                        (province_slug and reg_val == province_slug) or
                        (province_lower and reg_norm == province_lower)
                    ))
                ):
                    continue
            elif eff_province_name:
                reg_val = (data.get("region") or "").strip()
                reg_norm = reg_val.lower()
                if not (
                    data.get("provinceName") == eff_province_name or
                    reg_val == eff_province_name or
                    (province_slug and reg_val == province_slug) or
                    (province_lower and reg_norm == province_lower)
                ):
                    continue
            if eff_district_code and (data.get("districtCode") != eff_district_code):
                continue
            if (not eff_district_code) and eff_district_name and (data.get("districtName") != eff_district_name):
                continue
            if region and not (eff_province_code or eff_province_name):
                if data.get("region") != region:
                    continue
            if date and data.get("dateOfIncident") != date:
                continue
            if status and data.get("status") != status:
                continue
            if urgency and data.get("urgency") != urgency:
                continue
            sanitized = sanitize_firestore_data(data)
            sanitized["doc_id"] = doc.id
            results.append(sanitized)
            seen_ids.add(doc.id)

        return results

    except Exception as e:
        print(f"Unhandled exception in search_cases: {e}")
        raise

async def create_case(payload: CaseCreateRequest) -> str:
    """Create a new case with optional GPS points and allPoints data."""
    try:
        case_id = str(uuid.uuid4())

        raw_user_ids = list(getattr(payload, "userIDs", []) or getattr(payload, "userIds", []) or [])
        legacy_user_id = getattr(payload, "userID", None)
        if legacy_user_id:
            raw_user_ids.append(legacy_user_id)
        # ensure creator present at least once
        user_ids = []
        for uid in raw_user_ids:
            if uid and uid not in user_ids:
                user_ids.append(uid)

        # Main case metadata
        case_data = {
            "caseNumber": payload.case_number,
            "caseTitle": payload.case_title,
            "dateOfIncident": payload.date_of_incident,
            "region": payload.region,
            "provinceCode": getattr(payload, "provinceCode", None),
            "provinceName": getattr(payload, "provinceName", None) or payload.region,
            "districtCode": getattr(payload, "districtCode", None),
            "districtName": getattr(payload, "districtName", None),
            "between": payload.between,
            "urgency": payload.urgency, 
            "createdAt": firestore.SERVER_TIMESTAMP,
            "status": "in progress",
            "userID": user_ids[0] if user_ids else legacy_user_id,
            "userIds": user_ids,
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
        notified = set()
        for uid in user_ids:
            if uid and uid not in notified:
                await add_notification(
                    user_id=uid,
                    title="Case Created",
                    message=f"A new case titled '{case_data['caseTitle']}' has been created.",
                    notification_type="case-created"
                )
                notified.add(uid)
                logger.info(f"Notification sent to user {uid} for case creation.")

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
            # New-style region fields (keep legacy region too)
            "provinceCode": data.get("provinceCode"),
            "provinceName": data.get("provinceName"),
            "districtCode": data.get("districtCode"),
            "districtName": data.get("districtName"),
            "between": data.get("between"),
            "status": data.get("status", "in progress"),
            "urgency": data.get("urgency"),
            # Evidence (accept either snake_case from backend route or camelCase from frontend)
            "evidenceItems": data.get("evidence_items") or data.get("evidenceItems"),
            "updatedBy": "system",
            "updatedAt": SERVER_TIMESTAMP,
        }

        if "userIDs" in data or "userIds" in data:
            incoming_user_ids = data.get("userIDs") or data.get("userIds") or []
            if not isinstance(incoming_user_ids, list):
                raise ValueError("userIds must be a list")
            normalized_ids = []
            for uid in incoming_user_ids:
                if uid and uid not in normalized_ids:
                    normalized_ids.append(uid)
            update_fields["userIds"] = normalized_ids
            if normalized_ids:
                update_fields["userID"] = normalized_ids[0]
        elif "userID" in data:
            update_fields["userID"] = data.get("userID")

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
        target_user_ids = (
            update_fields.get("userIds")
            or current_data.get("userIds")
            or []
        )
        if not target_user_ids and current_data.get("userID"):
            target_user_ids = [current_data.get("userID")]

        notified = set()
        for uid in target_user_ids:
            if uid and uid not in notified:
                await add_notification(
                    user_id=uid,
                    title="Case Updated",
                    message=notification_message,
                    notification_type="case-update"
                )
                notified.add(uid)
                print(f"Notification sent to user {uid} for case update.")

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
        user_ids = case_data.get("userIds") or []
        if not user_ids and case_data.get("userID"):
            user_ids = [case_data.get("userID")]
        case_title = case_data.get("caseTitle", "Unknown Case")

        # Delete the case
        doc_ref.delete()
        print(f"Deleted case with doc_id: {doc_id}")

        # Trigger notification if user ID is found
        notified = set()
        for uid in user_ids:
            if uid and uid not in notified:
                await add_notification(
                    user_id=uid,
                    title="Case Deleted",
                    message=f"Your case titled '{case_title}' has been deleted.",
                    notification_type="case-delete"
                )
                notified.add(uid)
                print(f"Notification sent to user {uid} for deleted case.")

        return True, "Deleted successfully"

    except Exception as e:
        print("Error deleting case:", e)
        return False, f"Delete failed: {str(e)}"

async def soft_delete_case(case_id: str):
    """Marks a case as deleted (soft delete)."""
    try:
        doc_ref = db.collection("cases").document(case_id)
        doc = doc_ref.get()
        if not doc.exists:
            return {"success": False, "message": "Case not found"}

        doc_ref.update({
            "is_deleted": True,
            "deleted_at": firestore.SERVER_TIMESTAMP
        })
        return {"success": True, "message": "Case moved to trash"}
    except Exception as e:
        print(f"Error in soft_delete_case: {e}")
        raise


async def restore_case(case_id: str):
    """Restores a soft-deleted case."""
    try:
        doc_ref = db.collection("cases").document(case_id)
        doc = doc_ref.get()
        if not doc.exists:
            return {"success": False, "message": "Case not found"}

        doc_ref.update({
            "is_deleted": False,
            "deleted_at": firestore.DELETE_FIELD
        })
        return {"success": True, "message": "Case restored"}
    except Exception as e:
        print(f"Error in restore_case: {e}")
        raise


async def permanently_delete_case(case_id: str):
    """Completely removes a case document from Firestore."""
    try:
        doc_ref = db.collection("cases").document(case_id)
        doc = doc_ref.get()
        if not doc.exists:
            return {"success": False, "message": "Case not found"}

        doc_ref.delete()
        return {"success": True, "message": "Case permanently deleted"}
    except Exception as e:
        print(f"Error in permanently_delete_case: {e}")
        raise

async def fetch_recent_cases(sort_by: str = "dateEntered", user_id: str = ""):
    docs_map = _get_case_documents_for_user(user_id)
    sort_field = "createdAt" if sort_by == "dateEntered" else "dateOfIncident"

    def _sort_key(doc_snapshot):
        data = doc_snapshot.to_dict() or {}
        value = data.get(sort_field)
        if isinstance(value, DatetimeWithNanoseconds):
            return value
        if isinstance(value, datetime):
            return value
        if isinstance(value, str):
            try:
                return datetime.fromisoformat(value.split("Z")[0])
            except Exception:
                return datetime.min
        return datetime.min

    sorted_docs = sorted(docs_map.values(), key=_sort_key, reverse=True)
    results = []
    for doc in sorted_docs[:4]:
        data = doc.to_dict() or {}
        sanitized = sanitize_firestore_data(data)
        sanitized["doc_id"] = doc.id
        results.append(sanitized)

    return results

async def get_case_counts_by_month(user_id: str = ""):
    print(f"get_case_counts_by_month() called with user_id: {user_id}")
    docs_map = _get_case_documents_for_user(user_id)
    documents = list(docs_map.values())
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
    docs_map = _get_case_documents_for_user(user_id)
    docs = list(docs_map.values())
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

async def fetch_recent_points(limit: int = 10) -> list:
    try:
        results = []
        # Primary: collection group on 'allPoints' ordered by timestamp
        try:
            cg = db.collection_group("allPoints")
            docs = list(
                cg.order_by("timestamp", direction=firestore.Query.DESCENDING)
                  .limit(max(1, int(limit)))
                  .stream()
            )
            for d in docs:
                data = d.to_dict() or {}
                lat = data.get("lat")
                lng = data.get("lng")
                if lat is None or lng is None:
                    continue
                results.append({
                    "lat": float(lat),
                    "lng": float(lng),
                    "timestamp": data.get("timestamp")
                })
        except Exception as primary_err:
            print("Primary recent-points query failed (allPoints):", primary_err)

        # Fallback: generic 'points' without guaranteed timestamps
        if not results:
            try:
                cg2 = db.collection_group("points")
                docs2 = list(cg2.limit(max(1, int(limit))).stream())
                for d in docs2:
                    data = d.to_dict() or {}
                    lat = data.get("lat")
                    lng = data.get("lng")
                    if lat is None or lng is None:
                        continue
                    results.append({
                        "lat": float(lat),
                        "lng": float(lng)
                    })
            except Exception as inner:
                print("Fallback fetch from 'points' failed:", inner)

        return results
    except Exception as e:
        print("Error in fetch_recent_points:", e)
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


async def assign_case_users(case_id: str, user_ids: List[str]):
    if not isinstance(user_ids, list) or not user_ids:
        raise ValueError("user_ids must be a non-empty list")

    normalized_ids: list[str] = []
    for uid in user_ids:
        if uid and uid not in normalized_ids:
            normalized_ids.append(uid)

    if not normalized_ids:
        raise ValueError("No valid user IDs provided")

    case_ref = db.collection("cases").document(case_id)
    snapshot = case_ref.get()
    if not snapshot.exists:
        raise ValueError("Case not found")

    existing = snapshot.to_dict() or {}
    previous_ids = set(existing.get("userIds") or [])
    if not previous_ids and existing.get("userID"):
        previous_ids.add(existing.get("userID"))

    case_ref.update({
        "userIds": normalized_ids,
        "userID": normalized_ids[0],
        "updatedAt": firestore.SERVER_TIMESTAMP,
    })

    case_title = existing.get("caseTitle", "Unknown Case")

    newly_added = [uid for uid in normalized_ids if uid not in previous_ids]
    removed = [uid for uid in previous_ids if uid not in normalized_ids]

    for uid in newly_added:
        await add_notification(
            user_id=uid,
            title="Case Assignment",
            message=f"You have been added to the case '{case_title}'.",
            notification_type="case-assignment"
        )

    for uid in removed:
        await add_notification(
            user_id=uid,
            title="Case Access Updated",
            message=f"You have been removed from the case '{case_title}'.",
            notification_type="case-assignment"
        )

    return True

async def generate_ai_description(lat, lng, timestamp, status: str = "", snapshot: str | None = None) -> str:
    """
    Generate a concise forensic-style narrative for a GPS point.
    - lat, lng: numbers
    - timestamp: ISO string (or any string you pass through)
    - status: optional status like Stopped/Idle/Moving
    - snapshot: optional base64/dataURL image (not analyzed here; kept for future)
    Returns text. On failure, returns a user-facing error string (so UI doesn't crash).
    """
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        return "AI description unavailable. Missing OPENAI_API_KEY on the server."

    # Build a short, focused prompt
    prompt = (
        "You are a forensic investigator. Write one concise paragraph describing the event at the given "
        "time and location. Keep it factual, neutral, and suitable for a formal report. "
        "Do not include headings or labels; just the paragraph.\n\n"
        f"Location: ({lat}, {lng})\n"
        f"Time: {timestamp}\n"
        f"Status: {status or 'Unknown'}\n"
    )
    if snapshot:
        # Reserved for future: could hint there is visual context
        prompt += "A snapshot image is associated with this point."

    try:
        resp = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "You describe vehicle movement and events in a forensic report style."},
                {"role": "user", "content": prompt},
            ],
            max_tokens=120,
            temperature=0.2,
        )
        text = (resp.choices[0].message.content or "").strip()
        return text or "No description generated."
    except Exception as e:
        # Don’t explode the route—return a friendly message the UI can show
        return f"AI description unavailable. Error: {str(e)}"

async def suggest_text_improvement(text: str, context_type: str = "general") -> str:
    """
    Returns an improved version of the given text with grammar, spelling, and clarity fixes.
    """
    if not text.strip():
        return ""

    prompt = (
        "You are an expert editor. Review the text below for grammar, spelling, and clarity. "
        "Keep the meaning intact and maintain a formal tone suitable for a forensic report. "
        f"Context type: {context_type}. Only output the corrected text.\n\n"
        f"Text:\n{text}"
    )

    resp = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": "You are a helpful and precise editor."},
            {"role": "user", "content": prompt}
        ],
        max_tokens=500,
        temperature=0.1,
    )

    return (resp.choices[0].message.content or "").strip()