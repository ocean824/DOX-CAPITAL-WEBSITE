"""Iteration 14 regression: Hermes Admin MCP (71 tools + activity + advance_deal) + mobile auth basics."""
import os
import pytest
import requests

BASE = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
ADMIN_EMAIL = "deptofx@proton.me"
ADMIN_PASSWORD = "DoxAdmin!2026"
UNDER_EMAIL = "underwriter@thedoxs.com"
UNDER_PASSWORD = "DoxUnder!2026"
CLIENT_EMAIL = "client.test@doxs.dev"
CLIENT_PASSWORD = "TestUser!2026"


# -------- shared helpers --------
def _login(email: str, password: str) -> str:
    r = requests.post(f"{BASE}/api/auth/login", json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, f"login {email} -> {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def admin_token():
    return _login(ADMIN_EMAIL, ADMIN_PASSWORD)


@pytest.fixture(scope="module")
def mcp_key(admin_token):
    r = requests.post(f"{BASE}/api/admin/mcp/key", headers={"Authorization": f"Bearer {admin_token}"}, timeout=15)
    assert r.status_code == 200, r.text
    key = r.json()["key"]
    assert key.startswith("dox_mcp_")
    yield key
    # cleanup
    requests.delete(f"{BASE}/api/admin/mcp/key", headers={"Authorization": f"Bearer {admin_token}"}, timeout=15)


# -------- Mobile-facing auth (same endpoints the Expo app hits) --------
class TestMobileAuth:
    def test_login_admin_valid(self):
        r = requests.post(f"{BASE}/api/auth/login",
                          json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert "access_token" in data and isinstance(data["access_token"], str)
        assert data["user"]["email"] == ADMIN_EMAIL
        assert data["user"]["role"] == "admin"

    def test_login_underwriter_valid(self):
        r = requests.post(f"{BASE}/api/auth/login",
                          json={"email": UNDER_EMAIL, "password": UNDER_PASSWORD}, timeout=15)
        assert r.status_code == 200
        assert r.json()["user"]["account_type"] == "underwriter"

    def test_login_client_valid(self):
        r = requests.post(f"{BASE}/api/auth/login",
                          json={"email": CLIENT_EMAIL, "password": CLIENT_PASSWORD}, timeout=15)
        assert r.status_code == 200
        assert r.json()["user"]["status"] == "approved"

    def test_login_invalid_returns_401(self):
        r = requests.post(f"{BASE}/api/auth/login",
                          json={"email": ADMIN_EMAIL, "password": "wrong-password"}, timeout=15)
        assert r.status_code == 401

    def test_auth_me_requires_bearer(self):
        token = _login(CLIENT_EMAIL, CLIENT_PASSWORD)
        r = requests.get(f"{BASE}/api/auth/me", headers={"Authorization": f"Bearer {token}"}, timeout=15)
        assert r.status_code == 200
        assert r.json()["email"] == CLIENT_EMAIL


# -------- Admin MCP meta endpoints --------
class TestAdminMcpMeta:
    def test_mcp_info_tool_count_71(self, admin_token):
        r = requests.get(f"{BASE}/api/admin/mcp",
                         headers={"Authorization": f"Bearer {admin_token}"}, timeout=15)
        assert r.status_code == 200
        tools = r.json().get("tools") or []
        assert len(tools) == 71, f"expected 71 MCP tools, got {len(tools)}"
        names = {t["name"] for t in tools}
        for required in {"advance_deal", "ws_list_threads", "ws_list_knowledge", "ws_create_meeting"}:
            assert required in names, f"missing MCP tool: {required}"

    def test_mcp_info_requires_admin(self):
        client_token = _login(CLIENT_EMAIL, CLIENT_PASSWORD)
        r = requests.get(f"{BASE}/api/admin/mcp",
                         headers={"Authorization": f"Bearer {client_token}"}, timeout=15)
        assert r.status_code in (401, 403)

    def test_mcp_key_generate_then_revoke(self, admin_token):
        r = requests.post(f"{BASE}/api/admin/mcp/key",
                          headers={"Authorization": f"Bearer {admin_token}"}, timeout=15)
        assert r.status_code == 200
        key = r.json()["key"]
        assert key.startswith("dox_mcp_")
        d = requests.delete(f"{BASE}/api/admin/mcp/key",
                            headers={"Authorization": f"Bearer {admin_token}"}, timeout=15)
        assert d.status_code == 200
        assert d.json().get("ok") is True


# -------- MCP JSON-RPC --------
class TestMcpRpc:
    def _rpc(self, mcp_key, method, params=None, mid=1):
        return requests.post(f"{BASE}/api/mcp",
                             headers={"Authorization": f"Bearer {mcp_key}",
                                      "Content-Type": "application/json"},
                             json={"jsonrpc": "2.0", "id": mid, "method": method,
                                   "params": params or {}}, timeout=30)

    def test_bad_bearer_rejected(self):
        r = requests.post(f"{BASE}/api/mcp",
                          headers={"Authorization": "Bearer dox_mcp_INVALID"},
                          json={"jsonrpc": "2.0", "id": 1, "method": "tools/list"}, timeout=15)
        assert r.status_code == 401

    def test_missing_bearer_rejected(self):
        r = requests.post(f"{BASE}/api/mcp",
                          json={"jsonrpc": "2.0", "id": 1, "method": "tools/list"}, timeout=15)
        assert r.status_code == 401

    def test_tools_list_contains_71_tools(self, mcp_key):
        r = self._rpc(mcp_key, "tools/list")
        assert r.status_code == 200
        tools = r.json()["result"]["tools"]
        assert len(tools) == 71
        names = {t["name"] for t in tools}
        assert "advance_deal" in names
        assert "ws_create_meeting" in names

    def test_ws_list_threads_tool_call(self, mcp_key):
        r = self._rpc(mcp_key, "tools/call",
                      {"name": "ws_list_threads", "arguments": {}})
        assert r.status_code == 200
        result = r.json()["result"]
        assert "content" in result
        # Must NOT be an MCP error payload
        assert not result.get("isError"), result

    def test_ws_list_knowledge_tool_call(self, mcp_key):
        r = self._rpc(mcp_key, "tools/call",
                      {"name": "ws_list_knowledge", "arguments": {}})
        assert r.status_code == 200
        assert not r.json()["result"].get("isError")

    def test_advance_deal_tool_registered(self, mcp_key):
        """advance_deal must exist in schema; invoking with a bogus client_id should return an isError payload (not crash)."""
        r = self._rpc(mcp_key, "tools/call",
                      {"name": "advance_deal",
                       "arguments": {"client_id": "nonexistent-client-TEST"}})
        assert r.status_code == 200
        body = r.json()
        assert "result" in body
        # Either successful handling or structured error — both OK, but response must be shape-correct
        assert "content" in body["result"]

    def test_unknown_tool_errors(self, mcp_key):
        r = self._rpc(mcp_key, "tools/call",
                      {"name": "does_not_exist", "arguments": {}})
        assert r.status_code == 200
        assert "error" in r.json()


# -------- MCP activity audit --------
class TestMcpActivity:
    def test_activity_logged_after_tool_call(self, admin_token, mcp_key):
        # fire a known tool
        requests.post(f"{BASE}/api/mcp",
                      headers={"Authorization": f"Bearer {mcp_key}"},
                      json={"jsonrpc": "2.0", "id": 99, "method": "tools/call",
                            "params": {"name": "ws_list_threads", "arguments": {}}},
                      timeout=20)
        r = requests.get(f"{BASE}/api/admin/mcp/activity?limit=50",
                         headers={"Authorization": f"Bearer {admin_token}"}, timeout=15)
        assert r.status_code == 200
        rows = r.json()
        assert isinstance(rows, list)
        assert len(rows) >= 1
        latest = rows[0]
        for key in ("tool", "status", "summary", "created_at"):
            assert key in latest, f"activity row missing {key}: {latest}"
        tools_logged = {r.get("tool") for r in rows[:10]}
        assert "ws_list_threads" in tools_logged

    def test_activity_requires_admin(self):
        token = _login(CLIENT_EMAIL, CLIENT_PASSWORD)
        r = requests.get(f"{BASE}/api/admin/mcp/activity",
                         headers={"Authorization": f"Bearer {token}"}, timeout=15)
        assert r.status_code in (401, 403)
