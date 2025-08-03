from fastapi import APIRouter, HTTPException
from services.notifications_service import add_notification, fetch_notifications, update_notification
from models.notification_model import Notification, UpdateNotificationRequest

# Create a router for notifications
router = APIRouter()

@router.post("/notifications/{user_id}")
async def create_notification(user_id: str, title: str, message: str, notification_type: str):
    """
    API endpoint to create a notification for a user.

    Args:
        user_id (str): The ID of the user to whom the notification belongs.
        title (str): The title of the notification.
        message (str): The detailed message of the notification.
        notification_type (str): The type of the notification (e.g., "case-update", "system").

    Returns:
        dict: A success message or an error message.
    """
    result = await add_notification(user_id, title, message, notification_type)
    if not result["success"]:
        raise HTTPException(status_code=500, detail=result["message"])
    return result


@router.get("/{user_id}")
async def get_notifications(user_id: str, page: int = 1, limit: int = 10):
    """
    API endpoint to fetch paginated notifications for a user.

    Args:
        user_id (str): The ID of the user whose notifications are being fetched.
        page (int): The page number (default is 1).
        limit (int): The number of notifications per page (default is 10).

    Returns:
        dict: A dictionary containing a list of notifications and pagination metadata.
    """
    try:
        notifications = await fetch_notifications(user_id)
        start = (page - 1) * limit
        end = start + limit
        paginated_notifications = notifications[start:end]

        return {
            "notifications": paginated_notifications,
            "total": len(notifications),
            "page": page,
            "limit": limit,
        }
    except Exception as e:
        print(f"Error in get_notifications route for user {user_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch notifications: {str(e)}")


@router.patch("/{user_id}/{notification_id}")
async def update_notification_status(user_id: str, notification_id: str, request: UpdateNotificationRequest):
    """
    API endpoint to update the read status of a notification.

    Args:
        user_id (str): The ID of the user whose notification is being updated.
        notification_id (str): The ID of the notification to update.
        request (UpdateNotificationRequest): The request body containing the new read status.

    Returns:
        dict: A success message or an error message.
    """
    try:
        # Debugging: Log the incoming request
        print(f"Received update request for notification {notification_id} for user {user_id}: {request}")

        result = await update_notification(user_id, notification_id, request.read)
        if not result["success"]:
            raise HTTPException(status_code=404, detail=result["message"])

        # Debugging: Log the success response
        print(f"Notification {notification_id} for user {user_id} updated successfully.")
        return result
    except Exception as e:
        print(f"Error in update_notification_status route for notification {notification_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to update notification: {str(e)}")