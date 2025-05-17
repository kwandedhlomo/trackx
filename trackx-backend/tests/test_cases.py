# ✅ FILE: tests/test_cases.py
import pytest
from fastapi.testclient import TestClient
from services.case_service import sanitize_firestore_data
from main import app

# ----------- TEST CLIENT -----------

@pytest.fixture
def client():
    return TestClient(app)

# ----------- UNIT TESTS -----------

def test_sanitize_firestore_data_simple():
    raw = {
        "name": "John",
        "count": 5,
        "active": True,
        "location": None
    }
    result = sanitize_firestore_data(raw)
    assert result == raw

# ----------- INTEGRATION TEST -----------

def test_search_cases_empty_filters(client):
    response = client.get("/cases/search")
    assert response.status_code == 200
    assert response.json() == {"cases": []}

# ----------- FIREBASE MOCK FIXTURES -----------

@pytest.fixture
def mock_verify_id_token(mocker):
    return mocker.patch(
        "firebase_admin.auth.verify_id_token",
        return_value={"uid": "test-uid", "email": "test@example.com"}
    )

@pytest.fixture
def mock_firestore_set(mocker):
    mock_doc_ref = mocker.Mock()
    mock_doc_ref.set.return_value = None
    mocker.patch(
        "firebase.firebase_config.db.collection",
        return_value=mocker.Mock(document=mocker.Mock(return_value=mock_doc_ref))
    )

@pytest.fixture
def mock_firestore_update(mocker):
    mock_doc_ref = mocker.Mock()
    mock_doc_ref.update.return_value = None
    mocker.patch(
        "firebase.firebase_config.db.collection",
        return_value=mocker.Mock(document=mocker.Mock(return_value=mock_doc_ref))
    )

@pytest.fixture
def mock_firestore_delete(mocker):
    mock_doc_ref = mocker.Mock()
    mock_doc_ref.get.return_value.exists = True
    mock_doc_ref.delete.return_value = None
    mocker.patch(
        "firebase.firebase_config.db.collection",
        return_value=mocker.Mock(document=mocker.Mock(return_value=mock_doc_ref))
    )

# ----------- ROUTE TESTS -----------

def test_register_user_success(client, mock_verify_id_token, mock_firestore_set):
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

def test_update_case(client, mock_firestore_update):
    payload = {
        "doc_id": "mockdocid123",
        "caseNumber": "Case001",
        "caseTitle": "Mock Case",
        "dateOfIncident": "2024-01-01",
        "region": "Gauteng",
        "between": "State vs Mock"
    }
    response = client.put("/cases/update", json=payload)
    assert response.status_code == 200
    assert response.json()["success"] is True

def test_delete_case(client, mock_firestore_delete):
    response = client.delete("/cases/delete/mockdocid123")
    assert response.status_code == 200
    assert response.json()["success"] is True