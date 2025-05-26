
from fastapi import FastAPI
from fastapi.testclient import TestClient
from tests import mock_case_routes 
import pytest

app = FastAPI()
app.include_router(mock_case_routes.router)

client = TestClient(app)

LOG_FILE = "mock_case_test_log.txt"

def log_test_result(name: str, description: str, test_type: str, passed: bool):
    with open(LOG_FILE, "a") as f:
        status = "PASS" if passed else "FAIL"
        f.write(f"{name} | {description} | {test_type} | {status}\n")

def test_search_cases():
    name = "test_search_cases"
    description = "Tests the /cases/search endpoint with no filters"
    test_type = "Integration"
    try:
        response = client.get("/cases/search")
        assert response.status_code == 200
        assert "cases" in response.json()
        log_test_result(name, description, test_type, True)
    except AssertionError:
        log_test_result(name, description, test_type, False)
        raise

def test_create_case_success():
    name = "test_create_case_success"
    description = "Tests successful creation at /cases/create"
    test_type = "Integration"
    try:
        response = client.post("/cases/create")
        assert response.status_code == 200
        assert "caseId" in response.json()
        log_test_result(name, description, test_type, True)
    except AssertionError:
        log_test_result(name, description, test_type, False)
        raise

def test_recent_cases_route():
    name = "test_recent_cases_route"
    description = "Tests the /cases/recent endpoint"
    test_type = "Integration"
    try:
        response = client.get("/cases/recent")
        assert response.status_code == 200
        assert "cases" in response.json()
        log_test_result(name, description, test_type, True)
    except AssertionError:
        log_test_result(name, description, test_type, False)
        raise

def test_update_case_missing_doc_id():
    name = "test_update_case_missing_doc_id"
    description = "Tests update failure when doc_id is missing"
    test_type = "Integration"
    payload = {
        "caseNumber": "001",
        "caseTitle": "Updated Case",
        "dateOfIncident": "2024-01-01",
        "region": "Western Cape",
        "between": "State vs Y"
    }
    try:
        response = client.put("/cases/update", json=payload)
        assert response.status_code == 400
        log_test_result(name, description, test_type, True)
    except AssertionError:
        log_test_result(name, description, test_type, False)
        raise

def test_delete_case_not_found():
    name = "test_delete_case_not_found"
    description = "Tests deleting a non-existent case"
    test_type = "Integration"
    try:
        response = client.delete("/cases/delete/nonexistentdocid123")
        assert response.status_code == 400
        log_test_result(name, description, test_type, True)
    except AssertionError:
        log_test_result(name, description, test_type, False)
        raise

def test_delete_case_found():
    name = "test_delete_case_found"
    description = "Tests deleting an existing case"
    test_type = "Integration"
    try:
        response = client.delete("/cases/delete/founddoc123")
        assert response.status_code == 200
        assert response.json()["success"]
        log_test_result(name, description, test_type, True)
    except AssertionError:
        log_test_result(name, description, test_type, False)
        raise

def test_monthly_case_counts():
    name = "test_monthly_case_counts"
    description = "Tests the /cases/monthly-counts endpoint"
    test_type = "Integration"
    try:
        response = client.get("/cases/monthly-counts")
        assert response.status_code == 200
        assert "counts" in response.json()
        log_test_result(name, description, test_type, True)
    except AssertionError:
        log_test_result(name, description, test_type, False)
        raise

def test_region_case_counts():
    name = "test_region_case_counts"
    description = "Tests the /cases/region-counts endpoint"
    test_type = "Integration"
    try:
        response = client.get("/cases/region-counts")
        assert response.status_code == 200
        assert "counts" in response.json()
        log_test_result(name, description, test_type, True)
    except AssertionError:
        log_test_result(name, description, test_type, False)
        raise

def test_all_case_points():
    name = "test_all_case_points"
    description = "Tests the /cases/all-points endpoint"
    test_type = "Integration"
    try:
        response = client.get("/cases/all-points")
        assert response.status_code == 200
        assert "points" in response.json()
        log_test_result(name, description, test_type, True)
    except AssertionError:
        log_test_result(name, description, test_type, False)
        raise

def test_last_case_points():
    name = "test_last_case_points"
    description = "Tests the /cases/last-points endpoint"
    test_type = "Integration"
    try:
        response = client.get("/cases/last-points")
        assert response.status_code == 200
        assert "points" in response.json()
        log_test_result(name, description, test_type, True)
    except AssertionError:
        log_test_result(name, description, test_type, False)
        raise