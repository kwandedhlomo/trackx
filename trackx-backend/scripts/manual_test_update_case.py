import asyncio
import os
import sys
import types

# Manually test update_case field inclusion without real Firestore

# Ensure backend package is importable
BASE_DIR = os.path.dirname(os.path.dirname(__file__))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

# Stub missing third-party modules minimally so import succeeds
if 'dotenv' not in sys.modules:
    m = types.ModuleType('dotenv')
    def _noop():
        return None
    m.load_dotenv = _noop
    sys.modules['dotenv'] = m

# google.cloud.firestore_v1 stubs
if 'google' not in sys.modules:
    sys.modules['google'] = types.ModuleType('google')
if 'google.cloud' not in sys.modules:
    sys.modules['google.cloud'] = types.ModuleType('google.cloud')
# Stub google.cloud.firestore (module form)
if 'google.cloud.firestore' not in sys.modules:
    gclf = types.ModuleType('google.cloud.firestore')
    class _Query:
        DESCENDING = 'DESC'
    gclf.Query = _Query
    sys.modules['google.cloud.firestore'] = gclf
    # attach to google.cloud package
    sys.modules['google.cloud'].firestore = gclf
# google.api_core stubs
if 'google.api_core' not in sys.modules:
    sys.modules['google.api_core'] = types.ModuleType('google.api_core')
if 'google.api_core.datetime_helpers' not in sys.modules:
    gah = types.ModuleType('google.api_core.datetime_helpers')
    class DatetimeWithNanoseconds(str):
        pass
    gah.DatetimeWithNanoseconds = DatetimeWithNanoseconds
    sys.modules['google.api_core.datetime_helpers'] = gah
if 'google.cloud.firestore_v1' not in sys.modules:
    gcf = types.ModuleType('google.cloud.firestore_v1')
    class _DocRef: ...
    gcf.DocumentReference = _DocRef
    gcf.SERVER_TIMESTAMP = object()
    sys.modules['google.cloud.firestore_v1'] = gcf

# firebase_admin stubs
if 'firebase_admin' not in sys.modules:
    fa = types.ModuleType('firebase_admin')
    fas = types.ModuleType('firebase_admin.firestore')
    fas.SERVER_TIMESTAMP = object()
    class _Client:
        def __init__(self):
            pass
    def client():
        return _Client()
    fas.client = client
    fa.firestore = fas
    sys.modules['firebase_admin'] = fa
    sys.modules['firebase_admin.firestore'] = fas

# openai stub if missing
if 'openai' not in sys.modules:
    oi = types.ModuleType('openai')
    class OpenAI:
        def __init__(self, *a, **k):
            pass
        class chat:
            class completions:
                @staticmethod
                def create(**kwargs):
                    class _Resp:
                        class _Msg:
                            content = ""
                        choices = [type('c', (), {'message': _Resp._Msg()})]
                    return _Resp()
    oi.OpenAI = OpenAI
    sys.modules['openai'] = oi

# pydantic stub if missing
if 'pydantic' not in sys.modules:
    pd = types.ModuleType('pydantic')
    class BaseModel:
        pass
    def Field(default=None, **kwargs):
        return default
    pd.BaseModel = BaseModel
    pd.Field = Field
    sys.modules['pydantic'] = pd

# pytz stub if missing
if 'pytz' not in sys.modules:
    pz = types.ModuleType('pytz')
    class _UTC:
        def __repr__(self):
            return 'UTC'
    pz.utc = _UTC()
    sys.modules['pytz'] = pz

# requests stub if missing
if 'requests' not in sys.modules:
    rq = types.ModuleType('requests')
    def _noop(*a, **k):
        class R:
            status_code = 200
            def json(self):
                return {}
        return R()
    rq.get = _noop
    rq.post = _noop
    sys.modules['requests'] = rq

# Stub firebase.firebase_config to avoid real initialization
if 'firebase.firebase_config' not in sys.modules:
    firebase_pkg = sys.modules.setdefault('firebase', types.ModuleType('firebase'))
    ff = types.ModuleType('firebase.firebase_config')
    ff.db = object()  # placeholder; we override case_service.db later
    sys.modules['firebase.firebase_config'] = ff

from services import case_service


class FakeDocSnapshot:
    def __init__(self, data):
        self._data = data
        self.id = "fake-doc-id"

    def to_dict(self):
        return dict(self._data)

    @property
    def exists(self):
        return True


class FakeDocRef:
    def __init__(self, initial_data):
        self.initial = dict(initial_data)
        self.updated = None

    def get(self):
        return FakeDocSnapshot(self.initial)

    def update(self, fields):
        self.updated = dict(fields)


class FakeCollection:
    def __init__(self, initial_data):
        self.ref = FakeDocRef(initial_data)

    def document(self, doc_id):
        return self.ref


class FakeDB:
    def __init__(self, initial_data):
        self._fake_collection = FakeCollection(initial_data)

    def collection(self, name):
        assert name == "cases"
        return self._fake_collection


async def main():
    # Prepare initial existing doc (legacy state)
    existing = {
        "caseTitle": "Old Title",
        "region": "Gauteng",
        "status": "not started",
    }

    # Inject fake db
    case_service.db = FakeDB(existing)

    # Incoming update simulating EditCase form (new region system)
    payload = {
        "doc_id": "fake-doc-id",
        "caseNumber": "CASE-001",
        "caseTitle": "New Title",
        "dateOfIncident": "2025-07-01",
        # region should mirror provinceName for legacy compatibility
        "region": "Gauteng - Pretoria",
        "provinceCode": "GT",
        "provinceName": "Gauteng - Pretoria",
        "districtCode": "TSH",
        "districtName": "Tshwane",
        "status": "in progress",
        "urgency": "high",
        "between": "08:00 - 10:00",
        # evidence in either naming
        "evidence_items": [{"id": "EV-1", "description": "Photo"}],
    }

    ok, msg = await case_service.update_case(payload)
    assert ok, f"update_case failed: {msg}"

    updated = case_service.db.collection("cases").ref.updated
    assert updated is not None, "No update call captured"

    # Validate inclusion of new fields
    for k in [
        "provinceCode",
        "provinceName",
        "districtCode",
        "districtName",
        "evidenceItems",
    ]:
        assert k in updated, f"Missing field in update: {k}"

    # Validate values wired through
    assert updated["provinceName"] == "Gauteng - Pretoria"
    assert updated["districtName"] == "Tshwane"
    assert isinstance(updated["evidenceItems"], list) and updated["evidenceItems"], "evidenceItems not set correctly"

    print("PASS: update_case includes region fields and evidenceItems correctly.")


if __name__ == "__main__":
    asyncio.run(main())
