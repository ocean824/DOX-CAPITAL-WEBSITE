"""Deal flow + roles backend tests (underwriter, partner, client, admin, assistant, messaging, scheduling)."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://dox-prescreen.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN = {"email": "deptofx@proton.me", "password": "DoxAdmin!2026"}
UNDERWRITER = {"email": "underwriter@thedoxs.com", "password": "DoxUnder!2026"}
PARTNER = {"email": "partner@thedoxs.com", "password": "DoxPartner!2026"}
CLIENT = {"email": "client@thedoxs.com", "password": "DoxClient!2026"}


def _login(email, password):
    last = None
    for _ in range(3):
        try:
            r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=45)
            if r.status_code == 200:
                data = r.json()
                assert "access_token" in data
                return data["access_token"], data.get("user", {})
            last = f"{r.status_code} {r.text}"
        except Exception as e:
            last = str(e)
    raise AssertionError(f"login failed for {email}: {last}")


def _h(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


# ---------- SESSION FIXTURES ----------
@pytest.fixture(scope="module")
def admin_token():
    tok, _ = _login(**ADMIN); return tok

@pytest.fixture(scope="module")
def underwriter_token():
    tok, _ = _login(**UNDERWRITER); return tok

@pytest.fixture(scope="module")
def partner_session():
    return _login(**PARTNER)

@pytest.fixture(scope="module")
def client_session():
    return _login(**CLIENT)


# ---------- AUTH / ROLES ----------
class TestAuth:
    def test_login_admin(self):
        tok, user = _login(**ADMIN)
        assert tok and user.get("role") == "admin"

    def test_login_underwriter(self):
        tok, user = _login(**UNDERWRITER)
        assert user.get("account_type") == "underwriter"
        assert user.get("status") == "approved"

    def test_login_partner(self):
        tok, user = _login(**PARTNER)
        assert user.get("account_type") == "partner"

    def test_login_client(self):
        tok, user = _login(**CLIENT)
        assert user.get("account_type") == "client"

    def test_login_bad_password(self):
        r = requests.post(f"{API}/auth/login",
                          json={"email": CLIENT["email"], "password": "wrong!!!"}, timeout=20)
        assert r.status_code in (400, 401, 403)


# ---------- PARTNER ----------
class TestPartner:
    def test_partner_me_referral(self, partner_session):
        tok, _ = partner_session
        r = requests.get(f"{API}/partner/me", headers=_h(tok), timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("referral_code") == "DOXVIP"

    def test_partner_clients_scoped(self, partner_session):
        tok, _ = partner_session
        r = requests.get(f"{API}/partner/clients", headers=_h(tok), timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data, list)
        # Should include ONLY assigned clients (Test Client); _prescreen_payload nests user info.
        emails = [(c.get("user") or {}).get("email") for c in data]
        assert CLIENT["email"] in emails, f"partner should see assigned client; got {emails}"
        for c in data:
            assert (c.get("user") or {}).get("email") != ADMIN["email"]

    def test_partner_cannot_access_unassigned_deal(self, partner_session, admin_token):
        tok, partner_user = partner_session
        # Find a user that is not the partner's assigned client (admin itself works)
        r = requests.get(f"{API}/admin/prescreen", headers=_h(admin_token), timeout=30)
        assert r.status_code == 200
        all_clients = r.json()
        # Pick one with no partner_id = partner's id -> try to access another client's deal.
        # Simplest: there is only one assigned (client@thedoxs.com); any other id should 403/404.
        assigned_r = requests.get(f"{API}/partner/clients", headers=_h(tok), timeout=20)
        assigned_ids = {c["user"]["id"] for c in assigned_r.json()}
        target = next((c for c in all_clients if c["user"]["id"] not in assigned_ids), None)
        if target is None:
            pytest.skip("No unassigned client in corpus to test negative access")
        r2 = requests.get(f"{API}/deals/{target['user']['id']}/messages", headers=_h(tok), timeout=20)
        assert r2.status_code in (403, 404), f"expected 403/404 got {r2.status_code}"


# ---------- UNDERWRITER ----------
class TestUnderwriter:
    def test_underwriter_lists_ready_plus(self, underwriter_token):
        r = requests.get(f"{API}/underwriter/deals", headers=_h(underwriter_token), timeout=30)
        assert r.status_code == 200, r.text
        deals = r.json()
        assert isinstance(deals, list)
        for d in deals:
            assert d.get("phase") in ("ready_to_underwrite", "in_underwriting", "approved", "declined"), \
                f"underwriter saw non-ready phase {d.get('phase')}"

    def test_phase_change_then_schedule(self, underwriter_token, client_session):
        client_tok, client_user = client_session
        client_id = client_user["id"]
        # 1) Force phase to in_underwriting via underwriter
        r = requests.put(f"{API}/underwriter/deals/{client_id}/phase",
                         headers=_h(underwriter_token),
                         json={"phase": "in_underwriting", "note": "test"}, timeout=20)
        assert r.status_code == 200, r.text
        state = r.json()
        assert state.get("phase") == "in_underwriting"
        # 2) Client should now be able to schedule
        s = requests.post(f"{API}/deals/{client_id}/meetings", headers=_h(client_tok),
                          json={"with_role": "underwriter", "preferred_date": "2026-07-01",
                                "preferred_time": "15:00", "timezone": "UTC",
                                "notes": "pytest booking"}, timeout=20)
        assert s.status_code == 200, s.text
        body = s.json()
        assert body.get("meet_link", "").startswith("https://meet.jit.si/")
        # 3) List meetings
        g = requests.get(f"{API}/deals/{client_id}/meetings", headers=_h(client_tok), timeout=20)
        assert g.status_code == 200
        assert any(m.get("meet_link") == body["meet_link"] for m in g.json())

    def test_underwriter_item_review(self, underwriter_token, client_session):
        _, client_user = client_session
        client_id = client_user["id"]
        # pick a known item id — borrower_application appears in every track
        r = requests.put(f"{API}/admin/prescreen/{client_id}/items/borrower_application",
                         headers=_h(underwriter_token),
                         json={"status": "verified", "note": "pytest review"}, timeout=20)
        assert r.status_code == 200, r.text


# ---------- SCHEDULING GATE (negative) ----------
class TestSchedulingGate:
    def test_blocked_before_ready(self, admin_token, client_session):
        _, client_user = client_session
        client_id = client_user["id"]
        # revert phase to intake by resetting readiness manually: admin cannot set 'intake' via underwriter route (regex blocks it).
        # Instead: create a brand new no-partner client, which starts intake, and try to schedule.
        # register a throwaway client:
        import uuid, time
        email = f"gatetest{int(time.time())}@doxs.dev"
        reg = requests.post(f"{API}/auth/register", json={
            "name": "Gate Test", "email": email, "password": "TestUser!2026",
            "company": "pytest", "account_type": "client"}, timeout=20)
        assert reg.status_code in (200, 201), reg.text
        # admin approves
        users = requests.get(f"{API}/admin/users?status=pending",
                             headers=_h(admin_token), timeout=20).json()
        uid = next((u["id"] for u in users if u["email"] == email), None)
        assert uid, f"could not find {email} in pending list"
        appr = requests.post(f"{API}/admin/users/{uid}/approve", headers=_h(admin_token), timeout=20)
        assert appr.status_code == 200
        # login as new client
        tok, user = _login(email, "TestUser!2026")
        # Try scheduling with intake phase -> expect 400
        s = requests.post(f"{API}/deals/{user['id']}/meetings", headers=_h(tok),
                          json={"with_role": "underwriter", "preferred_date": "2026-07-01",
                                "preferred_time": "15:00", "timezone": "UTC"}, timeout=20)
        assert s.status_code == 400, f"expected 400 for intake, got {s.status_code} {s.text}"


# ---------- MESSAGING ----------
class TestMessaging:
    def test_post_and_get_messages(self, client_session, underwriter_token):
        client_tok, client_user = client_session
        cid = client_user["id"]
        r = requests.post(f"{API}/deals/{cid}/messages", headers=_h(client_tok),
                          json={"body": "pytest message from client"}, timeout=20)
        assert r.status_code == 200, r.text
        msg = r.json()
        assert msg.get("body") == "pytest message from client"
        # list from underwriter side
        g = requests.get(f"{API}/deals/{cid}/messages", headers=_h(underwriter_token), timeout=20)
        assert g.status_code == 200
        bodies = [m.get("body") for m in g.json()]
        assert "pytest message from client" in bodies

    def test_outsider_cannot_message(self, admin_token):
        # Create fresh client-A and client-B and ensure client-A cannot message client-B deal.
        import time
        ts = int(time.time())
        emailA = f"outa{ts}@doxs.dev"
        emailB = f"outb{ts}@doxs.dev"
        for e in (emailA, emailB):
            r = requests.post(f"{API}/auth/register", json={
                "name": "Out Test", "email": e, "password": "TestUser!2026",
                "company": "pytest", "account_type": "client"}, timeout=20)
            assert r.status_code in (200, 201), r.text
        users = requests.get(f"{API}/admin/users?status=pending",
                             headers=_h(admin_token), timeout=20).json()
        idA = next((u["id"] for u in users if u["email"] == emailA), None)
        idB = next((u["id"] for u in users if u["email"] == emailB), None)
        assert idA and idB, f"could not find newly registered users in admin list of size {len(users)}"
        for uid in (idA, idB):
            requests.post(f"{API}/admin/users/{uid}/approve", headers=_h(admin_token), timeout=20)
        tokA, _ = _login(emailA, "TestUser!2026")
        r = requests.get(f"{API}/deals/{idB}/messages", headers=_h(tokA), timeout=20)
        assert r.status_code in (403, 404)


# ---------- ASSISTANT ----------
class TestAssistant:
    def test_assistant_chat(self, client_session):
        tok, _ = client_session
        r = requests.post(f"{API}/assistant/chat", headers=_h(tok),
                          json={"message": "What docs do I need for pre-screen?"}, timeout=60)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "session_id" in data and "reply" in data
        assert isinstance(data["reply"], str) and len(data["reply"]) > 0
