from fastapi import APIRouter, HTTPException, Query, Body
from pydantic import BaseModel
from typing import List
from firebase.firebase_config import db
from services.case_service import assign_case_users

admin_router = APIRouter()


class AssignUsersRequest(BaseModel):
    user_ids: List[str]


class UserLookupRequest(BaseModel):
    user_ids: List[str]

@admin_router.get("/admin/users")
async def get_users(role: str = Query(None), search: str = Query(None), page: int = 1, page_size: int = 10):
    try:
        query = db.collection("users")

        if role:
            query = query.where("role", "==", role)

        results = []
        docs = query.stream()

        for doc in docs:
            data = doc.to_dict()
            if search:
                lower_search = search.lower()
                if lower_search not in data.get("firstName", "").lower() and lower_search not in data.get("email", "").lower():
                    continue
            results.append({
                "id": doc.id,
                "name": data.get("firstName", "Unknown") + " " + data.get("surname", ""),
                "email": data.get("email", ""),
                "role": data.get("role", "user")
            })

        start = (page - 1) * page_size
        end = start + page_size
        return {"users": results[start:end], "total": len(results)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch users: {str(e)}")


@admin_router.post("/admin/update-role/{user_id}")
async def update_user_role(user_id: str, new_role: dict = Body(...)):
    try:
        if new_role["new_role"] not in ["admin", "user"]:
            raise HTTPException(status_code=400, detail="Invalid role")

        user_ref = db.collection("users").document(user_id)
        user_ref.update({"role": new_role["new_role"]})
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update role: {str(e)}")



from firebase_admin import auth

@admin_router.delete("/admin/delete-user/{user_id}")
async def delete_user(user_id: str):
    try:
        # Delete from Firebase Auth
        try:
            auth.delete_user(user_id)
        except auth.UserNotFoundError:
            print(f"User {user_id} not found in Firebase Auth. Skipping...")

        # Delete from Firestore
        user_ref = db.collection("users").document(user_id)
        if user_ref.get().exists:
            user_ref.delete()
        else:
            print(f"User {user_id} not found in Firestore. Skipping...")

        return {"success": True, "message": f"User {user_id} deleted successfully."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete user: {str(e)}")



@admin_router.post("/admin/update-approval/{user_id}")
async def update_approval(user_id: str, payload: dict):
    try:
        is_approved = payload.get("is_approved")
        if is_approved is None:
            raise HTTPException(status_code=400, detail="Missing 'is_approved' field")

        user_ref = db.collection("users").document(user_id)
        user_ref.update({"isApproved": is_approved})
        return {"message": "Approval status updated successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@admin_router.post("/admin/cases/{case_id}/assign-users")
async def assign_users_to_case(case_id: str, payload: AssignUsersRequest):
    try:
        await assign_case_users(case_id, payload.user_ids)
        return {"success": True}
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@admin_router.post("/admin/users/lookup")
async def lookup_users(payload: UserLookupRequest):
    try:
        results = []
        for user_id in payload.user_ids:
            if not user_id:
                continue
            doc = db.collection("users").document(user_id).get()
            if not doc.exists:
                continue
            data = doc.to_dict() or {}
            results.append({
                "id": user_id,
                "name": f"{data.get('firstName', '')} {data.get('surname', '')}".strip() or data.get('email', user_id),
                "email": data.get("email", ""),
                "role": data.get("role", "user"),
            })
        return {"users": results}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
