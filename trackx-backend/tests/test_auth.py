# ✅ FILE: tests/test_auth.py

import pytest
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

def test_register_user_invalid_token():
    payload = {
        "first_name": "John",
        "surname": "Doe",
        "email": "john@example.com",
        "id_number": "1234567890123",
        "investigator_id": "INV001",
        "dob": "1990-01-01"
    }
    headers = {"Authorization": "Bearer INVALID_TOKEN"}
    response = client.post("/auth/register", json=payload, headers=headers)
    assert response.status_code == 401

def test_register_user_success(mocker):
    mocker.patch(
        "firebase_admin.auth.verify_id_token",
        return_value={"uid": "mock-uid", "email": "john@example.com"}
    )

    mock_doc_ref = mocker.Mock()
    mock_doc_ref.set.return_value = None

    mocker.patch(
        "firebase.firebase_config.db.collection",
        return_value=mocker.Mock(document=mocker.Mock(return_value=mock_doc_ref))
    )

    payload = {
        "first_name": "John",
        "surname": "Doe",
        "email": "john@example.com",
        "id_number": "1234567890123",
        "investigator_id": "INV001",
        "dob": "1990-01-01"
    }

    headers = {"Authorization": "Bearer mocktoken"}
    response = client.post("/auth/register", json=payload, headers=headers)
    assert response.status_code == 200
    assert "uid" in response.json()