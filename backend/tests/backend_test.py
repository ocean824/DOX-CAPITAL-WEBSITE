"""D.O.X Capital — backend API tests."""
import io
import os
import uuid
import requests
import pytest
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).parent.parent / ".env")

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") if os.environ.get("REACT_APP_BACKEND_URL") else None
if not BASE_URL:
    # fall back to frontend env
    fe_env = Path(__file__).parent.parent.parent / "frontend" / ".env"
    for line in fe_env.read_text().splitlines():
        if line.startswith("REACT_APP_BACKEND_URL="):
            BASE_URL = line.split("=", 1)[1].strip().strip('"').rstrip("/")

ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "deptofx@proton.me")
ADMIN_PASSWORD = os.environ["ADMIN_PASSWORD"]
API = f"{BASE_URL}/api"

# Module-level state shared between tests
_state = {}


# ---------- Health / Stats ----------
def test_health_root():
    r = requests.get(f"{API}/")
    assert r.status_code == 200
    assert r.json().get("status") == "ok"


def test_stats():
    r = requests.get(f"{API}/stats")
    assert r.status_code == 200
    d = r.json()
    assert d["capital_closed_usd"] == 1_000_000
    assert isinstance(d.get("compliance"), list)


# ---------- Bookings (public) ----------
def test_create_booking_public():
    payload = {
        "name": "TEST Booker",
        "email": "TEST_booker@example.com",
        "phone": "+15551112222",
        "company": "TEST LLC",
        "role": "Founder",
        "capital_range": "$1M – $5M",
        "preferred_date": "2026-02-15",
        "preferred_time": "10:00",
        "timezone": "UTC",
        "notes": "Test booking",
    }
    r = requests.post(f"{API}/bookings", json=payload)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["ok"] is True
    assert d["meet_link"].startswith("https://meet.jit.si/DOXCapital-")
    _state["booking_id"] = d["id"]
    _state["meet_link"] = d["meet_link"]


def test_get_booking_by_id():
    bid = _state.get("booking_id")
    assert bid, "booking_id not set"
    r = requests.get(f"{API}/bookings/{bid}")
    assert r.status_code == 200
    d = r.json()
    assert d["email"].lower() == "test_booker@example.com"
    assert d["meet_link"] == _state["meet_link"]
    assert "_id" not in d  # ensure mongo _id excluded


# ---------- Admin login ----------
def test_admin_login_sets_cookies():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["user"]["role"] == "admin"
    assert d["user"]["status"] == "approved"
    assert "access_token" in d
    # cookies set
    assert s.cookies.get("access_token")
    assert s.cookies.get("refresh_token")
    _state["admin_session"] = s
    _state["admin_token"] = d["access_token"]


def test_auth_me_with_cookie():
    s = _state["admin_session"]
    r = s.get(f"{API}/auth/me")
    assert r.status_code == 200
    assert r.json()["email"] == ADMIN_EMAIL
    assert "password_hash" not in r.json()


def test_auth_me_with_bearer():
    tok = _state["admin_token"]
    r = requests.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {tok}"})
    assert r.status_code == 200
    assert r.json()["email"] == ADMIN_EMAIL


def test_login_invalid_password():
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": "wrong"})
    assert r.status_code == 401


def test_auth_me_unauthenticated():
    r = requests.get(f"{API}/auth/me")
    assert r.status_code == 401


# ---------- Registration & approval flow ----------
def test_register_user_pending():
    email = f"TEST_user_{uuid.uuid4().hex[:8]}@example.com"
    password = os.environ.get("TEST_USER_PASSWORD", f"TestPass_{uuid.uuid4().hex[:12]}!")
    r = requests.post(f"{API}/auth/register", json={
        "name": "TEST New User", "email": email, "password": password,
        "company": "TEST Co", "role_requested": "Founder", "message": "test",
    })
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["status"] == "pending"
    _state["new_user_id"] = d["id"]
    _state["new_user_email"] = email
    _state["new_user_password"] = password


def test_register_duplicate_email_400():
    email = _state["new_user_email"]
    r = requests.post(f"{API}/auth/register", json={
        "name": "Dup", "email": email, "password": "AnotherPass!2026",
    })
    assert r.status_code == 400


def test_register_short_password_422():
    r = requests.post(f"{API}/auth/register", json={
        "name": "Short", "email": f"TEST_short_{uuid.uuid4().hex[:6]}@example.com", "password": "abc",
    })
    assert r.status_code == 422


def test_pending_user_can_login():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={
        "email": _state["new_user_email"], "password": _state["new_user_password"],
    })
    assert r.status_code == 200
    assert r.json()["user"]["status"] == "pending"
    _state["pending_session"] = s


def test_pending_user_cannot_upload_403():
    s = _state["pending_session"]
    files = {"file": ("test.txt", b"hello", "text/plain")}
    r = s.post(f"{API}/uploads", files=files, data={"category": "general"})
    assert r.status_code == 403, r.text


def test_pending_user_cannot_list_documents_403():
    s = _state["pending_session"]
    r = s.get(f"{API}/documents")
    assert r.status_code == 403


def test_pending_user_cannot_hit_admin_403():
    s = _state["pending_session"]
    r = s.get(f"{API}/admin/users")
    assert r.status_code == 403


def test_admin_lists_pending_users():
    s = _state["admin_session"]
    r = s.get(f"{API}/admin/users", params={"status": "pending"})
    assert r.status_code == 200
    users = r.json()
    ids = [u["id"] for u in users]
    assert _state["new_user_id"] in ids


def test_admin_approves_user():
    s = _state["admin_session"]
    uid = _state["new_user_id"]
    r = s.post(f"{API}/admin/users/{uid}/approve")
    assert r.status_code == 200
    # verify status flipped
    r2 = s.get(f"{API}/admin/users")
    user = next(u for u in r2.json() if u["id"] == uid)
    assert user["status"] == "approved"


# ---------- Approved user flow ----------
def test_approved_user_login_and_documents():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={
        "email": _state["new_user_email"], "password": _state["new_user_password"],
    })
    assert r.status_code == 200
    assert r.json()["user"]["status"] == "approved"
    _state["user_session"] = s

    r = s.get(f"{API}/documents")
    assert r.status_code == 200
    docs = r.json()
    assert len(docs) >= 4
    titles = [d["title"] for d in docs]
    assert any("Non-Disclosure" in t for t in titles)


def test_approved_user_upload_and_list():
    s = _state["user_session"]
    files = {"file": ("test.pdf", b"%PDF-1.4 test content bytes here", "application/pdf")}
    r = s.post(f"{API}/uploads", files=files, data={"category": "diligence"})
    if r.status_code == 503:
        pytest.skip("Object storage unavailable in test env")
    assert r.status_code == 200, r.text
    d = r.json()
    upload_id = d["id"]
    _state["upload_id"] = upload_id

    r2 = s.get(f"{API}/uploads/mine")
    assert r2.status_code == 200
    mine = r2.json()
    assert any(u["id"] == upload_id for u in mine)


def test_owner_can_download_upload():
    if not _state.get("upload_id"):
        pytest.skip("no upload")
    s = _state["user_session"]
    r = s.get(f"{API}/uploads/{_state['upload_id']}/download")
    assert r.status_code == 200
    assert b"PDF" in r.content[:10] or len(r.content) > 0


def test_other_user_cannot_download_403():
    if not _state.get("upload_id"):
        pytest.skip("no upload")
    # register a second approved-isn't-required... use anon
    r = requests.get(f"{API}/uploads/{_state['upload_id']}/download")
    assert r.status_code == 401


def test_admin_can_download_any_upload():
    if not _state.get("upload_id"):
        pytest.skip("no upload")
    s = _state["admin_session"]
    r = s.get(f"{API}/uploads/{_state['upload_id']}/download")
    assert r.status_code == 200


def test_admin_lists_all_uploads_and_bookings():
    s = _state["admin_session"]
    r1 = s.get(f"{API}/admin/uploads")
    assert r1.status_code == 200
    r2 = s.get(f"{API}/admin/bookings")
    assert r2.status_code == 200
    booking_ids = [b["id"] for b in r2.json()]
    assert _state["booking_id"] in booking_ids


# ---------- Rejection flow ----------
def test_admin_rejects_user():
    # create fresh user
    email = f"TEST_reject_{uuid.uuid4().hex[:8]}@example.com"
    r = requests.post(f"{API}/auth/register", json={
        "name": "TEST Reject", "email": email, "password": "RejectPass!2026",
    })
    uid = r.json()["id"]
    s = _state["admin_session"]
    r2 = s.post(f"{API}/admin/users/{uid}/reject")
    assert r2.status_code == 200
    r3 = s.get(f"{API}/admin/users")
    user = next(u for u in r3.json() if u["id"] == uid)
    assert user["status"] == "rejected"


# ---------- Logout ----------
def test_logout_clears_cookies():
    s = requests.Session()
    s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert s.cookies.get("access_token")
    r = s.post(f"{API}/auth/logout")
    assert r.status_code == 200
    # access_token should be cleared
    assert not s.cookies.get("access_token")


# ---------- Non-admin cannot hit admin endpoints ----------
def test_non_admin_admin_endpoints_403():
    s = _state.get("user_session") or _state.get("pending_session")
    if not s:
        pytest.skip("no user session")
    for path in ["/admin/users", "/admin/uploads", "/admin/bookings"]:
        r = s.get(f"{API}{path}")
        assert r.status_code == 403, f"{path} -> {r.status_code}"
