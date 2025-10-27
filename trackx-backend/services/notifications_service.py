from firebase.firebase_config import db
from datetime import datetime
from typing import Optional, Dict, Any


async def add_notification(
    user_id: str,
    title: str,
    message: str,
    notification_type: str,
    metadata: Optional[Dict[str, Any]] = None,
):
    """
    Add a notification to the user's notifications subcollection.

    Args:
        user_id (str): The ID of the user to whom the notification belongs.
        title (str): The title of the notification.
        message (str): The detailed message of the notification.
        notification_type (str): The type of the notification (e.g., "case-update", "system").

    Returns:
        dict: A dictionary indicating success or failure.
    """
    try:
        # Prepare the notification data
        notification_data = {
            "title": title,
            "message": message,
            "type": notification_type,
            "timestamp": datetime.utcnow().isoformat(),  # Use UTC timestamp
            "read": False,  # Default to unread
            "metadata": metadata or {},
        }

        # Reference to the user's notifications subcollection
        notifications_ref = db.collection("users").document(user_id).collection("notifications")

        # Add the notification document
        notifications_ref.add(notification_data)

        return {"success": True, "message": "Notification added successfully"}
    except Exception as e:
        return {"success": False, "message": f"Failed to add notification: {str(e)}"}

async def fetch_notifications(user_id: str, notification_type: Optional[str] = None):
    """
    Fetch all notifications for a specific user.

    Args:
        user_id (str): The ID of the user whose notifications are being fetched.

    Returns:
        list: A list of notifications, each represented as a dictionary.
    """
    try:
        # Reference to the user's notifications subcollection
        notifications_ref = db.collection("users").document(user_id).collection("notifications")

        # Fetch all notifications
        notifications = notifications_ref.stream()

        # Convert Firestore documents to dictionaries
        notifications_list = [
            {**notification.to_dict(), "id": notification.id}
            for notification in notifications
        ]

        # Sort notifications by timestamp (newest first)
        notifications_list.sort(key=lambda x: x["timestamp"], reverse=True)

        if notification_type:
            notifications_list = [
                item for item in notifications_list if item.get("type") == notification_type
            ]

        return notifications_list
    except Exception as e:
        print(f"Error fetching notifications for user {user_id}: {str(e)}")
        raise Exception(f"Failed to fetch notifications: {str(e)}")

async def update_notification(user_id: str, notification_id: str, read: bool):
    """
    Update the read status of a notification in the user's notifications subcollection.

    Args:
        user_id (str): The ID of the user whose notification is being updated.
        notification_id (str): The ID of the notification to update.
        read (bool): The new read status.

    Returns:
        dict: A dictionary indicating success or failure.
    """
    try:
        # Reference to the user's notification document
        notification_ref = db.collection("users").document(user_id).collection("notifications").document(notification_id)

        # Check if the document exists
        doc = notification_ref.get()
        if not doc.exists:
            print(f"Notification {notification_id} not found for user {user_id}.")
            return {"success": False, "message": "Notification not found"}

        # Update the read status
        print(f"Updating notification {notification_id} for user {user_id} with read={read}")
        notification_ref.update({"read": read})
        return {"success": True, "message": "Notification updated successfully"}
    except Exception as e:
        print(f"Error updating notification {notification_id} for user {user_id}: {str(e)}")
        raise Exception(f"Failed to update notification: {str(e)}")


async def delete_all_notifications(user_id: str):
    """
    Delete all notifications for a specific user.
    """
    try:
        notifications_ref = db.collection("users").document(user_id).collection("notifications")
        docs = list(notifications_ref.stream())
        if not docs:
            return {"success": True, "deleted": 0}

        batch = db.batch()
        for doc in docs:
            batch.delete(doc.reference)
        batch.commit()

        return {"success": True, "deleted": len(docs)}
    except Exception as e:
        print(f"Error deleting notifications for user {user_id}: {str(e)}")
        return {"success": False, "message": f"Failed to delete notifications: {str(e)}"}
