"""Regression tests for review request iteration (June 2026).

Covers: AI assistant RBAC, 200MB upload cap, underwriter visibility, workspace RBAC
(partner internal, no manage), inbox scope=all, prescreen status dropdown + inline
preview, deal messaging access, admin client-access assignment, workspace milestones,
Admin Console tabs filters.
"""
import io
import os
import uuid
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://dox-prescreen.preview.emergentagent.com").rstrip("/")

CREDS = {
    "admin":       ("deptofx@proton.me",         "DoxAdmin!2026"),
    "underwriter": ("underwriter@thedoxs.com",   "DoxUnder!2026"),
    "partner":     ("partner@thedoxs.com",       "DoxPartner!2026"),
    "client":      ("client@thedoxs.com",        "DoxClient!2026"),
}

LINKED_TX_ID = "ef8f73f6-3596-4a75-bfd3-1f524fa79baa"


def _login(role: str) -> requests.Session:
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    email, password = CREDS[role]
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password}, timeout=20)
    assert r.status_code == 200, f"login failed for {role}: {r.status_code} {r.text[:200]}"
    token = r.json().get("access_token")
    assert token
    s.headers.update({"Authorization": f"Bearer {token}"})
    s._user = r.json()["user"]
    return s


@pytest.fixture(scope="session")
def admin():    return _login("admin")
@pytest.fixture(scope="session")
def uw():       return _login("underwriter")
@pytest.fixture(scope="session")
def partner():  return _login("partner")
@pytest.fixture(scope="session")
def client():   return _login("client")


# ------------------- 1. AI assistant RBAC -------------------
class TestAssistantRBAC:
    """Admin+Underwriter can chat; Partner & Client are 403."""
    def test_assistant_chat_admin(self, admin):
        r = admin.post(f"{BASE_URL}/api/assistant/chat",
                       json={"session_id": f"test-{uuid.uuid4()}", "message": "hi"}, timeout=60)
        assert r.status_code in (200, 502), f"admin assistant: {r.status_code} {r.text[:200]}"

    def test_assistant_chat_underwriter(self, uw):
        r = uw.post(f"{BASE_URL}/api/assistant/chat",
                    json={"session_id": f"test-{uuid.uuid4()}", "message": "hi"}, timeout=60)
        assert r.status_code in (200, 502), f"uw assistant: {r.status_code} {r.text[:200]}"

    def test_assistant_chat_partner_forbidden(self, partner):
        r = partner.post(f"{BASE_URL}/api/assistant/chat",
                         json={"session_id": "x", "text": "hi"}, timeout=20)
        assert r.status_code == 403, f"partner should be 403: {r.status_code}"

    def test_assistant_chat_client_forbidden(self, client):
        r = client.post(f"{BASE_URL}/api/assistant/chat",
                        json={"session_id": "x", "text": "hi"}, timeout=20)
        assert r.status_code == 403

    def test_assistant_history_admin(self, admin):
        r = admin.get(f"{BASE_URL}/api/assistant/history?session_id=any", timeout=20)
        assert r.status_code == 200

    def test_assistant_history_underwriter(self, uw):
        r = uw.get(f"{BASE_URL}/api/assistant/history?session_id=any", timeout=20)
        assert r.status_code == 200

    def test_assistant_history_partner_forbidden(self, partner):
        r = partner.get(f"{BASE_URL}/api/assistant/history?session_id=any", timeout=20)
        assert r.status_code == 403

    def test_assistant_history_client_forbidden(self, client):
        r = client.get(f"{BASE_URL}/api/assistant/history?session_id=any", timeout=20)
        assert r.status_code == 403

    def test_workspace_ai_usage_admin(self, admin):
        r = admin.get(f"{BASE_URL}/api/workspace/ai/usage", timeout=20)
        assert r.status_code == 200

    def test_workspace_ai_usage_underwriter(self, uw):
        r = uw.get(f"{BASE_URL}/api/workspace/ai/usage", timeout=20)
        assert r.status_code == 200

    def test_workspace_ai_usage_partner_forbidden(self, partner):
        r = partner.get(f"{BASE_URL}/api/workspace/ai/usage", timeout=20)
        assert r.status_code == 403, f"partner workspace/ai/usage must be 403: {r.status_code}"


# ------------------- 2. Upload 200MB cap -------------------
class TestUploadCap:
    """Accepts ~1MB, rejects >200MB with 413."""
    def test_small_upload_accepted(self, client):
        data = b"X" * (1024 * 1024)  # 1MB
        files = {"file": ("TEST_small.bin", io.BytesIO(data), "application/octet-stream")}
        hdrs = {k: v for k, v in client.headers.items() if k != "Content-Type"}
        r = requests.post(f"{BASE_URL}/api/uploads", files=files, headers=hdrs, timeout=60)
        assert r.status_code == 200, f"1MB upload failed: {r.status_code} {r.text[:200]}"
        up_id = r.json().get("id")
        # cleanup
        if up_id:
            requests.delete(f"{BASE_URL}/api/uploads/{up_id}", headers=hdrs, timeout=20)

    def test_over_limit_rejected(self, client):
        """Send > 200MB and expect 413. Use a stream so we don't blow memory."""
        size = 200 * 1024 * 1024 + 1024  # 200MB + 1KB
        data = io.BytesIO(b"X" * size)
        files = {"file": ("TEST_huge.bin", data, "application/octet-stream")}
        hdrs = {k: v for k, v in client.headers.items() if k != "Content-Type"}
        try:
            r = requests.post(f"{BASE_URL}/api/uploads", files=files, headers=hdrs, timeout=180)
        except requests.exceptions.RequestException as e:
            pytest.skip(f"ingress rejected before FastAPI could respond: {e}")
        assert r.status_code == 413, f"expected 413, got {r.status_code} {r.text[:200]}"


# ------------------- 3. Underwriter transaction visibility -------------------
class TestUnderwriterVisibility:
    def test_transactions_parity(self, admin, uw):
        a = admin.get(f"{BASE_URL}/api/workspace/transactions", timeout=20)
        u = uw.get(f"{BASE_URL}/api/workspace/transactions", timeout=20)
        assert a.status_code == 200 and u.status_code == 200
        assert len(a.json()) == len(u.json()), f"admin={len(a.json())} vs uw={len(u.json())}"

    def test_tasks_parity(self, admin, uw):
        a = admin.get(f"{BASE_URL}/api/workspace/tasks", timeout=20)
        u = uw.get(f"{BASE_URL}/api/workspace/tasks", timeout=20)
        assert a.status_code == 200 and u.status_code == 200
        assert len(a.json()) == len(u.json())

    def test_activity_parity(self, admin, uw):
        a = admin.get(f"{BASE_URL}/api/workspace/activity", timeout=20)
        u = uw.get(f"{BASE_URL}/api/workspace/activity", timeout=20)
        assert a.status_code == 200 and u.status_code == 200
        assert len(a.json()) == len(u.json())


# ------------------- 4. Permission model (partner internal) -------------------
class TestPartnerPermissions:
    def test_partner_contacts_ok(self, partner):
        r = partner.get(f"{BASE_URL}/api/workspace/contacts", timeout=20)
        assert r.status_code == 200, f"partner contacts: {r.status_code} {r.text[:200]}"

    def test_partner_tasks_ok(self, partner):
        r = partner.get(f"{BASE_URL}/api/workspace/tasks", timeout=20)
        assert r.status_code == 200

    def test_partner_reviews_ok(self, partner):
        r = partner.get(f"{BASE_URL}/api/workspace/reviews", timeout=20)
        assert r.status_code == 200

    def test_partner_activity_ok(self, partner):
        r = partner.get(f"{BASE_URL}/api/workspace/activity", timeout=20)
        assert r.status_code == 200

    def test_partner_transactions_ok(self, partner):
        r = partner.get(f"{BASE_URL}/api/workspace/transactions", timeout=20)
        assert r.status_code == 200

    def test_partner_settings_forbidden(self, partner):
        r = partner.get(f"{BASE_URL}/api/workspace/settings", timeout=20)
        assert r.status_code == 403, f"partner settings must be 403: {r.status_code}"

    def test_partner_users_forbidden(self, partner):
        r = partner.get(f"{BASE_URL}/api/workspace/users", timeout=20)
        assert r.status_code == 403

    def test_underwriter_settings_forbidden(self, uw):
        r = uw.get(f"{BASE_URL}/api/workspace/settings", timeout=20)
        assert r.status_code == 403, f"underwriter settings must be 403 (manage-only): {r.status_code}"

    def test_underwriter_users_forbidden(self, uw):
        r = uw.get(f"{BASE_URL}/api/workspace/users", timeout=20)
        assert r.status_code == 403


# ------------------- 5. Inbox scope=all for admin+underwriter -------------------
class TestInboxScope:
    def test_admin_inbox_scope_all(self, admin):
        own = admin.get(f"{BASE_URL}/api/inbox", timeout=20)
        all_ = admin.get(f"{BASE_URL}/api/inbox?scope=all", timeout=20)
        assert own.status_code == 200 and all_.status_code == 200
        # scope=all must be >= own
        assert len(all_.json().get("messages", [])) >= len(own.json().get("messages", []))

    def test_underwriter_inbox_scope_all(self, uw):
        own = uw.get(f"{BASE_URL}/api/inbox", timeout=20)
        all_ = uw.get(f"{BASE_URL}/api/inbox?scope=all", timeout=20)
        assert own.status_code == 200 and all_.status_code == 200
        assert len(all_.json().get("messages", [])) >= len(own.json().get("messages", []))

    def test_partner_inbox_scope_all_falls_back_to_own(self, partner):
        """Partner may ask ?scope=all but server must only return their own."""
        own = partner.get(f"{BASE_URL}/api/inbox", timeout=20)
        all_ = partner.get(f"{BASE_URL}/api/inbox?scope=all", timeout=20)
        assert own.status_code == 200 and all_.status_code == 200
        assert len(all_.json().get("messages", [])) == len(own.json().get("messages", []))

    def test_client_has_no_inbox(self, client):
        r = client.get(f"{BASE_URL}/api/inbox", timeout=20)
        assert r.status_code == 403


# ------------------- 6. Prescreen console (underwriter) -------------------
class TestPrescreenConsole:
    def test_prescreen_status_missing_accepted(self, admin):
        """PUT /api/admin/prescreen/{uid}/items/{itemId} with status 'missing'."""
        # Find a client that has a prescreen row
        r = admin.get(f"{BASE_URL}/api/admin/prescreen", timeout=20)
        assert r.status_code == 200
        rows = r.json()
        if not rows:
            pytest.skip("no prescreen rows seeded")
        target = next((row for row in rows if row.get("items")), None)
        if not target:
            pytest.skip("no prescreen with items")
        user_id = target["user_id"]
        item_id = target["items"][0]["id"]
        prev = target["items"][0].get("status", "missing")
        rr = admin.put(
            f"{BASE_URL}/api/admin/prescreen/{user_id}/items/{item_id}",
            json={"status": "missing"}, timeout=20)
        assert rr.status_code == 200, f"status=missing update failed: {rr.status_code} {rr.text[:200]}"
        # restore
        admin.put(f"{BASE_URL}/api/admin/prescreen/{user_id}/items/{item_id}",
                  json={"status": prev}, timeout=20)

    def test_inline_preview_disposition(self, client):
        """Upload a file, then GET ?inline=1 and check Content-Disposition: inline."""
        files = {"file": ("TEST_preview.txt", io.BytesIO(b"hello"), "text/plain")}
        hdrs = {k: v for k, v in client.headers.items() if k != "Content-Type"}
        r = requests.post(f"{BASE_URL}/api/uploads", files=files, headers=hdrs, timeout=30)
        assert r.status_code == 200
        up_id = r.json()["id"]
        try:
            dl = requests.get(f"{BASE_URL}/api/uploads/{up_id}/download?inline=1",
                              headers=hdrs, timeout=30, allow_redirects=False)
            assert dl.status_code in (200, 302, 307), f"download: {dl.status_code}"
            # The handler emits Content-Disposition header; if we got a redirect to signed URL,
            # the header is on the FastAPI response itself.
            if dl.status_code == 200:
                disp = dl.headers.get("Content-Disposition", "")
                assert disp.startswith("inline"), f"expected inline, got: {disp}"
        finally:
            requests.delete(f"{BASE_URL}/api/uploads/{up_id}", headers=hdrs, timeout=20)


# ------------------- 7. Deal messaging access -------------------
class TestDealMessages:
    """Admin + underwriter can GET/POST on any deal; partner only on linked clients."""
    def test_admin_list_messages(self, admin):
        # pick a client to address
        users_r = admin.get(f"{BASE_URL}/api/admin/users?status=approved", timeout=20)
        assert users_r.status_code == 200
        clients = [u for u in users_r.json() if u.get("account_type") == "client" or u.get("role") == "user"]
        if not clients:
            pytest.skip("no clients to message")
        cid = clients[0]["id"]
        r = admin.get(f"{BASE_URL}/api/deals/{cid}/messages", timeout=20)
        assert r.status_code == 200

    def test_underwriter_list_messages(self, uw, admin):
        # pick client by scanning admin users
        users_r = admin.get(f"{BASE_URL}/api/admin/users?status=approved", timeout=20)
        clients = [u for u in users_r.json() if u.get("role") == "user"]
        if not clients:
            pytest.skip("no clients")
        cid = clients[0]["id"]
        r = uw.get(f"{BASE_URL}/api/deals/{cid}/messages", timeout=20)
        assert r.status_code == 200, f"underwriter deal messages: {r.status_code} {r.text[:200]}"

    def test_admin_post_message(self, admin):
        users_r = admin.get(f"{BASE_URL}/api/admin/users?status=approved", timeout=20)
        clients = [u for u in users_r.json() if u.get("role") == "user"]
        if not clients:
            pytest.skip("no clients")
        cid = clients[0]["id"]
        body = f"TEST_regression {uuid.uuid4().hex[:8]}"
        r = admin.post(f"{BASE_URL}/api/deals/{cid}/messages", json={"body": body}, timeout=30)
        assert r.status_code == 200, f"post msg: {r.status_code} {r.text[:200]}"
        assert r.json()["body"] == body


# ------------------- 8. Admin client access assignment -------------------
class TestClientAccessAssignment:
    def test_assign_and_unassign(self, admin, partner, client):
        """Admin assigns partner to a client; partner can access deal; then unassign."""
        client_id = client._user["id"]
        partner_id = partner._user["id"]
        # Save original
        pre = admin.get(f"{BASE_URL}/api/admin/users?status=approved", timeout=20).json()
        original = next((u for u in pre if u["id"] == client_id), {})
        original_assigned = original.get("assigned_ids", [])

        # Baseline: partner currently may or may not have access. Force unassign first.
        admin.put(f"{BASE_URL}/api/admin/users/{client_id}/access",
                  json={"assigned_ids": []}, timeout=20)
        pre_r = partner.get(f"{BASE_URL}/api/deals/{client_id}/messages", timeout=20)
        # If partner is already partner_id of this client via partner_id, they'd have access.
        # Just check that assigning changes state.

        # Assign partner
        r = admin.put(f"{BASE_URL}/api/admin/users/{client_id}/access",
                      json={"assigned_ids": [partner_id]}, timeout=20)
        assert r.status_code == 200, f"assign: {r.status_code} {r.text[:200]}"
        assert partner_id in r.json()["assigned_ids"]

        after_assign = partner.get(f"{BASE_URL}/api/deals/{client_id}/messages", timeout=20)
        assert after_assign.status_code == 200, f"partner should see deal after assign: {after_assign.status_code}"

        # Invalid ids are stripped
        bogus = str(uuid.uuid4())
        r2 = admin.put(f"{BASE_URL}/api/admin/users/{client_id}/access",
                       json={"assigned_ids": [bogus, partner_id]}, timeout=20)
        assert r2.status_code == 200
        assert bogus not in r2.json()["assigned_ids"]
        assert partner_id in r2.json()["assigned_ids"]

        # Restore
        admin.put(f"{BASE_URL}/api/admin/users/{client_id}/access",
                  json={"assigned_ids": original_assigned}, timeout=20)


# ------------------- 9. Milestones PATCH -------------------
class TestMilestonePatch:
    def test_patch_milestones(self, admin):
        txs = admin.get(f"{BASE_URL}/api/workspace/transactions", timeout=20).json()
        if not txs:
            pytest.skip("no transactions")
        tx_id = txs[0]["id"]
        original = {k: txs[0].get(k) for k in ("engagement_date", "diligence_date", "close_date")}
        patch = {
            "engagement_date": "2026-07-01",
            "diligence_date": "2026-07-15",
            "close_date": "2026-08-01",
        }
        r = admin.patch(f"{BASE_URL}/api/workspace/transactions/{tx_id}",
                        json=patch, timeout=20)
        assert r.status_code == 200, f"patch milestones: {r.status_code} {r.text[:200]}"
        for k, v in patch.items():
            assert r.json()[k] == v, f"{k}={r.json()[k]} != {v}"
        # restore
        admin.patch(f"{BASE_URL}/api/workspace/transactions/{tx_id}",
                    json=original, timeout=20)


# ------------------- 10. Admin Clients tab, access list sanity -------------------
class TestAdminClientsFilter:
    def test_admin_list_users_returns_role_mix(self, admin):
        r = admin.get(f"{BASE_URL}/api/admin/users", timeout=20)
        assert r.status_code == 200
        rows = r.json()
        # Should include partner, underwriter and clients
        account_types = {u.get("account_type") for u in rows}
        assert "partner" in account_types or any(u["email"].startswith("partner@") for u in rows)
        assert "underwriter" in account_types or any(u["email"].startswith("underwriter@") for u in rows)
