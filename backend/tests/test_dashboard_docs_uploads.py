"""
Backend tests for the DashboardPage changes:
  (1) /api/documents must NOT return any investor questionnaire entry.
  (2) /api/uploads supports upload + list + download + delete (owner / 404 / cross-user 403).
"""
import io
import os
import re

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://dox-prescreen.preview.emergentagent.com").rstrip("/")

CLIENT_EMAIL = "client@thedoxs.com"
CLIENT_PASSWORD = "DoxClient!2026"
# a second approved client (no track) — used to test cross-user forbidden
OTHER_CLIENT_EMAIL = "notrack_1791832437@doxs.dev"
OTHER_CLIENT_PASSWORD = "TestUser!2026"
ADMIN_EMAIL = "deptofx@proton.me"
ADMIN_PASSWORD = "DoxAdmin!2026"


def _login(email: str, password: str) -> requests.Session:
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password}, timeout=20)
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text}"
    return s


@pytest.fixture(scope="module")
def client_session() -> requests.Session:
    return _login(CLIENT_EMAIL, CLIENT_PASSWORD)


@pytest.fixture(scope="module")
def other_session() -> requests.Session:
    try:
        return _login(OTHER_CLIENT_EMAIL, OTHER_CLIENT_PASSWORD)
    except AssertionError:
        pytest.skip("secondary client not available")


# ----------------------------------------------------------------- documents
def test_documents_does_not_contain_investor_questionnaire(client_session):
    r = client_session.get(f"{BASE_URL}/api/documents", timeout=20)
    assert r.status_code == 200
    docs = r.json()
    assert isinstance(docs, list) and len(docs) >= 3

    pat = re.compile(r"investor|questionnaire|ppm", re.I)
    for d in docs:
        combined = f"{d.get('id','')} {d.get('title','')} {d.get('description','')}"
        assert not pat.search(combined), f"investor/questionnaire entry still present: {d}"

    ids = {d["id"] for d in docs}
    # expected baseline set
    assert {"nda", "engagement", "kyc"}.issubset(ids), f"missing expected docs, got {ids}"


# ------------------------------------------------------------------- uploads
def test_upload_then_delete_then_gone_after_refresh(client_session):
    # UPLOAD
    content = b"%PDF-1.4\n%TEST upload for delete test\n%%EOF"
    files = {"file": ("TEST_delete_me.pdf", io.BytesIO(content), "application/pdf")}
    data = {"category": "general"}
    r = client_session.post(f"{BASE_URL}/api/uploads", files=files, data=data, timeout=30)
    assert r.status_code in (200, 201), f"upload failed: {r.status_code} {r.text}"
    created = r.json()
    assert created.get("id")
    assert created.get("filename") == "TEST_delete_me.pdf" or created.get("original_filename") == "TEST_delete_me.pdf"
    upload_id = created["id"]

    # LIST — must contain the new upload
    r = client_session.get(f"{BASE_URL}/api/uploads/mine", timeout=20)
    assert r.status_code == 200
    ids = {u["id"] for u in r.json()}
    assert upload_id in ids

    # DELETE
    r = client_session.delete(f"{BASE_URL}/api/uploads/{upload_id}", timeout=20)
    assert r.status_code == 200, f"delete failed: {r.status_code} {r.text}"
    assert r.json().get("ok") is True

    # LIST again — must NOT contain it (soft delete, filtered by is_deleted)
    r = client_session.get(f"{BASE_URL}/api/uploads/mine", timeout=20)
    assert r.status_code == 200
    ids_after = {u["id"] for u in r.json()}
    assert upload_id not in ids_after, "deleted upload still visible on /uploads/mine"

    # DELETE again — 404
    r = client_session.delete(f"{BASE_URL}/api/uploads/{upload_id}", timeout=20)
    assert r.status_code == 404


def test_delete_unknown_upload_returns_404(client_session):
    r = client_session.delete(f"{BASE_URL}/api/uploads/does-not-exist-xyz", timeout=20)
    assert r.status_code == 404
    body = r.json()
    assert "detail" in body


def test_cross_user_delete_is_forbidden(client_session, other_session):
    # client A uploads
    files = {"file": ("TEST_crossuser.pdf", io.BytesIO(b"%PDF-1.4\ncross\n%%EOF"), "application/pdf")}
    data = {"category": "general"}
    r = client_session.post(f"{BASE_URL}/api/uploads", files=files, data=data, timeout=30)
    assert r.status_code in (200, 201)
    upload_id = r.json()["id"]

    try:
        # client B tries to delete A's file → 403
        r = other_session.delete(f"{BASE_URL}/api/uploads/{upload_id}", timeout=20)
        assert r.status_code == 403, f"expected 403, got {r.status_code} {r.text}"

        # confirm A still sees it
        r = client_session.get(f"{BASE_URL}/api/uploads/mine", timeout=20)
        assert upload_id in {u["id"] for u in r.json()}
    finally:
        client_session.delete(f"{BASE_URL}/api/uploads/{upload_id}", timeout=20)


def test_download_endpoint_works_for_owner(client_session):
    files = {"file": ("TEST_download.pdf", io.BytesIO(b"%PDF-1.4\ndownload\n%%EOF"), "application/pdf")}
    data = {"category": "general"}
    r = client_session.post(f"{BASE_URL}/api/uploads", files=files, data=data, timeout=30)
    upload_id = r.json()["id"]
    try:
        r = client_session.get(f"{BASE_URL}/api/uploads/{upload_id}/download", timeout=30)
        assert r.status_code == 200
        assert r.content.startswith(b"%PDF")
    finally:
        client_session.delete(f"{BASE_URL}/api/uploads/{upload_id}", timeout=20)
