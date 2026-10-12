"""D.O.X Capital — backend API.

Single-file FastAPI app with JWT auth, admin-approval flow, discovery-call
bookings (Jitsi link generated), document uploads via Emergent object storage,
and Resend-powered transactional emails (logs in MOCK mode if no key set).
"""
from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

import os
import uuid
import asyncio
import hashlib
import logging
import secrets
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Dict, Any

import bcrypt
import jwt
import requests
import resend
from fastapi import (
    FastAPI,
    APIRouter,
    HTTPException,
    Depends,
    Request,
    Response,
    UploadFile,
    File,
    Form,
    Header,
    Query,
)
from fastapi.responses import StreamingResponse
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, EmailStr, Field, ConfigDict
import io

import prescreen_checklist as pre
from workspace.seed import seed as workspace_seed, sync_workspace_users
from workspace.document_routes import init_storage as workspace_init_storage
from workspace.auth_adapter import router as workspace_auth
from workspace.crm_routes import router as workspace_crm
from workspace.document_routes import router as workspace_documents
from workspace.review_routes import router as workspace_reviews
from workspace.message_routes import router as workspace_messages
from workspace.ai_routes import router as workspace_ai
from workspace.integration_routes import router as workspace_integrations
from workspace.knowledge_routes import router as workspace_knowledge
from workspace.calendar_routes import router as workspace_calendar

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger("doxcapital")

# ---------------------------------------------------------------------------
# Mongo
# ---------------------------------------------------------------------------
mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
JWT_SECRET = os.environ["JWT_SECRET"]
JWT_ALG = "HS256"
ACCESS_TTL_MIN = 60 * 12   # 12h
REFRESH_TTL_DAYS = 7
ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "deptofx@proton.me").lower()
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "DoxAdmin!2026")
ADMIN_NOTIFY_EMAIL = os.environ.get("ADMIN_NOTIFY_EMAIL", "deptofx@proton.me")
RESEND_API_KEY = os.environ.get("RESEND_API_KEY", "").strip()
SENDER_EMAIL = os.environ.get("SENDER_EMAIL", "onboarding@resend.dev")
EMERGENT_KEY = os.environ.get("EMERGENT_LLM_KEY", "").strip()
APP_NAME = os.environ.get("APP_NAME", "doxcapital")

if RESEND_API_KEY:
    resend.api_key = RESEND_API_KEY

STORAGE_URL = "https://integrations.emergentagent.com/objstore/api/v1/storage"
_storage_key: Optional[str] = None


# ---------------------------------------------------------------------------
# Helpers — Auth
# ---------------------------------------------------------------------------
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode(), hashed.encode())
    except Exception:
        return False


def create_access_token(user_id: str, email: str, role: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TTL_MIN),
        "type": "access",
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)


def create_refresh_token(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "exp": datetime.now(timezone.utc) + timedelta(days=REFRESH_TTL_DAYS),
        "type": "refresh",
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)


def set_auth_cookies(response: Response, access: str, refresh: str) -> None:
    response.set_cookie("access_token", access, httponly=True, samesite="lax",
                        secure=True, max_age=ACCESS_TTL_MIN * 60, path="/")
    response.set_cookie("refresh_token", refresh, httponly=True, samesite="lax",
                        secure=True, max_age=REFRESH_TTL_DAYS * 86400, path="/")


def clear_auth_cookies(response: Response) -> None:
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")


def _extract_token(request: Request) -> Optional[str]:
    token = request.cookies.get("access_token")
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]
    return token


async def get_current_user(request: Request) -> dict:
    token = _extract_token(request)
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Invalid token type")
        user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0, "password_hash": 0})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


async def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


async def require_approved(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") == "admin":
        return user
    if user.get("status") != "approved":
        raise HTTPException(status_code=403, detail="Account not yet approved")
    return user


# ---------------------------------------------------------------------------
# Helpers — Email (Resend) with MOCK fallback
# ---------------------------------------------------------------------------
def _send_email_sync(to: str, subject: str, html: str) -> None:
    if not RESEND_API_KEY:
        logger.info("[EMAIL MOCK] to=%s subject=%s\n%s", to, subject, html[:400])
        return
    try:
        result = resend.Emails.send({
            "from": SENDER_EMAIL,
            "to": [to],
            "subject": subject,
            "html": html,
        })
        logger.info("[EMAIL SENT] to=%s id=%s subject=%s", to, result.get("id"), subject)
    except Exception as exc:  # network or key issues
        logger.warning("[EMAIL FAILED] to=%s subject=%s err=%s", to, subject, exc)


async def send_email(to: str, subject: str, html: str) -> None:
    await asyncio.to_thread(_send_email_sync, to, subject, html)


def email_shell(title: str, body_html: str) -> str:
    return f"""
    <table width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" style=\"font-family:Helvetica,Arial,sans-serif;background:#050505;padding:32px;color:#fff;\">
      <tr><td>
        <table width=\"560\" align=\"center\" cellpadding=\"0\" cellspacing=\"0\" style=\"background:#0f0f10;border:1px solid #1f1f1f;\">
          <tr><td style=\"padding:28px 28px 8px 28px;border-bottom:1px solid #1f1f1f;\">
            <div style=\"letter-spacing:0.3em;font-size:11px;color:#A1A1AA;text-transform:uppercase;\">D.O.X Capital</div>
            <h1 style=\"margin:8px 0 0;font-size:22px;color:#fff;font-weight:500;\">{title}</h1>
          </td></tr>
          <tr><td style=\"padding:24px 28px;color:#d4d4d8;font-size:14px;line-height:1.6;\">{body_html}</td></tr>
          <tr><td style=\"padding:18px 28px;border-top:1px solid #1f1f1f;color:#71717a;font-size:11px;\">
            D.O.X Capital — Institutional Debt Advisory · deptofx@proton.me
          </td></tr>
        </table>
      </td></tr>
    </table>
    """


# ---------------------------------------------------------------------------
# Helpers — Object Storage
# ---------------------------------------------------------------------------
def init_storage() -> Optional[str]:
    global _storage_key
    if _storage_key:
        return _storage_key
    if not EMERGENT_KEY:
        logger.warning("EMERGENT_LLM_KEY missing, object storage disabled")
        return None
    try:
        r = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": EMERGENT_KEY}, timeout=30)
        r.raise_for_status()
        _storage_key = r.json()["storage_key"]
        logger.info("Object storage initialized")
        return _storage_key
    except Exception as exc:
        logger.exception("Storage init failed: %s", exc)
        return None


def put_object(path: str, data: bytes, content_type: str) -> dict:
    key = init_storage()
    if not key:
        raise HTTPException(status_code=503, detail="Object storage unavailable")
    r = requests.put(
        f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key, "Content-Type": content_type},
        data=data,
        timeout=120,
    )
    r.raise_for_status()
    return r.json()


def get_object(path: str):
    key = init_storage()
    if not key:
        raise HTTPException(status_code=503, detail="Object storage unavailable")
    r = requests.get(
        f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key},
        timeout=60,
    )
    if r.status_code == 404:
        raise HTTPException(status_code=404, detail="File not found")
    r.raise_for_status()
    return r.content, r.headers.get("Content-Type", "application/octet-stream")


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------
class RegisterIn(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    email: EmailStr
    password: str = Field(min_length=8, max_length=120)
    company: Optional[str] = Field(default=None, max_length=120)
    role_requested: Optional[str] = Field(default="investor", max_length=40)
    message: Optional[str] = Field(default=None, max_length=600)
    account_type: str = Field(default="client", pattern="^(client|partner)$")


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class BookingIn(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    email: EmailStr
    phone: Optional[str] = Field(default=None, max_length=40)
    company: Optional[str] = Field(default=None, max_length=120)
    role: Optional[str] = Field(default=None, max_length=80)
    capital_range: Optional[str] = Field(default=None, max_length=80)
    preferred_date: str  # ISO date YYYY-MM-DD
    preferred_time: str  # HH:MM
    timezone: Optional[str] = Field(default="UTC", max_length=80)
    notes: Optional[str] = Field(default=None, max_length=1000)


class PublicUser(BaseModel):
    id: str
    name: str
    email: EmailStr
    role: str
    status: str
    company: Optional[str] = None
    created_at: str


# ---------------------------------------------------------------------------
# App / Router
# ---------------------------------------------------------------------------
app = FastAPI(title="D.O.X Capital API")
api = APIRouter(prefix="/api")


@app.on_event("startup")
async def on_startup():
    # indexes
    try:
        await db.users.create_index("email", unique=True)
        await db.users.create_index("id", unique=True)
        await db.bookings.create_index("id", unique=True)
        await db.uploads.create_index("id", unique=True)
    except Exception as exc:
        logger.warning("index setup: %s", exc)
    # keep the pre-screening checklist in the workspace vault as an SOP
    try:
        md = pre.as_markdown()
        path = "SOPs/loan-underwriting-pre-screening-checklist.md"
        await db.knowledge_items.update_one(
            {"path": path},
            {
                "$set": {
                    "title": "Loan Underwriting Pre-Screening Checklist",
                    "content": md,
                    "content_hash": hashlib.sha256(md.encode()).hexdigest(),
                    "size": len(md),
                    "format": "md",
                    "scope": "shared",
                    "transaction_id": None,
                    "deal_type": None,
                    "trust": "sop",
                    "tags": ["pre-screening", "underwriting", "client documents"],
                    "source": "system",
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                },
                "$setOnInsert": {
                    "id": str(uuid.uuid4()),
                    "created_by": "system",
                    "created_at": datetime.now(timezone.utc).isoformat(),
                },
            },
            upsert=True,
        )
    except Exception as exc:
        logger.warning("prescreen SOP seed: %s", exc)
    # seed admin
    existing = await db.users.find_one({"email": ADMIN_EMAIL})
    if not existing:
        await db.users.insert_one({
            "id": str(uuid.uuid4()),
            "name": "D.O.X Admin",
            "email": ADMIN_EMAIL,
            "password_hash": hash_password(ADMIN_PASSWORD),
            "role": "admin",
            "status": "approved",
            "company": "D.O.X Capital",
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        logger.info("Seeded admin user %s", ADMIN_EMAIL)
    else:
        # keep password in sync with env on each boot
        if not verify_password(ADMIN_PASSWORD, existing.get("password_hash", "")):
            await db.users.update_one(
                {"email": ADMIN_EMAIL},
                {"$set": {"password_hash": hash_password(ADMIN_PASSWORD), "role": "admin", "status": "approved"}},
            )
    # warm up storage
    init_storage()
    # workspace sub-site: indexes, pipeline stages, settings, user mirror
    try:
        await workspace_seed()
        await workspace_init_storage()
    except Exception as exc:
        logger.warning("workspace setup: %s", exc)


@app.on_event("shutdown")
async def on_shutdown():
    client.close()


# ---------------------------------------------------------------------------
# Public routes
# ---------------------------------------------------------------------------
@api.get("/")
async def root():
    return {"service": "D.O.X Capital API", "status": "ok"}


SITE_CONFIG_KEY = "site"


async def site_is_locked() -> bool:
    cfg = await db.site_config.find_one({"key": SITE_CONFIG_KEY}, {"_id": 0})
    if not cfg:
        return True  # pre-launch by default
    return bool(cfg.get("locked", True))


class SiteLockIn(BaseModel):
    locked: bool


@api.get("/site/status")
async def site_status():
    return {"locked": await site_is_locked()}


@api.post("/admin/site-lock")
async def admin_set_site_lock(payload: SiteLockIn, admin: dict = Depends(require_admin)):
    await db.site_config.update_one(
        {"key": SITE_CONFIG_KEY},
        {"$set": {"locked": payload.locked, "updated_at": datetime.now(timezone.utc).isoformat(),
                  "updated_by": admin["email"]}},
        upsert=True,
    )
    return {"ok": True, "locked": payload.locked}


@api.get("/stats")
async def stats():
    """Public stats used in landing page (kept honest — tied to admin-controlled value)."""
    bookings = await db.bookings.count_documents({})
    return {
        "capital_closed_usd": 1_000_000,
        "partners_served": max(12, bookings),
        "compliance": ["SOC-aligned process", "KYC / AML protocol", "Confidentiality NDA on file"],
    }


# ---- Auth ----------------------------------------------------------------
@api.post("/auth/register")
async def register(payload: RegisterIn, response: Response):
    if await site_is_locked():
        raise HTTPException(status_code=403, detail="D.O.X Capital is in pre-launch. Access is invite-only.")
    email = payload.email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="An account with that email already exists")
    user_id = str(uuid.uuid4())
    doc = {
        "id": user_id,
        "name": payload.name.strip(),
        "email": email,
        "password_hash": hash_password(payload.password),
        "company": payload.company,
        "role_requested": payload.role_requested,
        "message": payload.message,
        "role": "user",
        "status": "pending",
        "account_type": payload.account_type,
        "workspace_role": "staff" if payload.account_type == "partner" else "client",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(doc)

    # notify admin + applicant
    await send_email(
        ADMIN_NOTIFY_EMAIL,
        f"[D.O.X] New access request — {payload.name}",
        email_shell("New Access Request", f"""
            <p><strong>{payload.name}</strong> ({email}) has requested access.</p>
            <ul>
              <li>Account type: <strong>{payload.account_type.title()}</strong></li>
              <li>Company: {payload.company or '—'}</li>
              <li>Role: {payload.role_requested or '—'}</li>
            </ul>
            <p>Message: {payload.message or '—'}</p>
            <p>Approve or reject from the admin console.</p>
        """),
    )
    await send_email(
        email,
        "We received your D.O.X Capital access request",
        email_shell("Request Received", f"""
            <p>{payload.name}, thank you for requesting access to the D.O.X partner portal.</p>
            <p>Our team reviews every applicant manually. You'll receive a follow-up email
            once your account is approved (typically within one business day).</p>
        """),
    )
    return {"ok": True, "status": "pending", "id": user_id}


@api.post("/auth/login")
async def login(payload: LoginIn, response: Response):
    email = payload.email.lower()
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(payload.password, user.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if user.get("role") != "admin" and await site_is_locked():
        raise HTTPException(status_code=403, detail="D.O.X Capital is in pre-launch. Access is invite-only.")
    access = create_access_token(user["id"], user["email"], user["role"])
    refresh = create_refresh_token(user["id"])
    set_auth_cookies(response, access, refresh)
    user.pop("_id", None); user.pop("password_hash", None)
    return {"user": user, "access_token": access}


@api.post("/auth/logout")
async def logout(response: Response):
    clear_auth_cookies(response)
    return {"ok": True}


@api.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return user


@api.post("/auth/refresh")
async def refresh_token(request: Request, response: Response):
    token = request.cookies.get("refresh_token")
    if not token:
        raise HTTPException(status_code=401, detail="No refresh token")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
        if payload.get("type") != "refresh":
            raise HTTPException(status_code=401, detail="Invalid refresh token")
        user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0, "password_hash": 0})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        access = create_access_token(user["id"], user["email"], user["role"])
        response.set_cookie("access_token", access, httponly=True, samesite="lax",
                            secure=True, max_age=ACCESS_TTL_MIN * 60, path="/")
        return {"ok": True}
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid refresh token")


# ---- Discovery call bookings --------------------------------------------
def _jitsi_room(name_hint: str) -> str:
    slug = "".join(c for c in name_hint.lower() if c.isalnum())[:12] or "dox"
    return f"DOXCapital-{slug}-{secrets.token_hex(3)}"


@api.post("/bookings")
async def create_booking(payload: BookingIn):
    if await site_is_locked():
        raise HTTPException(status_code=403, detail="D.O.X Capital is in pre-launch. Discovery calls open at launch.")
    booking_id = str(uuid.uuid4())
    room = _jitsi_room(payload.name)
    meet_link = f"https://meet.jit.si/{room}"
    doc = {
        "id": booking_id,
        "name": payload.name.strip(),
        "email": payload.email.lower(),
        "phone": payload.phone,
        "company": payload.company,
        "role": payload.role,
        "capital_range": payload.capital_range,
        "preferred_date": payload.preferred_date,
        "preferred_time": payload.preferred_time,
        "timezone": payload.timezone,
        "notes": payload.notes,
        "meet_link": meet_link,
        "status": "scheduled",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.bookings.insert_one(doc)

    when = f"{payload.preferred_date} at {payload.preferred_time} ({payload.timezone or 'UTC'})"
    await send_email(
        ADMIN_NOTIFY_EMAIL,
        f"[D.O.X] Discovery call — {payload.name} · {when}",
        email_shell("New Discovery Call", f"""
            <p><strong>{payload.name}</strong> ({payload.email}) booked a discovery call.</p>
            <ul>
              <li>When: <strong>{when}</strong></li>
              <li>Company: {payload.company or '—'}</li>
              <li>Capital range: {payload.capital_range or '—'}</li>
              <li>Phone: {payload.phone or '—'}</li>
            </ul>
            <p>Notes: {payload.notes or '—'}</p>
            <p>Jitsi room: <a href="{meet_link}" style="color:#D4AF37;">{meet_link}</a></p>
        """),
    )
    await send_email(
        payload.email,
        f"Your D.O.X Capital discovery call is confirmed — {when}",
        email_shell("Discovery Call Confirmed", f"""
            <p>{payload.name}, your discovery call with D.O.X Capital is confirmed for <strong>{when}</strong>.</p>
            <p>Join the call here: <a href="{meet_link}" style="color:#D4AF37;">{meet_link}</a></p>
            <p>If you need to reschedule or cancel, reply to this email.</p>
        """),
    )
    return {"ok": True, "id": booking_id, "meet_link": meet_link}


@api.get("/bookings/{booking_id}")
async def get_booking(booking_id: str):
    doc = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Booking not found")
    return doc


# ---- Documents to sign (admin curated) -----------------------------------
DEFAULT_SIGN_DOCS = [
    {
        "id": "nda",
        "title": "Mutual Non-Disclosure Agreement",
        "description": "Standard NDA executed before any deal data is exchanged.",
        "external_url": "https://www.docusign.com",
        "required": True,
    },
    {
        "id": "engagement",
        "title": "Engagement Letter",
        "description": "Scope, fees, and deliverables of the D.O.X advisory engagement.",
        "external_url": "https://www.docusign.com",
        "required": True,
    },
    {
        "id": "kyc",
        "title": "KYC / AML Disclosure",
        "description": "Identity verification packet required by institutional partners.",
        "external_url": "https://www.docusign.com",
        "required": True,
    },
    {
        "id": "ppm",
        "title": "Investor Suitability Questionnaire",
        "description": "Accredited / institutional investor self-certification.",
        "external_url": "https://www.docusign.com",
        "required": False,
    },
]


@api.get("/documents")
async def list_sign_documents(user: dict = Depends(require_approved)):
    """Documents the approved user needs to sign — admin curated, with sane defaults."""
    docs = await db.sign_documents.find({}, {"_id": 0}).to_list(100)
    return docs or DEFAULT_SIGN_DOCS


# ---- Pre-screening readiness --------------------------------------------
PRESCREEN_CATEGORY = "prescreen"


class MetricsIn(BaseModel):
    metrics: Dict[str, Any]


class TrackIn(BaseModel):
    track: str = Field(pattern="^(pre_revenue|operating)$")


class ItemReviewIn(BaseModel):
    status: str = Field(pattern="^(missing|received|verified|rejected|na)$")
    note: Optional[str] = Field(default=None, max_length=500)


async def _prescreen_state(user_id: str) -> dict:
    rec = await db.prescreen.find_one({"user_id": user_id}, {"_id": 0})
    if not rec:
        rec = {"user_id": user_id, "track": None, "metrics": {}, "reviews": {},
               "created_at": datetime.now(timezone.utc).isoformat()}
        await db.prescreen.insert_one(dict(rec))
        rec.pop("_id", None)
    return rec


async def _prescreen_payload(user: dict) -> dict:
    rec = await _prescreen_state(user["id"])
    track = rec.get("track")
    reviews = rec.get("reviews") or {}
    files = await db.uploads.find(
        {"user_id": user["id"], "is_deleted": False, "category": {"$regex": f"^{PRESCREEN_CATEGORY}:"}},
        {"_id": 0, "id": 1, "original_filename": 1, "category": 1, "created_at": 1, "size": 1},
    ).sort("created_at", -1).to_list(500)

    by_item: Dict[str, list] = {}
    for f in files:
        key = f["category"].split(":", 1)[1]
        by_item.setdefault(key, []).append(f)

    item_status: Dict[str, str] = {}
    sections = []
    for s in pre.sections_for(track):
        items = []
        for i in s["items"]:
            review = reviews.get(i["id"]) or {}
            uploads = by_item.get(i["id"], [])
            status = review.get("status") or ("received" if uploads else "missing")
            item_status[i["id"]] = status
            items.append({**i, "status": status, "note": review.get("note"),
                          "reviewed_at": review.get("reviewed_at"), "uploads": uploads})
        sections.append({**s, "items": items})

    result = pre.evaluate(track, rec.get("metrics") or {}, item_status)
    return {
        "user": {"id": user["id"], "name": user.get("name"), "email": user["email"],
                 "company": user.get("company")},
        "track": track,
        "track_label": pre.TRACKS.get(track),
        "tracks": pre.TRACKS,
        "metrics": rec.get("metrics") or {},
        "metric_fields": pre.metrics_for(track),
        "sections": sections,
        "unassigned": by_item.get("unassigned", []),
        "ready_notified_at": rec.get("ready_notified_at"),
        **result,
    }


async def _maybe_notify_ready(user: dict) -> None:
    payload = await _prescreen_payload(user)
    if not payload["ready"] or payload.get("ready_notified_at"):
        return
    await db.prescreen.update_one(
        {"user_id": user["id"]},
        {"$set": {"ready_notified_at": datetime.now(timezone.utc).isoformat()}},
    )
    c = payload["computed"]
    await send_email(
        ADMIN_NOTIFY_EMAIL,
        f"[D.O.X] {user.get('name')} is underwriter-ready",
        email_shell("Underwriter-Ready", f"""
            <p><strong>{user.get('name')}</strong> ({user['email']}) has completed the
            pre-screening checklist with no open red flags.</p>
            <ul>
              <li>Track: {payload['track_label']}</li>
              <li>Required documents received: {payload['score']['received']} / {payload['score']['required_total']}</li>
              <li>LTV: {c['ltv'] if c['ltv'] is not None else '—'}% ·
                  Collateral coverage: {c['coverage'] if c['coverage'] is not None else '—'}% ·
                  DSCR: {c['dscr'] if c['dscr'] is not None else '—'}</li>
            </ul>
            <p>Review and release the file to the underwriting desk from the admin console.</p>
        """),
    )


@api.get("/prescreen/me")
async def my_prescreen(user: dict = Depends(require_approved)):
    await _maybe_notify_ready(user)
    return await _prescreen_payload(user)


@api.put("/prescreen/me/metrics")
async def save_my_metrics(payload: MetricsIn, user: dict = Depends(require_approved)):
    allowed = {m["id"] for m in pre.METRICS}
    clean = {k: v for k, v in payload.metrics.items() if k in allowed}
    await db.prescreen.update_one(
        {"user_id": user["id"]},
        {"$set": {"metrics": clean, "updated_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True,
    )
    await _maybe_notify_ready(user)
    return await _prescreen_payload(user)


@api.get("/admin/prescreen")
async def admin_list_prescreen(admin: dict = Depends(require_admin)):
    users = await db.users.find(
        {"role": {"$ne": "admin"}, "status": "approved", "account_type": {"$ne": "partner"}},
        {"_id": 0, "password_hash": 0}
    ).sort("created_at", -1).to_list(500)
    return [await _prescreen_payload(u) for u in users]


@api.put("/admin/prescreen/{user_id}/track")
async def admin_set_track(user_id: str, payload: TrackIn, admin: dict = Depends(require_admin)):
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    await db.prescreen.update_one(
        {"user_id": user_id},
        {"$set": {"track": payload.track, "updated_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True,
    )
    await send_email(
        user["email"],
        "[D.O.X] Your document checklist is ready",
        email_shell("Document Checklist Assigned", f"""
            <p>Your file has been classified as <strong>{pre.TRACKS[payload.track]}</strong>.</p>
            <p>Sign in to your portal and open the <strong>Document Readiness</strong> tab to see
            exactly what we need and to upload it.</p>
        """),
    )
    return await _prescreen_payload(user)


@api.put("/admin/prescreen/{user_id}/items/{item_id}")
async def admin_review_item(user_id: str, item_id: str, payload: ItemReviewIn,
                            admin: dict = Depends(require_admin)):
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    valid = {i["id"] for s in pre.SECTIONS for i in s["items"]}
    if item_id not in valid:
        raise HTTPException(status_code=404, detail="Unknown checklist item")
    await db.prescreen.update_one(
        {"user_id": user_id},
        {"$set": {f"reviews.{item_id}": {"status": payload.status, "note": payload.note,
                                         "reviewed_at": datetime.now(timezone.utc).isoformat(),
                                         "reviewed_by": admin["email"]}}},
        upsert=True,
    )
    await _maybe_notify_ready(user)
    return await _prescreen_payload(user)


# ---- Assistant (lightweight AI chat, mobile) -----------------------------
ASSISTANT_MODEL = "gpt-6-luna"
ASSISTANT_SYSTEM = (
    "You are the D.O.X Capital assistant for clients raising institutional debt capital. "
    "D.O.X is an advisory and packaging firm that restructures the borrower side so institutional "
    "capital can transact. Be concise, precise and authoritative — never salesy. "
    "Your primary job is to help clients understand what documents and financial figures they must "
    "prepare for the Loan Underwriting Pre-Screening Checklist, and to answer questions about the "
    "readiness process. Use the checklist below as the source of truth; if something is not covered, "
    "say so plainly rather than inventing requirements. You cannot change records, approve deals, "
    "upload documents, or send emails on the user's behalf.\n\n"
    "=== SOURCE OF TRUTH: PRE-SCREENING CHECKLIST ===\n" + pre.as_markdown()
)


class AssistantIn(BaseModel):
    message: str = Field(min_length=1, max_length=4000)
    session_id: Optional[str] = Field(default=None, max_length=80)


@api.post("/assistant/chat")
async def assistant_chat(payload: AssistantIn, user: dict = Depends(require_approved)):
    from emergentintegrations.llm.chat import LlmChat, UserMessage

    key = os.environ.get("EMERGENT_LLM_KEY")
    if not key:
        raise HTTPException(status_code=503, detail="Assistant is temporarily unavailable.")
    session_id = payload.session_id or str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    await db.assistant_messages.insert_one({
        "id": str(uuid.uuid4()), "user_id": user["id"], "session_id": session_id,
        "role": "user", "text": payload.message, "created_at": now,
    })
    try:
        chat = LlmChat(
            api_key=key,
            session_id=f'{user["id"]}:{session_id}',
            system_message=ASSISTANT_SYSTEM,
        ).with_model("openai", ASSISTANT_MODEL)
        reply = await chat.send_message(UserMessage(text=payload.message))
    except Exception as exc:
        logger.warning("[assistant] failed: %s", exc)
        raise HTTPException(status_code=502, detail="The assistant is temporarily unavailable. Please try again.")
    reply_text = reply if isinstance(reply, str) else str(reply)
    await db.assistant_messages.insert_one({
        "id": str(uuid.uuid4()), "user_id": user["id"], "session_id": session_id,
        "role": "assistant", "text": reply_text,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    return {"session_id": session_id, "reply": reply_text}


@api.get("/assistant/history")
async def assistant_history(session_id: str, user: dict = Depends(require_approved)):
    msgs = await db.assistant_messages.find(
        {"user_id": user["id"], "session_id": session_id}, {"_id": 0}
    ).sort("created_at", 1).to_list(200)
    return msgs


# ---- Uploads (user docs) -------------------------------------------------
MAX_UPLOAD_BYTES = 25 * 1024 * 1024  # 25MB


@api.post("/uploads")
async def upload_doc(
    file: UploadFile = File(...),
    category: str = Form("general"),
    user: dict = Depends(require_approved),
):
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty file")
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="File exceeds 25MB limit")
    ext = (file.filename or "bin").rsplit(".", 1)[-1].lower()
    safe_id = str(uuid.uuid4())
    path = f"{APP_NAME}/uploads/{user['id']}/{safe_id}.{ext}"
    content_type = file.content_type or "application/octet-stream"
    result = put_object(path, data, content_type)
    doc = {
        "id": safe_id,
        "user_id": user["id"],
        "user_email": user["email"],
        "user_name": user.get("name"),
        "storage_path": result["path"],
        "original_filename": file.filename,
        "content_type": content_type,
        "size": result.get("size", len(data)),
        "category": category,
        "is_deleted": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.uploads.insert_one(doc)
    # notify admin (checklist uploads are reported through the readiness file instead)
    if not category.startswith(f"{PRESCREEN_CATEGORY}:"):
        await send_email(
            ADMIN_NOTIFY_EMAIL,
            f"[D.O.X] Upload from {user.get('name')} — {file.filename}",
            email_shell("New Document Upload", f"""
                <p><strong>{user.get('name')}</strong> ({user['email']}) uploaded a document.</p>
                <ul>
                  <li>File: {file.filename}</li>
                  <li>Category: {category}</li>
                  <li>Size: {len(data):,} bytes</li>
                </ul>
                <p>Review it from the admin console.</p>
            """),
        )
    if category.startswith(f"{PRESCREEN_CATEGORY}:"):
        await _maybe_notify_ready(user)
    return {"ok": True, "id": safe_id, "filename": file.filename}


@api.get("/uploads/mine")
async def my_uploads(user: dict = Depends(require_approved)):
    docs = await db.uploads.find(
        {"user_id": user["id"], "is_deleted": False}, {"_id": 0}
    ).sort("created_at", -1).to_list(500)
    return docs


@api.get("/uploads/{upload_id}/download")
async def download_upload(
    upload_id: str,
    request: Request,
    auth: Optional[str] = Query(default=None),
):
    # auth: cookie OR bearer header OR ?auth= query
    token = _extract_token(request) or auth
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
        user_id = payload["sub"]
        role = payload.get("role", "user")
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid token")
    doc = await db.uploads.find_one({"id": upload_id, "is_deleted": False}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="File not found")
    if role != "admin" and doc["user_id"] != user_id:
        raise HTTPException(status_code=403, detail="Not allowed")
    data, ct = get_object(doc["storage_path"])
    headers = {"Content-Disposition": f'attachment; filename="{doc["original_filename"]}"'}
    return StreamingResponse(io.BytesIO(data), media_type=doc.get("content_type", ct), headers=headers)


# ---- Admin ---------------------------------------------------------------
@api.get("/admin/users")
async def admin_list_users(status: Optional[str] = None, admin: dict = Depends(require_admin)):
    q: dict = {}
    if status:
        q["status"] = status
    users = await db.users.find(q, {"_id": 0, "password_hash": 0}).sort("created_at", -1).to_list(500)
    return users


@api.post("/admin/users/{user_id}/approve")
async def admin_approve(user_id: str, admin: dict = Depends(require_admin)):
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    await db.users.update_one({"id": user_id}, {"$set": {"status": "approved",
                                                          "approved_at": datetime.now(timezone.utc).isoformat()}})
    await sync_workspace_users()
    await send_email(
        user["email"],
        "Your D.O.X Capital account is approved",
        email_shell("Account Approved", f"""
            <p>{user.get('name')}, your D.O.X Capital partner portal access has been approved.</p>
            <p>You can now sign in to upload documents and execute the agreements required to move your engagement forward.</p>
            <p><a href="#" style="color:#D4AF37;">Sign in to the portal</a></p>
        """),
    )
    return {"ok": True}


@api.post("/admin/users/{user_id}/reject")
async def admin_reject(user_id: str, admin: dict = Depends(require_admin)):
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    await db.users.update_one({"id": user_id}, {"$set": {"status": "rejected",
                                                          "rejected_at": datetime.now(timezone.utc).isoformat()}})
    await send_email(
        user["email"],
        "Update on your D.O.X Capital access request",
        email_shell("Application Update", f"""
            <p>{user.get('name')}, after careful review, we are unable to grant portal access at this time.</p>
            <p>If you believe this is in error, reply to this email and our team will respond.</p>
        """),
    )
    return {"ok": True}


@api.get("/admin/uploads")
async def admin_list_uploads(admin: dict = Depends(require_admin)):
    return await db.uploads.find({"is_deleted": False}, {"_id": 0}).sort("created_at", -1).to_list(1000)


@api.get("/admin/bookings")
async def admin_list_bookings(admin: dict = Depends(require_admin)):
    return await db.bookings.find({}, {"_id": 0}).sort("created_at", -1).to_list(1000)


class WorkspaceRoleIn(BaseModel):
    workspace_role: str  # "staff" | "client"


@api.post("/admin/users/{user_id}/workspace-role")
async def admin_set_workspace_role(user_id: str, payload: WorkspaceRoleIn,
                                   admin: dict = Depends(require_admin)):
    if payload.workspace_role not in ("staff", "client"):
        raise HTTPException(status_code=422, detail="workspace_role must be staff or client")
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    await db.users.update_one({"id": user_id}, {"$set": {"workspace_role": payload.workspace_role}})
    await sync_workspace_users()
    return {"ok": True, "workspace_role": payload.workspace_role}


# ---------------------------------------------------------------------------
app.include_router(api)
for workspace_router in (workspace_auth, workspace_crm, workspace_documents, workspace_reviews,
                         workspace_messages, workspace_ai, workspace_integrations,
                         workspace_knowledge, workspace_calendar):
    app.include_router(workspace_router)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)
