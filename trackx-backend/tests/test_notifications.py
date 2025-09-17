from fastapi import FastAPI
from fastapi.testclient import TestClient
import mock_notification_routes
import pytest

app = FastAPI()
app.include_router(mock_notification_routes.router)

client = TestClient(app)

LOG_FILE = "mock_notification_test_log.txt"

def log_test_result(name: str, description: str, test_type: str, passed: bool):
    with open(LOG_FILE, "a") as f:
        status = "PASS" if passed else "FAIL"
        f.write(f"{name} | {description} | {test_type} | {status}\n")

def test_create_notification():
    name = "test_create_notification"
    description = "Tests POST /notifications/{user_id} to create a notification"
    test_type = "Integration"
    try:
        response = client.post(
            "/notifications/test_user_1",
            params={
                "title": "Test Notification",
                "message": "This is a test message.",
                "notification_type": "system"
            }
        )
        assert response.status_code == 200
        assert response.json()["success"]
        log_test_result(name, description, test_type, True)
    except AssertionError:
        log_test_result(name, description, test_type, False)
        raise

def test_get_notifications():
    name = "test_get_notifications"
    description = "Tests GET /{user_id} to fetch paginated notifications"
    test_type = "Integration"
    try:
        response = client.get("/test_user_1?page=1&limit=10")
        assert response.status_code == 200
        data = response.json()
        assert "notifications" in data
        assert "total" in data
        log_test_result(name, description, test_type, True)
    except AssertionError:
        log_test_result(name, description, test_type, False)
        raise

def test_update_notification_status():
    name = "test_update_notification_status"
    description = "Tests PATCH /{user_id}/{notification_id} to mark notification as read"
    test_type = "Integration"

    try:
        # Create a new notification
        create_response = client.post(
            "/notifications/test_user_1",
            params={
                "title": "Patch Test",
                "message": "This is to be updated",
                "notification_type": "system",
            },
        )
        assert create_response.status_code == 200
        notification_id = create_response.json()["id"]

        # Update the notification's read status
        patch_response = client.patch(
            f"/test_user_1/{notification_id}", json={"read": True}
        )

        assert patch_response.status_code == 200
        assert patch_response.json()["success"]
        log_test_result(name, description, test_type, True)

    except AssertionError:
        log_test_result(name, description, test_type, False)
        raise

def test_update_notification_status_not_found():
    name = "test_update_notification_status_not_found"
    description = "Tests PATCH /{user_id}/{notification_id} with invalid ID"
    test_type = "Edge"
    try:
        response = client.patch("/test_user_1/nonexistent_id", json={"read": True})
        assert response.status_code == 404
        log_test_result(name, description, test_type, True)
    except AssertionError:
        log_test_result(name, description, test_type, False)
        raise