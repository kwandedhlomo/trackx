
from fastapi import FastAPI
from fastapi.testclient import TestClient
import mock_case_routes 
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

def test_all_points_with_case_ids():
    name = "test_all_points_with_case_ids"
    description = "Tests the /cases/all-points-with-case-ids endpoint"
    test_type = "Integration"
    try:
        response = client.get("/cases/all-points-with-case-ids")
        assert response.status_code == 200
        assert isinstance(response.json(), list) or "points" in response.json() or response.json() == []
        log_test_result(name, description, test_type, True)
    except AssertionError:
        log_test_result(name, description, test_type, False)
        raise

def test_get_all_cases():
    name = "test_get_all_cases"
    description = "Tests the /cases/all endpoint"
    test_type = "Integration"
    try:
        response = client.get("/cases/all")
        assert response.status_code == 200
        assert "cases" in response.json() or isinstance(response.json(), list)
        log_test_result(name, description, test_type, True)
    except AssertionError:
        log_test_result(name, description, test_type, False)
        raise

def test_czml_for_case():
    name = "test_czml_for_case"
    description = "Tests the /cases/czml/{case_number} endpoint"
    test_type = "Integration"
    try:
        # Use a valid case_number if you have one, or a dummy for now
        case_number = "ADF-Knysna2123"
        response = client.get(f"/cases/czml/{case_number}")
        # Accept 200 or 404 depending on if the case exists
        assert response.status_code in [200, 404]
        log_test_result(name, description, test_type, True)
    except AssertionError:
        log_test_result(name, description, test_type, False)
        raise

def test_all_points_for_specific_case():
    name = "test_all_points_for_specific_case"
    description = "Tests the /cases/{case_id}/all-points endpoint"
    test_type = "Integration"
    try:
        
        case_id = "62cbc715-a12f-47eb-90f4-dfa50cac90d9"
        response = client.get(f"/cases/{case_id}/all-points")
        # Accept 200 or 404 depending on if the case exists
        assert response.status_code in [200, 404]
        log_test_result(name, description, test_type, True)
    except AssertionError:
        log_test_result(name, description, test_type, False)
        raise
