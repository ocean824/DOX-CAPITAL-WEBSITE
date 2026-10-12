"""D.O.X Workspace — backend API tests for the DEAL-AGNOSTIC rename and new SOP/settings features.

Covers:
- New field names on TransactionIn (title, location, value, deal_type, counterparty_id, deal_lead,
  engagement_date, diligence_date, close_date)
- settings-driven deal_types + checklist_template + required_documents
- date-order and deal-type validation (422)
- 8-step auto-task template from settings
- /api/workspace/deal-config available to every role
- Knowledge trust='sop' badge counter and PATCH trust change
- CSRF origin allowlist (browser Origin header matches request Host)
- Role scoping (OWNER / TEAM_MEMBER / CLIENT) and workspace gate for pending user
"""
import io
import os
import uuid
import requests
import pytest
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env")

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL")
if not BASE_URL:
    fe = Path(__file__).parent.parent.parent / "frontend" / ".env"
    for line in fe.read_text().splitlines():
        if line.startswith("REACT_APP_BACKEND_URL="):
            BASE_URL = line.split("=", 1)[1].strip()
BASE_URL = BASE_URL.rstrip("/")
API = f"{BASE_URL}/api"
WS = f"{API}/workspace"

OWNER = ("deptofx@proton.me", os.environ.get("ADMIN_PASSWORD", "DoxAdmin!2026"))
STAFF = ("staff.test@doxs.dev", "TestUser!2026")
CLIENT = ("client.test@doxs.dev", "TestUser!2026")


def _login(email, password):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=20)
    assert r.status_code == 200, f"login {email} -> {r.status_code} {r.text}"
    return s


@pytest.fixture(scope="module")
def owner(): return _login(*OWNER)
@pytest.fixture(scope="module")
def staff(): return _login(*STAFF)
@pytest.fixture(scope="module")
def client(): return _login(*CLIENT)


@pytest.fixture(scope="module")
def ids(owner, staff, client):
    return {
        "owner": owner.get(f"{WS}/auth/me").json()["id"],
        "staff": staff.get(f"{WS}/auth/me").json()["id"],
        "client": client.get(f"{WS}/auth/me").json()["id"],
    }


# ---------- Role mapping ----------
def test_me_owner(owner): assert owner.get(f"{WS}/auth/me").json()["role"] == "OWNER"
def test_me_staff(staff): assert staff.get(f"{WS}/auth/me").json()["role"] == "TEAM_MEMBER"
def test_me_client(client): assert client.get(f"{WS}/auth/me").json()["role"] == "CLIENT"
def test_me_unauth(): assert requests.get(f"{WS}/auth/me").status_code == 401


# ---------- /deal-config available to all signed-in roles ----------
@pytest.mark.parametrize("role", ["owner", "staff", "client"])
def test_deal_config_visible(request, role):
    sess = request.getfixturevalue(role)
    r = sess.get(f"{WS}/deal-config")
    assert r.status_code == 200, r.text
    body = r.json()
    assert isinstance(body.get("deal_types"), list) and len(body["deal_types"]) >= 1
    assert isinstance(body.get("checklist_template"), list) and len(body["checklist_template"]) >= 1
    assert "required_documents" in body
    step = body["checklist_template"][0]
    assert "title" in step and "offset_days" in step


# ---------- CSRF origin check (fixed): browser POST with matching Origin succeeds ----------
def test_browser_origin_post_allowed(owner, ids):
    origin = BASE_URL  # same as REACT_APP_BACKEND_URL
    r = owner.post(f"{WS}/contacts",
                   headers={"Origin": origin},
                   json={
                       "name": f"TEST Counterparty {uuid.uuid4().hex[:4]}",
                       "email": f"TEST_cp_{uuid.uuid4().hex[:6]}@doxs.dev",
                       "phone": "", "type": "counterparty", "company": "",
                       "tags": [], "notes": "", "assigned_ids": [ids["owner"]],
                   })
    assert r.status_code == 201, f"expected 201, got {r.status_code} {r.text[:300]}"
    pytest.counterparty_id = r.json()["id"]


def test_cross_origin_post_rejected(owner, ids):
    r = owner.post(f"{WS}/contacts",
                   headers={"Origin": "https://attacker.example.com"},
                   json={"name": "TEST Bad", "email": "TEST_bad@doxs.dev",
                         "phone": "", "type": "counterparty", "company": "",
                         "tags": [], "notes": "", "assigned_ids": [ids["owner"]]})
    assert r.status_code == 403, f"expected 403 origin rejection, got {r.status_code}"


# ---------- Deal creation with new field names + 8 checklist tasks ----------
def _deal_payload(ids, **overrides):
    base = {
        "title": f"TEST Deal {uuid.uuid4().hex[:6]}",
        "location": "Miami, FL",
        "value": 2500000,
        "deal_type": "Underwriting",
        "stage_id": "lead",
        "counterparty_id": getattr(pytest, "counterparty_id", None),
        "deal_lead": "Alex Lead",
        "engagement_date": "2026-02-01",
        "diligence_date": "2026-02-20",
        "close_date": "2026-03-15",
        "assigned_ids": [ids["staff"]],
        "client_ids": [ids["client"]],
        "image_url": "",
    }
    base.update(overrides)
    return base


def test_create_deal_new_fields_and_8_tasks(owner, ids):
    r = owner.post(f"{WS}/transactions", json=_deal_payload(ids))
    assert r.status_code == 201, r.text
    tx = r.json()
    pytest.tx_id = tx["id"]
    assert tx["title"].startswith("TEST Deal")
    assert tx["deal_type"] == "Underwriting"
    assert tx["engagement_date"] == "2026-02-01"
    assert tx["diligence_date"] == "2026-02-20"
    assert tx["close_date"] == "2026-03-15"
    assert tx["review_status"] == "not_submitted"
    assert isinstance(tx["required_documents"], list) and tx["required_documents"]
    # 8 auto tasks from checklist_template
    t = owner.get(f"{WS}/transactions/{tx['id']}/tasks").json()
    assert len(t) == 8, f"expected 8 auto tasks, got {len(t)}"
    # due dates offset from engagement_date; first task before last
    dates = sorted([step["due_date"] for step in t])
    assert dates[0] >= "2026-02-01"


def test_create_deal_rejects_unknown_deal_type(owner, ids):
    r = owner.post(f"{WS}/transactions", json=_deal_payload(ids, deal_type="NotARealType"))
    assert r.status_code == 422, f"expected 422 unknown deal_type, got {r.status_code} {r.text[:200]}"


def test_create_deal_rejects_out_of_order_dates(owner, ids):
    r = owner.post(f"{WS}/transactions", json=_deal_payload(
        ids, engagement_date="2026-05-01", diligence_date="2026-04-01", close_date="2026-03-01"))
    assert r.status_code == 422


# ---------- Patch close_date validates order ----------
def test_patch_close_date_before_diligence_rejected(owner):
    r = owner.patch(f"{WS}/transactions/{pytest.tx_id}", json={"close_date": "2026-01-01"})
    assert r.status_code == 422


# ---------- settings PUT: add a deal type + extend checklist + required docs ----------
def test_settings_add_deal_type_and_checklist(owner, ids):
    cur = owner.get(f"{WS}/settings").json()
    cur.pop("id", None)
    new_type = f"TESTType{uuid.uuid4().hex[:4]}"
    cur["deal_types"] = list(set(cur["deal_types"] + [new_type]))
    cur["checklist_template"] = cur["checklist_template"] + [
        {"title": "TEST extra step", "offset_days": 35}
    ]
    cur["required_documents"] = list(cur["required_documents"]) + ["TEST Doc Category"]
    r = owner.put(f"{WS}/settings", json=cur)
    assert r.status_code == 200, r.text
    body = r.json()
    assert new_type in body["deal_types"]
    assert any(s["title"] == "TEST extra step" for s in body["checklist_template"])
    assert "TEST Doc Category" in body["required_documents"]
    pytest.new_deal_type = new_type

    # new deal with the newly added deal_type picks up extended template + required docs
    r2 = owner.post(f"{WS}/transactions", json=_deal_payload(
        ids, title=f"TEST Deal2 {uuid.uuid4().hex[:4]}", deal_type=new_type))
    assert r2.status_code == 201, r2.text
    tx2 = r2.json()
    pytest.tx2_id = tx2["id"]
    assert "TEST Doc Category" in tx2["required_documents"]
    tasks2 = owner.get(f"{WS}/transactions/{tx2['id']}/tasks").json()
    assert len(tasks2) == len(body["checklist_template"]) >= 9


# ---------- Knowledge: SOP trust badge + patch trust ----------
def test_owner_uploads_sop_item_and_toggles_trust(owner):
    fname = f"TEST_sop_{uuid.uuid4().hex[:6]}.md"
    files = [("files", (fname, b"# TEST SOP\nStep 1: do this.\nStep 2: do that.", "text/markdown"))]
    r = owner.post(f"{WS}/knowledge/upload", files=files,
                   data={"scope": "shared", "trust": "sop"})
    assert r.status_code == 200, r.text
    assert r.json()["created"] + r.json()["updated"] + r.json()["unchanged"] >= 1
    # find the item
    items = owner.get(f"{WS}/knowledge/items").json()
    sop_item = next((i for i in items if i["path"].endswith(fname)), None)
    assert sop_item, "uploaded SOP not visible in knowledge/items"
    assert sop_item["trust"] == "sop"
    pytest.sop_id = sop_item["id"]
    # Patch to reference
    pr = owner.patch(f"{WS}/knowledge/items/{sop_item['id']}", json={"trust": "reference"})
    assert pr.status_code == 200, pr.text
    assert pr.json()["trust"] == "reference"
    # Patch back to sop so it still appears for later tests
    owner.patch(f"{WS}/knowledge/items/{sop_item['id']}", json={"trust": "sop"})


# ---------- Grant uses deal_types ----------
def test_grant_with_deal_types(owner, ids):
    r = owner.post(f"{WS}/knowledge/grants", json={
        "user_id": ids["staff"],
        "scope": "project",
        "path_prefix": "",
        "deal_types": ["Underwriting"],
        "note": "TEST grant",
    })
    assert r.status_code == 201, r.text
    assert "Underwriting" in r.json()["deal_types"]
    pytest.grant_id = r.json()["id"]


def test_grant_requires_deal_types_when_project_scope(owner, ids):
    r = owner.post(f"{WS}/knowledge/grants", json={
        "user_id": ids["staff"], "scope": "project",
        "path_prefix": "", "deal_types": [], "note": "TEST bad",
    })
    assert r.status_code == 422


# ---------- Deal-agnostic schema: ContactType client/counterparty/partner/advisor ----------
def test_contact_counterparty_type(owner, ids):
    r = owner.post(f"{WS}/contacts", json={
        "name": "TEST Partner",
        "email": f"TEST_partner_{uuid.uuid4().hex[:5]}@doxs.dev",
        "phone": "", "type": "partner", "company": "",
        "tags": [], "notes": "", "assigned_ids": [ids["owner"]],
    })
    assert r.status_code == 201, r.text
    assert r.json()["type"] == "partner"


def test_contact_rejects_legacy_buyer_type(owner, ids):
    r = owner.post(f"{WS}/contacts", json={
        "name": "TEST Legacy Buyer",
        "email": f"TEST_lb_{uuid.uuid4().hex[:5]}@doxs.dev",
        "phone": "", "type": "buyer", "company": "",
        "tags": [], "notes": "", "assigned_ids": [ids["owner"]],
    })
    assert r.status_code == 422


# ---------- CLIENT scope ----------
def test_client_sees_only_linked(client, ids):
    r = client.get(f"{WS}/transactions")
    assert r.status_code == 200
    for t in r.json():
        assert ids["client"] in t["client_ids"]


def test_client_cannot_list_contacts(client):
    assert client.get(f"{WS}/contacts").status_code == 403


def test_client_cannot_list_tasks(client):
    assert client.get(f"{WS}/tasks").status_code == 403


# ---------- Staff review flow still works ----------
def test_staff_submits_and_owner_approves(staff, owner):
    r = staff.post(f"{WS}/transactions/{pytest.tx_id}/reviews", json={"note": "Ready"})
    assert r.status_code == 201, r.text
    review_id = r.json()["id"]
    r2 = owner.post(f"{WS}/reviews/{review_id}/decision",
                    json={"decision": "approved", "note": "ok"})
    assert r2.status_code == 200, r2.text
    tx = owner.get(f"{WS}/transactions/{pytest.tx_id}").json()
    assert tx["review_status"] == "approved"


# ---------- Pending user → gate 403 ----------
def test_pending_user_gets_workspace_gate():
    email = f"TEST_pending_{uuid.uuid4().hex[:6]}@doxs.dev"
    s = requests.Session()
    reg = s.post(f"{API}/auth/register", json={
        "name": "TEST Pending", "email": email, "password": "TestPending!2026",
    }, timeout=20)
    assert reg.status_code == 200, reg.text
    login = s.post(f"{API}/auth/login", json={"email": email, "password": "TestPending!2026"})
    assert login.status_code == 200
    r = s.get(f"{WS}/auth/me")
    assert r.status_code == 403
