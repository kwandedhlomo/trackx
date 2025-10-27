from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Callable, Iterable, List, Tuple

import pytest

from services import case_service, derivations_service

LOG_FILE = Path(__file__).resolve().parent / "service_unit_tests.log"
LOG_FILE.write_text("name | description | type | status\n")


def _log_test_result(name: str, description: str, test_type: str, passed: bool) -> None:
    status = "PASS" if passed else "FAIL"
    with LOG_FILE.open("a") as handle:
        handle.write(f"{name} | {description} | {test_type} | {status}\n")


def _run_logged_test(
    name: str,
    description: str,
    test_type: str,
    assertions: Callable[[], None],
) -> None:
    try:
        assertions()
    except AssertionError:
        _log_test_result(name, description, test_type, False)
        raise
    else:
        _log_test_result(name, description, test_type, True)


def test_normalize_case_user_fields_merges_deduplicates():
    def _assertions():
        raw_case = {
            "userIds": ["user-2", "user-3"],
            "userID": "user-1",
            "userIDs": ["user-3", "user-4"],
            "owner": "legacy",
        }
        normalized = case_service._normalize_case_user_fields(raw_case)
        assert normalized["userId"] == "user-1"
        assert normalized["userIds"] == ["user-1", "user-2", "user-3"]
        assert normalized["isShared"] is True
        assert "userID" not in normalized and "userIDs" not in normalized

    _run_logged_test(
        "test_normalize_case_user_fields_merges_deduplicates",
        "Ensures legacy user fields collapse into a single canonical structure",
        "Unit",
        _assertions,
    )


def test_normalize_case_user_fields_single_user_not_shared():
    def _assertions():
        raw_case = {"userIds": ["solo", "solo"]}
        normalized = case_service._normalize_case_user_fields(raw_case)
        assert normalized["userIds"] == ["solo"]
        assert normalized["userId"] == "solo"
        assert normalized["isShared"] is False

    _run_logged_test(
        "test_normalize_case_user_fields_single_user_not_shared",
        "Confirms single-user cases stay private after normalization",
        "Unit",
        _assertions,
    )


def test_extract_user_ids_from_payload_dict_prioritises_primary_user():
    def _assertions():
        payload = {
            "userIds": ["user-2", "user-3"],
            "legacy_user_ids": ["user-3", "user-4"],
            "user_id": "user-1",
        }
        user_ids, primary = case_service._extract_user_ids_from_payload_dict(payload)
        assert primary == "user-1"
        assert user_ids == ["user-1", "user-2", "user-3", "user-4"]

    _run_logged_test(
        "test_extract_user_ids_from_payload_dict_prioritises_primary_user",
        "Validates that mixed payload keys produce a unique, primary-first list",
        "Unit",
        _assertions,
    )


def test_extract_user_ids_from_payload_dict_handles_missing_primary():
    def _assertions():
        payload = {"userIds": ["alpha", "beta", "alpha"]}
        user_ids, primary = case_service._extract_user_ids_from_payload_dict(payload)
        assert primary == "alpha"
        assert user_ids == ["alpha", "beta"]

    _run_logged_test(
        "test_extract_user_ids_from_payload_dict_handles_missing_primary",
        "Checks helper chooses sensible default primary when none supplied",
        "Unit",
        _assertions,
    )


def test_extract_user_ids_from_payload_dict_skips_falsey_entries():
    def _assertions():
        payload = {"userIds": ["lead", "", None, "contributor"], "user_id": ""}
        user_ids, primary = case_service._extract_user_ids_from_payload_dict(payload)
        assert primary == "lead"
        assert user_ids == ["lead", "contributor"]

    _run_logged_test(
        "test_extract_user_ids_from_payload_dict_skips_falsey_entries",
        "Ensures helper discards blank user identifiers when building membership list",
        "Unit",
        _assertions,
    )


def test_case_accessible_to_user_respects_membership():
    def _assertions():
        shared_case = {"userIds": ["alpha", "beta"], "userId": "alpha"}
        private_case = {"userIds": ["gamma"], "userId": "gamma"}

        assert case_service._case_accessible_to_user(shared_case, "beta") is True
        assert case_service._case_accessible_to_user(private_case, "delta") is False

    _run_logged_test(
        "test_case_accessible_to_user_respects_membership",
        "Checks that helper honours membership rules when evaluating access",
        "Unit",
        _assertions,
    )


def test_case_accessible_to_user_without_user_id_allows_access():
    def _assertions():
        case_data = {"userIds": ["alpha"], "userId": "alpha"}
        assert case_service._case_accessible_to_user(case_data, "") is True
        assert case_service._case_accessible_to_user(case_data, None) is True

    _run_logged_test(
        "test_case_accessible_to_user_without_user_id_allows_access",
        "Verifies anonymous lookups can see case metadata",
        "Unit",
        _assertions,
    )


def test_case_accessible_to_user_defaults_to_owner_when_list_missing():
    def _assertions():
        case_data = {"userId": "owner"}
        assert case_service._case_accessible_to_user(case_data, "owner") is True
        assert case_service._case_accessible_to_user(case_data, "other") is False

    _run_logged_test(
        "test_case_accessible_to_user_defaults_to_owner_when_list_missing",
        "Confirms access logic still enforces ownership when no shared list is stored",
        "Unit",
        _assertions,
    )


def test_sanitize_firestore_data_converts_supported_types(monkeypatch: pytest.MonkeyPatch):
    def _assertions():
        class FakeDocumentReference:
            def __init__(self, doc_id: str):
                self.id = doc_id

            def __str__(self) -> str:
                return self.id

        class FakeTimestamp:
            def __init__(self, dt: datetime):
                self._dt = dt

            def isoformat(self) -> str:
                return self._dt.isoformat()

            @classmethod
            def from_datetime(cls, dt: datetime):
                return cls(dt)

        monkeypatch.setattr(case_service, "DocumentReference", FakeDocumentReference)
        monkeypatch.setattr(case_service, "DatetimeWithNanoseconds", FakeTimestamp)

        timestamp = case_service.DatetimeWithNanoseconds.from_datetime(
            datetime(2024, 1, 1, 12, 0, tzinfo=timezone.utc)
        )
        payload = {
            "simple": "value",
            "nested": {
                "list": [1, FakeDocumentReference("child"), {"ts": timestamp}],
                "timestamp": timestamp,
            },
            "ref": FakeDocumentReference("root"),
        }

        sanitized = case_service.sanitize_firestore_data(payload)
        assert sanitized["nested"]["timestamp"].startswith("2024-01-01T12:00:00")
        assert sanitized["ref"] == "root"
        assert sanitized["nested"]["list"][1] == "child"
        assert sanitized["nested"]["list"][2]["ts"].startswith("2024-01-01T12:00:00")

    _run_logged_test(
        "test_sanitize_firestore_data_converts_supported_types",
        "Guarantees Firestore helper coerces timestamps and document references predictably",
        "Unit",
        _assertions,
    )


def test_sanitize_firestore_data_preserves_primitives():
    def _assertions():
        payload = {
            "numbers": [1, 2, 3],
            "bools": [True, False],
            "nested": {"value": 42.5, "flag": None},
        }
        sanitized = case_service.sanitize_firestore_data(payload)
        assert sanitized["numbers"] == [1, 2, 3]
        assert sanitized["bools"] == [True, False]
        assert sanitized["nested"]["value"] == 42.5
        assert sanitized["nested"]["flag"] is None

    _run_logged_test(
        "test_sanitize_firestore_data_preserves_primitives",
        "Checks sanitize helper leaves primitive values untouched",
        "Unit",
        _assertions,
    )


def test_haversine_meters_basic_distance():
    def _assertions():
        meters = derivations_service.haversine_meters(0, 0, 0, 1)
        assert 110_000 <= meters <= 112_500

    _run_logged_test(
        "test_haversine_meters_basic_distance",
        "Validates core geospatial distance calculation near the equator",
        "Unit",
        _assertions,
    )


def test__to_dt_handles_iso_strings():
    def _assertions():
        dt = derivations_service._to_dt("2024-01-01T12:30:00Z")
        assert dt is not None
        assert dt.tzinfo is not None
        assert dt.isoformat().startswith("2024-01-01T12:30:00")

    _run_logged_test(
        "test__to_dt_handles_iso_strings",
        "Ensures Firestore timestamp parser accepts ISO strings with Z suffix",
        "Unit",
        _assertions,
    )


def test__bucket_hour_formats_range():
    def _assertions():
        bucket = derivations_service._bucket_hour(datetime(2024, 1, 1, 15, 45))
        assert bucket == "15:00-15:59"

    _run_logged_test(
        "test__bucket_hour_formats_range",
        "Confirms hour bucketing helper returns readable ranges",
        "Unit",
        _assertions,
    )


def test_compute_rollup_from_allpoints_detects_stops():
    def _assertions():
        base = datetime(2024, 5, 1, 8, 0, tzinfo=timezone.utc)
        all_points = [
            {"lat": 0.0, "lng": 0.0, "timestamp": base.isoformat()},
            {"lat": 0.0005, "lng": 0.0005, "timestamp": (base + timedelta(minutes=6)).isoformat()},
            {"lat": 0.5, "lng": 0.5, "timestamp": (base + timedelta(minutes=12)).isoformat()},
            {"lat": 0.5004, "lng": 0.5004, "timestamp": (base + timedelta(minutes=20)).isoformat()},
        ]

        rollup = derivations_service.compute_rollup_from_allpoints(all_points)
        assert rollup["totalPoints"] == 4
        assert rollup["stopCount"] >= 1
        assert rollup["longestDwell"] is not None
        assert rollup["longestDwell"]["seconds"] >= 360

    _run_logged_test(
        "test_compute_rollup_from_allpoints_detects_stops",
        "Verifies stop clustering summarises extended stays accurately",
        "Unit",
        _assertions,
    )


def test_compute_rollup_from_allpoints_events_align_with_stops():
    def _assertions():
        base = datetime(2024, 6, 1, 8, 0, tzinfo=timezone.utc)
        all_points = [
            {"lat": 1.0, "lng": 1.0, "timestamp": base.isoformat()},
            {"lat": 1.0004, "lng": 1.0003, "timestamp": (base + timedelta(minutes=7)).isoformat()},
            {"lat": 2.0, "lng": 2.0, "timestamp": (base + timedelta(minutes=20)).isoformat()},
            {"lat": 2.0003, "lng": 2.0002, "timestamp": (base + timedelta(minutes=26)).isoformat()},
        ]
        rollup = derivations_service.compute_rollup_from_allpoints(all_points)
        assert rollup["stopCount"] == len(rollup["_events"])
        for event in rollup["_events"]:
            assert event["type"] == "stop"
            assert event["source"] == "derived-v1"
            assert event["dwellSeconds"] >= 360

    _run_logged_test(
        "test_compute_rollup_from_allpoints_events_align_with_stops",
        "Validates derived events mirror stop detection output",
        "Unit",
        _assertions,
    )


def test_compute_rollup_from_allpoints_flags_anomalies():
    def _assertions():
        start = datetime(2024, 5, 1, 9, 0, tzinfo=timezone.utc)
        all_points = [
            {"lat": 0.0, "lng": 0.0, "timestamp": start.isoformat()},
            {"lat": 0.0, "lng": 1.0, "timestamp": (start + timedelta(minutes=4)).isoformat()},
        ]

        rollup = derivations_service.compute_rollup_from_allpoints(all_points)
        assert rollup["totalPoints"] == 2
        assert rollup["stopCount"] == 0
        assert rollup["anomalies"], "Expected anomaly for rapid long-distance jump"
        anomaly = rollup["anomalies"][0]
        assert anomaly["type"] == "big_jump"
        assert int(anomaly["meters"]) > 10000

    _run_logged_test(
        "test_compute_rollup_from_allpoints_flags_anomalies",
        "Ensures sudden, long-distance jumps are reported as anomalies",
        "Unit",
        _assertions,
    )


def test_compute_rollup_from_allpoints_small_moves_have_no_anomalies():
    def _assertions():
        base = datetime(2024, 6, 2, 12, 0, tzinfo=timezone.utc)
        all_points = [
            {"lat": 10.0, "lng": 10.0, "timestamp": base.isoformat()},
            {"lat": 10.0001, "lng": 10.0002, "timestamp": (base + timedelta(minutes=3)).isoformat()},
            {"lat": 10.0002, "lng": 10.0001, "timestamp": (base + timedelta(minutes=5)).isoformat()},
        ]
        rollup = derivations_service.compute_rollup_from_allpoints(all_points)
        assert rollup["anomalies"] == []

    _run_logged_test(
        "test_compute_rollup_from_allpoints_small_moves_have_no_anomalies",
        "Ensures short-range movements within threshold are not flagged as anomalies",
        "Unit",
        _assertions,
    )


def test_compute_rollup_from_allpoints_with_invalid_points_returns_zero():
    def _assertions():
        all_points = [{"lat": None, "lng": 18.4}, {"lat": 10.0}, {}]
        rollup = derivations_service.compute_rollup_from_allpoints(all_points)
        assert rollup == {"totalPoints": 0}

    _run_logged_test(
        "test_compute_rollup_from_allpoints_with_invalid_points_returns_zero",
        "Confirms helper exits early when no valid geo-temporal samples exist",
        "Unit",
        _assertions,
    )


def test_compute_rollup_from_allpoints_limits_active_hours_to_top_six():
    def _assertions():
        base = datetime(2024, 6, 3, 0, 0, tzinfo=timezone.utc)
        all_points = []
        for hour in range(8):
            for n in range(hour + 1):
                all_points.append(
                    {
                        "lat": 0.0,
                        "lng": float(hour),
                        "timestamp": (base + timedelta(hours=hour, minutes=n)).isoformat(),
                    }
                )
        rollup = derivations_service.compute_rollup_from_allpoints(all_points)
        buckets = rollup["activeHoursBuckets"]
        assert len(buckets) <= 6
        assert buckets[0] == "07:00-07:59"

    _run_logged_test(
        "test_compute_rollup_from_allpoints_limits_active_hours_to_top_six",
        "Checks active hour summary trims to the six busiest windows",
        "Unit",
        _assertions,
    )


def _extract_cartographic_points(cartographic_degrees: Iterable[float]) -> List[Tuple[float, float, float, float]]:
    values = list(cartographic_degrees)
    return [tuple(values[i : i + 4]) for i in range(0, len(values), 4)]


def test_generate_czml_successful_path():
    def _assertions():
        start = datetime(2024, 5, 1, 10, 0, tzinfo=timezone.utc)
        points = [
            {"lat": -33.9, "lng": 18.4, "timestamp": start.isoformat()},
            {"lat": -33.91, "lng": 18.41, "timestamp": (start + timedelta(minutes=5)).isoformat()},
            {"lat": -33.92, "lng": 18.42, "timestamp": (start + timedelta(minutes=10)).isoformat()},
        ]
        czml = case_service.generate_czml("case-123", points)
        assert len(czml) == 2
        path_entity = czml[1]
        carto_points = _extract_cartographic_points(path_entity["position"]["cartographicDegrees"])
        assert len(carto_points) == 3
        assert carto_points[0][0] == 0
        assert carto_points[-1][1:3] == (18.42, -33.92)

    _run_logged_test(
        "test_generate_czml_successful_path",
        "Validates CZML path creation with three ordered samples",
        "Integration",
        _assertions,
    )


def test_generate_czml_ignores_invalid_timestamps():
    def _assertions():
        start = datetime(2024, 5, 1, 11, 0, tzinfo=timezone.utc)
        points = [
            {"lat": -33.9, "lng": 18.4, "timestamp": start.isoformat()},
            {"lat": -33.91, "lng": 18.41, "timestamp": ""},
            {"lat": -33.92, "lng": 18.42, "timestamp": (start + timedelta(minutes=10)).isoformat()},
            {"lat": -33.93, "lng": 18.43, "timestamp": None},
        ]
        czml = case_service.generate_czml("case-456", points)
        carto_points = _extract_cartographic_points(czml[1]["position"]["cartographicDegrees"])
        assert len(carto_points) == 2
        assert carto_points[0][0] == 0
        assert carto_points[-1][1:3] == (18.42, -33.92)

    _run_logged_test(
        "test_generate_czml_ignores_invalid_timestamps",
        "Ensures bad timestamps are skipped while valid ones render",
        "Integration",
        _assertions,
    )


def test_generate_czml_sets_epoch_to_first_timestamp():
    def _assertions():
        base = datetime(2024, 5, 2, 9, 0, tzinfo=timezone.utc)
        points = [
            {"lat": -34.0, "lng": 18.5, "timestamp": (base + timedelta(minutes=5)).isoformat()},
            {"lat": -34.1, "lng": 18.6, "timestamp": base.isoformat()},
            {"lat": -34.2, "lng": 18.7, "timestamp": (base + timedelta(minutes=15)).isoformat()},
        ]
        czml = case_service.generate_czml("case-epoch", points)
        expected_epoch = base.isoformat().replace("+00:00", "Z")
        assert czml[1]["position"]["epoch"] == expected_epoch
        assert czml[0]["clock"]["interval"].startswith(expected_epoch)

    _run_logged_test(
        "test_generate_czml_sets_epoch_to_first_timestamp",
        "Checks CZML epoch anchors to the earliest valid timestamp",
        "Integration",
        _assertions,
    )


def test_generate_czml_requires_minimum_points():
    def _assertions():
        start = datetime(2024, 5, 1, 12, 0, tzinfo=timezone.utc)
        points = [{"lat": -33.9, "lng": 18.4, "timestamp": start.isoformat()}]
        with pytest.raises(ValueError):
            case_service.generate_czml("case-789", points)

    _run_logged_test(
        "test_generate_czml_requires_minimum_points",
        "Confirms generator rejects traces with fewer than two valid samples",
        "Integration",
        _assertions,
    )


def test_generate_czml_preserves_chronological_order():
    def _assertions():
        base = datetime(2024, 5, 1, 13, 0, tzinfo=timezone.utc)
        points = [
            {"lat": -33.9, "lng": 18.4, "timestamp": (base + timedelta(minutes=10)).isoformat()},
            {"lat": -33.91, "lng": 18.41, "timestamp": base.isoformat()},
            {"lat": -33.92, "lng": 18.42, "timestamp": (base + timedelta(minutes=20)).isoformat()},
        ]
        czml = case_service.generate_czml("case-101", points)
        carto_points = _extract_cartographic_points(czml[1]["position"]["cartographicDegrees"])
        times = [entry[0] for entry in carto_points]
        assert times == sorted(times)
        assert times[0] == 0
        assert times[-1] == (20 * 60)

    _run_logged_test(
        "test_generate_czml_preserves_chronological_order",
        "Checks CZML cartographic samples are sorted by timestamp offsets",
        "Integration",
        _assertions,
    )


def test_generate_czml_raises_when_all_timestamps_invalid():
    def _assertions():
        points = [
            {"lat": -33.9, "lng": 18.4, "timestamp": ""},
            {"lat": -33.91, "lng": 18.41, "timestamp": None},
        ]
        with pytest.raises(ValueError):
            case_service.generate_czml("case-invalid", points)

    _run_logged_test(
        "test_generate_czml_raises_when_all_timestamps_invalid",
        "Ensures generator refuses traces with no usable timestamps",
        "Integration",
        _assertions,
    )
