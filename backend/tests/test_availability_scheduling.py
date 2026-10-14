"""Backend tests for staff availability + deal scheduling (invitations)."""
import os
from datetime import date, timedelta
import pytest
import requests

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or "https://dox-prescreen.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"
WS = f"{API}/workspace"

ADMIN = {"email": "deptofx@proton.me", "password": "DoxAdmin!2026"}
UNDERWRITER = {"email": "underwriter@thedoxs.com", "password": "DoxUnder!2026"}
PARTNER = {"email": "partner@thedoxs.com", "password": "DoxPartner!2026"}
CLIENT = {"email": "client@thedoxs.com", "password": "DoxClient!2026"}


def _login(creds):
    r = requests.post(f"{API}/auth/login", json=creds, timeout=45)
    assert r.status_code == 200, f"login {creds['email']}: {r.status_code} {r.text}"
    data = r.json()
    return data["access_token"], data.get("user", {})


def _h(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


# ---------- Fixtures ----------
@pytest.fixture(scope="module")
def admin_s():
    return _login(ADMIN)

@pytest.fixture(scope="module")
def under_s():
    return _login(UNDERWRITER)

@pytest.fixture(scope="module")
def partner_s():
    return _login(PARTNER)

@pytest.fixture(scope="module")
def client_s():
    return _login(CLIENT)


def _next_weekday(target_wd):
    """target_wd: Mon=0..Sun=6; returns next date (not today) with that weekday."""
    today = date.today()
    for i in range(1, 10):
        d = today + timedelta(days=i)
        if d.weekday() == target_wd:
            return d.isoformat()
    return (today + timedelta(days=7)).isoformat()


# ---------- Availability endpoint ----------
class TestAvailability:
    def test_get_default_as_admin(self, admin_s):
        tok, _ = admin_s
        r = requests.get(f"{WS}/availability", headers=_h(tok), timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "weekly" in data and "slot_minutes" in data
        # Mon-Fri default on
        for d in ("1", "2", "3", "4", "5"):
            assert data["weekly"][d]["on"] is True

    def test_client_get_forbidden(self, client_s):
        tok, _ = client_s
        r = requests.get(f"{WS}/availability", headers=_h(tok), timeout=30)
        assert r.status_code == 403, r.text

    def test_client_put_forbidden(self, client_s):
        tok, _ = client_s
        payload = {"weekly": {str(i): {"on": True, "start": "09:00", "end": "17:00"} for i in range(7)},
                   "blocked_dates": [], "slot_minutes": 30, "timezone": "UTC"}
        r = requests.put(f"{WS}/availability", headers=_h(tok), json=payload, timeout=30)
        assert r.status_code == 403, r.text

    def test_underwriter_can_save(self, under_s):
        tok, _ = under_s
        payload = {"weekly": {str(i): {"on": i in (1, 2, 3, 4, 5), "start": "09:00", "end": "17:00"} for i in range(7)},
                   "blocked_dates": [], "slot_minutes": 30, "timezone": "UTC"}
        r = requests.put(f"{WS}/availability", headers=_h(tok), json=payload, timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["slot_minutes"] == 30
        assert d.get("updated_at")

    def test_admin_save_and_reload(self, admin_s):
        tok, _ = admin_s
        blocked = "2026-07-04"
        payload = {"weekly": {str(i): {"on": i in (1, 2, 3, 4, 5), "start": "09:00", "end": "17:00"} for i in range(7)},
                   "blocked_dates": [blocked], "slot_minutes": 30, "timezone": "UTC"}
        r = requests.put(f"{WS}/availability", headers=_h(tok), json=payload, timeout=30)
        assert r.status_code == 200, r.text
        # Reload and verify persisted
        g = requests.get(f"{WS}/availability", headers=_h(tok), timeout=30)
        assert g.status_code == 200
        d = g.json()
        assert blocked in d["blocked_dates"]
        assert d["weekly"]["1"]["start"] == "09:00"
        assert d["slot_minutes"] == 30


# ---------- Deal team + slots + booking ----------
class TestDealScheduling:
    @pytest.fixture(scope="class")
    def client_id(self, client_s):
        _, user = client_s
        return user["id"]

    def test_team_lists_people(self, admin_s, client_id):
        tok, _ = admin_s
        r = requests.get(f"{API}/deals/{client_id}/team", headers=_h(tok), timeout=30)
        assert r.status_code == 200, r.text
        people = r.json()
        assert isinstance(people, list) and len(people) >= 1
        # Admin must be in team
        roles = {p.get("role") for p in people}
        assert "admin" in roles
        # has_availability flag present
        for p in people:
            assert "has_availability" in p and "id" in p

    def test_slots_common_for_admin(self, admin_s, client_id):
        tok, admin_user = admin_s
        # Pick next Monday (weekday 0 python)
        d = _next_weekday(0)
        r = requests.get(f"{API}/deals/{client_id}/slots",
                         params={"date": d, "person_ids": admin_user["id"]},
                         headers=_h(tok), timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        # 09:00-17:00 slot 30 => 16 slots (09:00..16:30)
        assert data["unconstrained"] is False
        assert len(data["slots"]) == 16, data
        assert "09:00" in data["slots"]
        assert "16:30" in data["slots"]

    def test_slots_unconstrained_when_no_availability(self, admin_s, client_id):
        """If selected person has no availability -> unconstrained true, slots []."""
        tok, _ = admin_s
        # fake id with no availability
        r = requests.get(f"{API}/deals/{client_id}/slots",
                         params={"date": _next_weekday(0), "person_ids": "nonexistent-id-xyz"},
                         headers=_h(tok), timeout=30)
        assert r.status_code == 200, r.text
        assert r.json()["unconstrained"] is True

    def test_book_valid_time_as_client(self, client_s, admin_s, client_id):
        """Client books with admin at a valid time (admin has 09-17 Mon-Fri)."""
        ctok, _ = client_s
        _, admin_user = admin_s
        d = _next_weekday(0)
        r = requests.post(f"{API}/deals/{client_id}/meetings", headers=_h(ctok),
                          json={"preferred_date": d, "preferred_time": "10:00",
                                "participant_ids": [admin_user["id"]], "timezone": "UTC",
                                "notes": "TEST_valid"}, timeout=45)
        # 403 if docs not approved for client-self; else should be 200
        assert r.status_code in (200, 403), r.text
        if r.status_code == 403:
            pytest.skip("Client not past doc verification; use admin perspective below.")

    def test_book_outside_hours_409(self, admin_s, client_id):
        """Admin books on behalf: 20:00 should be rejected (outside 09-17)."""
        tok, admin_user = admin_s
        d = _next_weekday(0)
        r = requests.post(f"{API}/deals/{client_id}/meetings", headers=_h(tok),
                          json={"preferred_date": d, "preferred_time": "20:00",
                                "participant_ids": [admin_user["id"]], "timezone": "UTC",
                                "notes": "TEST_out"}, timeout=45)
        assert r.status_code == 409, f"expected 409 got {r.status_code}: {r.text}"

    def test_book_blocked_date_409(self, admin_s, client_id):
        tok, admin_user = admin_s
        r = requests.post(f"{API}/deals/{client_id}/meetings", headers=_h(tok),
                          json={"preferred_date": "2026-07-04", "preferred_time": "10:00",
                                "participant_ids": [admin_user["id"]], "timezone": "UTC",
                                "notes": "TEST_blocked"}, timeout=45)
        assert r.status_code == 409, f"expected 409 got {r.status_code}: {r.text}"


# ---------- Regression: workspace meeting respond ----------
class TestMeetingRespond:
    def test_meetings_list_as_admin(self, admin_s):
        tok, _ = admin_s
        r = requests.get(f"{WS}/meetings", headers=_h(tok), timeout=30)
        assert r.status_code == 200, r.text
        assert isinstance(r.json(), list)

    def test_meeting_respond_regression(self, admin_s, under_s):
        """Create ws meeting as admin inviting underwriter, then underwriter responds."""
        atok, admin_user = admin_s
        utok, under_user = under_s
        # need a transaction
        txs = requests.get(f"{WS}/transactions", headers=_h(atok), timeout=30)
        assert txs.status_code == 200
        tx_list = txs.json()
        if not tx_list:
            pytest.skip("No transactions available")
        tx_id = tx_list[0]["id"]
        # may need to assign underwriter; check assigned_ids
        tx = tx_list[0]
        if under_user["id"] not in tx.get("assigned_ids", []) and under_user["id"] not in tx.get("client_ids", []):
            # try to patch assigned
            pr = requests.patch(f"{WS}/transactions/{tx_id}", headers=_h(atok),
                                json={"assigned_ids": list(set(tx.get("assigned_ids", []) + [under_user["id"]]))},
                                timeout=30)
            if pr.status_code not in (200, 204):
                pytest.skip(f"cannot modify tx assigned_ids: {pr.status_code}")
        future = (date.today() + timedelta(days=14)).isoformat()
        payload = {"transaction_id": tx_id, "title": "TEST_regression_meeting",
                   "starts_at": f"{future}T10:00", "duration_minutes": 30,
                   "location": "", "notes": "", "participant_ids": [under_user["id"]]}
        r = requests.post(f"{WS}/meetings", headers=_h(atok), json=payload, timeout=45)
        assert r.status_code == 201, r.text
        mid = r.json()["id"]
        # underwriter accepts
        resp = requests.post(f"{WS}/meetings/{mid}/respond", headers=_h(utok),
                             json={"response": "accepted"}, timeout=30)
        assert resp.status_code == 200, resp.text
        assert resp.json()["responses"][under_user["id"]] == "accepted"
        # cleanup: cancel
        requests.delete(f"{WS}/meetings/{mid}", headers=_h(atok), timeout=30)
