from fastapi import APIRouter, HTTPException, Query, Body
from firebase.firebase_config import db

admin_router = APIRouter()

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
