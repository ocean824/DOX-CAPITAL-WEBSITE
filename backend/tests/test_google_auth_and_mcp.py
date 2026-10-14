"""
Iteration 13 — Google OAuth bridge + Hermes Admin MCP backend tests.

Covers:
- POST /api/auth/google/exchange with invalid session_id -> 401
- POST /api/auth/google/complete validation (accepted_legal=false -> 422;
  missing pending_token -> 400; seeded valid pending token -> creates
  status=pending user with legal_acceptance.method=google_oauth)
- GET /api/admin/mcp admin returns {connected, endpoint, tools[14]}; non-admin 403
- POST /api/admin/mcp/key generates dox_mcp_ key, rotates (old deactivated)
- DELETE /api/admin/mcp/key revokes
- POST /api/mcp JSON-RPC: initialize, tools/list (14), tools/call list_users,
  get_site_status, list_deals; missing/bad bearer -> 401; after revoke -> 401
"""
import os
import subprocess
from datetime import datetime, timedelta, timezone

import pytest
import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")

ADMIN_EMAIL = "deptofx@proton.me"
ADMIN_PASSWORD = "DoxAdmin!2026"
CLIENT_EMAIL = "client@thedoxs.com"
CLIENT_PASSWORD = "DoxClient!2026"

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")

PENDING_TOKEN = "testtok_iter13_abc"
PENDING_EMAIL = "gtest_iter13@example.com"


# -- helpers ---------------------------------------------------------------

def _mongo_eval(js: str):
    """Run a snippet of JS via mongosh against our DB."""
    uri = MONGO_URL.rstrip("/")
    # Ensure the DB name is part of the URI so mongosh connects to the right DB
    if not uri.endswith("/" + DB_NAME):
        uri = f"{uri}/{DB_NAME}"
    cmd = ["mongosh", uri, "--quiet", "--eval", js]
    out = subprocess.run(cmd, capture_output=True, text=True, timeout=15)
    return out.stdout + out.stderr


def _login(email: str, password: str) -> requests.Session:
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password}, timeout=20)
    assert r.status_code == 200, f"login {email} failed: {r.status_code} {r.text}"
    return s


# -- fixtures --------------------------------------------------------------

@pytest.fixture(scope="session")
def admin_session():
    return _login(ADMIN_EMAIL, ADMIN_PASSWORD)


@pytest.fixture(scope="session")
def client_session():
    return _login(CLIENT_EMAIL, CLIENT_PASSWORD)


@pytest.fixture()
def seeded_pending_token():
    """Seed a Google-pending token row and clean up after."""
    # Clean any prior leftovers
    _mongo_eval(f'db.google_pending.deleteMany({{token:"{PENDING_TOKEN}"}})')
    _mongo_eval(f'db.users.deleteMany({{email:"{PENDING_EMAIL}"}})')
    future = (datetime.now(timezone.utc) + timedelta(minutes=15)).isoformat()
    now = datetime.now(timezone.utc).isoformat()
    js = (
        'db.google_pending.insertOne({'
        f'token:"{PENDING_TOKEN}",'
        f'email:"{PENDING_EMAIL}",'
        f'name:"G Test Iter13",'
        'picture:null,'
        f'created_at:"{now}",'
        f'expires_at:new Date("{future}")'
        '})'
    )
    _mongo_eval(js)
    yield PENDING_TOKEN
    # cleanup
    _mongo_eval(f'db.google_pending.deleteMany({{token:"{PENDING_TOKEN}"}})')
    _mongo_eval(f'db.users.deleteMany({{email:"{PENDING_EMAIL}"}})')


# ======================================================================
# Google OAuth bridge
# ======================================================================

class TestGoogleAuth:
    """Google OAuth exchange + complete flow."""

    def test_exchange_rejects_bogus_session(self):
        r = requests.post(
            f"{BASE_URL}/api/auth/google/exchange",
            json={"session_id": "bogusbogusbogus123"},
            timeout=20,
        )
        assert r.status_code == 401
        assert "verified" in r.text.lower() or "google" in r.text.lower()

    def test_complete_rejects_unaccepted_legal(self):
        r = requests.post(
            f"{BASE_URL}/api/auth/google/complete",
            json={"pending_token": "whatever", "accepted_legal": False},
            timeout=20,
        )
        assert r.status_code == 422

    def test_complete_missing_token_returns_400(self):
        r = requests.post(
            f"{BASE_URL}/api/auth/google/complete",
            json={"pending_token": "definitely_missing_xyz", "accepted_legal": True, "account_type": "client"},
            timeout=20,
        )
        assert r.status_code == 400
        assert "expired" in r.text.lower() or "sign in" in r.text.lower()

    def test_complete_with_seeded_token_creates_pending_user(self, seeded_pending_token):
        r = requests.post(
            f"{BASE_URL}/api/auth/google/complete",
            json={
                "pending_token": seeded_pending_token,
                "accepted_legal": True,
                "account_type": "client",
            },
            timeout=20,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["status"] == "pending"
        assert isinstance(data.get("id"), str) and len(data["id"]) > 0

        # Verify directly in mongo
        out = _mongo_eval(
            f'JSON.stringify(db.users.findOne({{email:"{PENDING_EMAIL}"}},'
            '{password_hash:0}))'
        )
        assert PENDING_EMAIL in out, out
        assert '"status":"pending"' in out.replace(" ", "")
        assert '"account_type":"client"' in out.replace(" ", "")
        assert '"method":"google_oauth"' in out.replace(" ", "")
        # google_pending must be consumed
        gp = _mongo_eval(f'db.google_pending.countDocuments({{token:"{seeded_pending_token}"}})')
        assert "0" in gp.strip().splitlines()[-1]


# ======================================================================
# Hermes Admin MCP – admin endpoints
# ======================================================================

class TestAdminMcpEndpoints:
    def test_admin_mcp_info_as_admin(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/admin/mcp", timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "connected" in data
        assert data["endpoint"].endswith("/api/mcp")
        assert isinstance(data["tools"], list)
        assert len(data["tools"]) == 14
        names = {t["name"] for t in data["tools"]}
        # Spot-check a few expected tools
        for n in ["list_users", "approve_user", "list_deals", "get_site_status",
                  "set_site_lock", "search_knowledge", "assistant_usage"]:
            assert n in names

    def test_admin_mcp_info_forbidden_for_non_admin(self, client_session):
        r = client_session.get(f"{BASE_URL}/api/admin/mcp", timeout=20)
        assert r.status_code == 403

    def test_admin_mcp_info_unauthenticated(self):
        r = requests.get(f"{BASE_URL}/api/admin/mcp", timeout=20)
        assert r.status_code in (401, 403)


# ======================================================================
# Hermes MCP – full key lifecycle + JSON-RPC
# ======================================================================

class TestMcpKeyLifecycleAndRpc:
    """One sequential flow: generate -> rotate -> use key -> revoke -> 401."""

    def test_full_lifecycle(self, admin_session):
        # 1) Generate key
        r = admin_session.post(f"{BASE_URL}/api/admin/mcp/key", timeout=20)
        assert r.status_code == 200, r.text
        key1 = r.json()["key"]
        assert key1.startswith("dox_mcp_")
        assert len(key1) > len("dox_mcp_") + 20

        # 2) Use JSON-RPC: initialize
        r = requests.post(
            f"{BASE_URL}/api/mcp",
            headers={"Authorization": f"Bearer {key1}"},
            json={"jsonrpc": "2.0", "id": 1, "method": "initialize"},
            timeout=20,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["jsonrpc"] == "2.0"
        assert body["result"]["serverInfo"]["name"] == "dox-hermes-admin"

        # 3) tools/list — must be 14
        r = requests.post(
            f"{BASE_URL}/api/mcp",
            headers={"Authorization": f"Bearer {key1}"},
            json={"jsonrpc": "2.0", "id": 2, "method": "tools/list"},
            timeout=20,
        )
        assert r.status_code == 200
        tools = r.json()["result"]["tools"]
        assert len(tools) == 14

        # 4) tools/call list_users
        r = requests.post(
            f"{BASE_URL}/api/mcp",
            headers={"Authorization": f"Bearer {key1}"},
            json={
                "jsonrpc": "2.0", "id": 3, "method": "tools/call",
                "params": {"name": "list_users", "arguments": {}},
            },
            timeout=30,
        )
        assert r.status_code == 200, r.text
        res = r.json()["result"]
        assert "content" in res and res["content"][0]["type"] == "text"

        # 5) tools/call get_site_status
        r = requests.post(
            f"{BASE_URL}/api/mcp",
            headers={"Authorization": f"Bearer {key1}"},
            json={
                "jsonrpc": "2.0", "id": 4, "method": "tools/call",
                "params": {"name": "get_site_status", "arguments": {}},
            },
            timeout=20,
        )
        assert r.status_code == 200
        assert "locked" in r.json()["result"]["content"][0]["text"]

        # 6) tools/call list_deals
        r = requests.post(
            f"{BASE_URL}/api/mcp",
            headers={"Authorization": f"Bearer {key1}"},
            json={
                "jsonrpc": "2.0", "id": 5, "method": "tools/call",
                "params": {"name": "list_deals", "arguments": {}},
            },
            timeout=30,
        )
        assert r.status_code == 200
        res = r.json()["result"]
        assert "content" in res

        # 7) Rotate: generate new key -> old is deactivated
        r = admin_session.post(f"{BASE_URL}/api/admin/mcp/key", timeout=20)
        assert r.status_code == 200
        key2 = r.json()["key"]
        assert key2.startswith("dox_mcp_")
        assert key2 != key1

        # Old key must now be invalid
        r = requests.post(
            f"{BASE_URL}/api/mcp",
            headers={"Authorization": f"Bearer {key1}"},
            json={"jsonrpc": "2.0", "id": 6, "method": "ping"},
            timeout=20,
        )
        assert r.status_code == 401, f"old key should be invalid, got {r.status_code}"

        # New key works
        r = requests.post(
            f"{BASE_URL}/api/mcp",
            headers={"Authorization": f"Bearer {key2}"},
            json={"jsonrpc": "2.0", "id": 7, "method": "ping"},
            timeout=20,
        )
        assert r.status_code == 200

        # 8) Missing bearer -> 401
        r = requests.post(
            f"{BASE_URL}/api/mcp",
            json={"jsonrpc": "2.0", "id": 8, "method": "ping"},
            timeout=20,
        )
        assert r.status_code == 401

        # 9) Bad bearer -> 401
        r = requests.post(
            f"{BASE_URL}/api/mcp",
            headers={"Authorization": "Bearer dox_mcp_totally_fake_key_xxxx"},
            json={"jsonrpc": "2.0", "id": 9, "method": "ping"},
            timeout=20,
        )
        assert r.status_code == 401

        # 10) Revoke
        r = admin_session.delete(f"{BASE_URL}/api/admin/mcp/key", timeout=20)
        assert r.status_code == 200
        assert r.json().get("ok") is True

        # 11) After revoke, key2 must also be invalid
        r = requests.post(
            f"{BASE_URL}/api/mcp",
            headers={"Authorization": f"Bearer {key2}"},
            json={"jsonrpc": "2.0", "id": 10, "method": "ping"},
            timeout=20,
        )
        assert r.status_code == 401

    def test_admin_mcp_key_generation_forbidden_for_client(self, client_session):
        r = client_session.post(f"{BASE_URL}/api/admin/mcp/key", timeout=20)
        assert r.status_code == 403
