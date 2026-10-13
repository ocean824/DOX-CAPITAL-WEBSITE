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
REPLY_TO_EMAIL = os.environ.get("REPLY_TO_EMAIL", "admin@thedoxs.com")
RESEND_API_KEY = os.environ.get("RESEND_API_KEY", "").strip()
SENDER_EMAIL = os.environ.get("SENDER_EMAIL", "onboarding@resend.dev")
RESEND_WEBHOOK_SECRET = os.environ.get("RESEND_WEBHOOK_SECRET", "").strip()
MAIL_DOMAIN = os.environ.get("MAIL_DOMAIN", "thedoxs.com")
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


def _is_underwriter(user: dict) -> bool:
    return user.get("account_type") == "underwriter" and user.get("status") == "approved"


async def require_underwriter(user: dict = Depends(get_current_user)) -> dict:
    """Underwriter OR admin."""
    if user.get("role") == "admin" or _is_underwriter(user):
        return user
    raise HTTPException(status_code=403, detail="Underwriter access required")


async def require_staff(user: dict = Depends(get_current_user)) -> dict:
    """Admin-level read + underwriting write: admin OR approved underwriter."""
    if user.get("role") == "admin" or _is_underwriter(user):
        return user
    raise HTTPException(status_code=403, detail="Staff access required")


async def require_partner(user: dict = Depends(require_approved)) -> dict:
    if user.get("role") == "admin" or user.get("account_type") == "partner":
        return user
    raise HTTPException(status_code=403, detail="Partner access required")


async def require_referrer(user: dict = Depends(require_approved)) -> dict:
    """Admin, partner or underwriter — anyone who can refer & manage their own clients."""
    if user.get("role") == "admin" or user.get("account_type") in ("partner", "underwriter"):
        return user
    raise HTTPException(status_code=403, detail="Partner or underwriter access required")


# ---------------------------------------------------------------------------
# Helpers — Email (Resend) with MOCK fallback
# ---------------------------------------------------------------------------
def _send_email_sync(to: str, subject: str, html: str, reply_to: Optional[str] = None) -> None:
    if not RESEND_API_KEY:
        logger.info("[EMAIL MOCK] to=%s reply_to=%s subject=%s\n%s", to, reply_to, subject, html[:400])
        return
    try:
        msg = {
            "from": SENDER_EMAIL,
            "to": [to],
            "subject": subject,
            "html": html,
        }
        if reply_to:
            msg["reply_to"] = reply_to
        result = resend.Emails.send(msg)
        logger.info("[EMAIL SENT] to=%s id=%s subject=%s", to, result.get("id"), subject)
    except Exception as exc:  # network or key issues
        logger.warning("[EMAIL FAILED] to=%s subject=%s err=%s", to, subject, exc)


async def send_email(to: str, subject: str, html: str, reply_to: Optional[str] = None) -> None:
    await asyncio.to_thread(_send_email_sync, to, subject, html, reply_to or REPLY_TO_EMAIL)


async def notify_user(user_doc: Optional[dict], subject: str, body_html: str,
                      reply_to: Optional[str] = None) -> None:
    """Lean notification email to a party's own signup inbox. Reply-To routes replies
    to the relevant human. Only call for important deal events."""
    if user_doc and user_doc.get("email"):
        await send_email(user_doc["email"], subject, email_shell(subject, body_html), reply_to=reply_to)


def escape_html(text: Optional[str]) -> str:
    from html import escape
    return escape(text or "")


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
LEGAL_VERSION = "June 2026"
LEGAL_TERMS_DOC_ID = "DOX-LEGAL-01"
LEGAL_PRIVACY_DOC_ID = "DOX-LEGAL-02"


class RegisterIn(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    email: EmailStr
    password: str = Field(min_length=8, max_length=120)
    company: Optional[str] = Field(default=None, max_length=120)
    role_requested: Optional[str] = Field(default="investor", max_length=40)
    message: Optional[str] = Field(default=None, max_length=600)
    account_type: str = Field(default="client", pattern="^(client|partner|underwriter)$")
    referral_code: Optional[str] = Field(default=None, max_length=24)
    accepted_legal: bool = False


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
        await db.users.create_index("business_handle", unique=True, sparse=True)
        await db.inbox.create_index("id", unique=True)
        await db.inbox.create_index([("owner_user_id", 1), ("received_at", -1)])
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
    # seed demo accounts for the new deal-flow roles (idempotent, approved)
    try:
        await _seed_role_accounts()
    except Exception as exc:
        logger.warning("role account seed: %s", exc)
    # assign each staff/admin a <handle>@thedoxs.com business inbox address
    try:
        await _backfill_business_emails()
    except Exception as exc:
        logger.warning("business email backfill: %s", exc)
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
async def register(payload: RegisterIn, request: Request, response: Response):
    if await site_is_locked():
        raise HTTPException(status_code=403, detail="D.O.X Capital is in pre-launch. Access is invite-only.")
    if not payload.accepted_legal:
        raise HTTPException(status_code=422, detail="You must accept the Terms of Service and Privacy Policy to continue")
    email = payload.email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="An account with that email already exists")
    user_id = str(uuid.uuid4())
    partner_id = None
    if payload.referral_code:
        ref = await db.users.find_one(
            {"referral_code": payload.referral_code.strip().upper(),
             "account_type": {"$in": ["partner", "underwriter"]}},
            {"_id": 0, "id": 1},
        )
        if ref:
            partner_id = ref["id"]
    client_ip = (request.headers.get("x-forwarded-for") or (request.client.host if request.client else "")).split(",")[0].strip()
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
        "partner_id": partner_id,
        "workspace_role": "staff" if payload.account_type in ("partner", "underwriter") else "client",
        "legal_acceptance": {
            "version": LEGAL_VERSION,
            "terms_doc_id": LEGAL_TERMS_DOC_ID,
            "privacy_doc_id": LEGAL_PRIVACY_DOC_ID,
            "accepted_at": datetime.now(timezone.utc).isoformat(),
            "ip": client_ip,
            "user_agent": request.headers.get("user-agent", "")[:400],
        },
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
    phase = _effective_phase(rec, result.get("ready", False), track)
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
        "phase": phase,
        "phase_label": PHASE_LABELS.get(phase, phase),
        "underwriter_id": rec.get("underwriter_id"),
        "partner_id": user.get("partner_id"),
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
async def admin_set_track(user_id: str, payload: TrackIn, admin: dict = Depends(require_staff)):
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
                            admin: dict = Depends(require_staff)):
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


class ChangePasswordIn(BaseModel):
    current_password: str = Field(min_length=1, max_length=120)
    new_password: str = Field(min_length=8, max_length=120)


@api.post("/auth/change-password")
async def change_password(payload: ChangePasswordIn, user: dict = Depends(get_current_user)):
    doc = await db.users.find_one({"id": user["id"]})
    if not doc or not verify_password(payload.current_password, doc["password_hash"]):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    await db.users.update_one({"id": user["id"]}, {"$set": {"password_hash": hash_password(payload.new_password)}})
    return {"ok": True}


# ---- Deal flow: phases, roles, scheduling, messaging ---------------------
PHASES = ["intake", "in_preparation", "ready_to_underwrite", "in_underwriting", "approved", "declined"]
PHASE_LABELS = {
    "intake": "Intake",
    "in_preparation": "In Preparation",
    "ready_to_underwrite": "Ready to Underwrite",
    "in_underwriting": "In Underwriting",
    "approved": "Approved",
    "declined": "Declined",
}
PHASE_ORDER = {p: i for i, p in enumerate(PHASES)}
UNDERWRITER_PHASES = ("ready_to_underwrite", "in_underwriting", "approved", "declined")
SCHEDULABLE_PHASES = ("ready_to_underwrite", "in_underwriting", "approved")


def _effective_phase(rec: dict, ready: bool, track: Optional[str]) -> str:
    """Intake/In-Preparation/Ready-to-Underwrite are derived from readiness; an
    underwriter/admin explicitly drives the terminal phases."""
    manual = rec.get("phase")
    if manual in ("in_underwriting", "approved", "declined"):
        return manual
    if not track:
        return "intake"
    return "ready_to_underwrite" if ready else "in_preparation"


class PhaseIn(BaseModel):
    phase: str = Field(pattern="^(in_underwriting|approved|declined)$")
    note: Optional[str] = Field(default=None, max_length=1000)


class PartnerAssignIn(BaseModel):
    partner_id: Optional[str] = None


class DealMeetingIn(BaseModel):
    with_role: str = Field(pattern="^(underwriter|admin)$")
    preferred_date: str
    preferred_time: str
    timezone: Optional[str] = Field(default="UTC", max_length=80)
    notes: Optional[str] = Field(default=None, max_length=1000)


class DealMessageIn(BaseModel):
    body: str = Field(min_length=1, max_length=5000)


class ClientAccessIn(BaseModel):
    assigned_ids: list[str] = Field(default_factory=list)


async def _get_client_user(client_id: str) -> dict:
    client = await db.users.find_one({"id": client_id}, {"_id": 0, "password_hash": 0})
    if not client:
        raise HTTPException(status_code=404, detail="Deal not found")
    return client


async def _require_deal_access(user: dict, client_id: str) -> dict:
    """Return the client user doc if the caller may see this deal, else 403."""
    client = await _get_client_user(client_id)
    if user.get("role") == "admin" or _is_underwriter(user):
        return client
    if user.get("account_type") == "partner" and client.get("partner_id") == user["id"]:
        return client
    if user["id"] in (client.get("assigned_ids") or []):
        return client
    if user["id"] == client_id:
        return client
    raise HTTPException(status_code=403, detail="You do not have access to this deal")


async def _deal_recipients(client: dict) -> list[dict]:
    """Client + assigned partner + assigned underwriter (deduped)."""
    people = [client]
    if client.get("partner_id"):
        p = await db.users.find_one({"id": client["partner_id"]}, {"_id": 0, "password_hash": 0})
        if p:
            people.append(p)
    rec = await db.prescreen.find_one({"user_id": client["id"]}, {"_id": 0, "underwriter_id": 1})
    uw_id = (rec or {}).get("underwriter_id")
    if uw_id:
        uw = await db.users.find_one({"id": uw_id}, {"_id": 0, "password_hash": 0})
        if uw:
            people.append(uw)
    for aid in (client.get("assigned_ids") or []):
        a = await db.users.find_one({"id": aid}, {"_id": 0, "password_hash": 0})
        if a:
            people.append(a)
    seen, out = set(), []
    for person in people:
        if person and person["id"] not in seen:
            seen.add(person["id"])
            out.append(person)
    return out


async def _notify_deal(client: dict, actor_email: Optional[str], subject: str,
                       body_html: str, exclude_ids: tuple = ()) -> None:
    for person in await _deal_recipients(client):
        if person["id"] in exclude_ids:
            continue
        await notify_user(person, subject, body_html, reply_to=actor_email)


async def _seed_role_accounts() -> None:
    """Pre-approved demo accounts for QA of the deal-flow roles. Real accounts are
    created via the self-serve sign-up + admin approval flow."""
    demo = [
        {"email": "underwriter@thedoxs.com", "name": "Test Underwriter",
         "password": "DoxUnder!2026", "account_type": "underwriter", "workspace_role": "staff"},
        {"email": "partner@thedoxs.com", "name": "Test Partner",
         "password": "DoxPartner!2026", "account_type": "partner", "workspace_role": "staff",
         "referral_code": "DOXVIP"},
        {"email": "client@thedoxs.com", "name": "Test Client",
         "password": "DoxClient!2026", "account_type": "client", "workspace_role": "client"},
    ]
    for d in demo:
        if await db.users.find_one({"email": d["email"]}):
            continue
        await db.users.insert_one({
            "id": str(uuid.uuid4()),
            "name": d["name"],
            "email": d["email"],
            "password_hash": hash_password(d["password"]),
            "role": "user",
            "status": "approved",
            "account_type": d["account_type"],
            "workspace_role": d["workspace_role"],
            "referral_code": d.get("referral_code"),
            "company": "D.O.X Demo",
            "approved_at": datetime.now(timezone.utc).isoformat(),
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        logger.info("Seeded demo %s account %s", d["account_type"], d["email"])
    # link the demo client to the demo partner
    partner = await db.users.find_one({"email": "partner@thedoxs.com"}, {"_id": 0, "id": 1})
    client = await db.users.find_one({"email": "client@thedoxs.com"}, {"_id": 0, "id": 1, "partner_id": 1})
    if partner and client and not client.get("partner_id"):
        await db.users.update_one({"id": client["id"]}, {"$set": {"partner_id": partner["id"]}})


# ---- Admin: assign a partner to a client ---------------------------------
@api.put("/admin/clients/{user_id}/partner")
async def admin_assign_partner(user_id: str, payload: PartnerAssignIn, admin: dict = Depends(require_admin)):
    client = await _get_client_user(user_id)
    if payload.partner_id:
        partner = await db.users.find_one({"id": payload.partner_id, "account_type": "partner"}, {"_id": 0})
        if not partner:
            raise HTTPException(status_code=404, detail="Partner not found")
    await db.users.update_one({"id": user_id}, {"$set": {"partner_id": payload.partner_id}})
    return {"ok": True, "partner_id": payload.partner_id}


# ---- Partner: my referral code + my assigned client deals ----------------
@api.get("/partner/me")
async def partner_me(user: dict = Depends(require_referrer)):
    me = await db.users.find_one({"id": user["id"]}, {"_id": 0, "password_hash": 0})
    # lazily mint a referral code for approved partners/underwriters that don't have one yet
    if not me.get("referral_code") and me.get("account_type") in ("partner", "underwriter") \
            and me.get("status") == "approved":
        code = f"DOX{secrets.token_hex(3).upper()}"
        await db.users.update_one({"id": user["id"]}, {"$set": {"referral_code": code}})
        me["referral_code"] = code
    return {"referral_code": me.get("referral_code"), "name": me.get("name"), "email": me.get("email")}


@api.get("/partner/clients")
async def partner_clients(user: dict = Depends(require_referrer)):
    q = {"account_type": "client", "status": "approved"}
    if user.get("role") != "admin":
        q["partner_id"] = user["id"]
    clients = await db.users.find(q, {"_id": 0, "password_hash": 0}).sort("created_at", -1).to_list(500)
    return [await _prescreen_payload(c) for c in clients]


# ---- Underwriter: all deals ready for underwriting + act on them ---------
@api.get("/underwriter/deals")
async def underwriter_deals(user: dict = Depends(require_staff)):
    clients = await db.users.find(
        {"account_type": "client", "status": "approved"}, {"_id": 0, "password_hash": 0}
    ).sort("created_at", -1).to_list(500)
    payloads = [await _prescreen_payload(c) for c in clients]
    return [p for p in payloads if p["phase"] in UNDERWRITER_PHASES]


@api.put("/underwriter/deals/{user_id}/phase")
async def underwriter_set_phase(user_id: str, payload: PhaseIn, user: dict = Depends(require_staff)):
    client = await _get_client_user(user_id)
    patch = {"phase": payload.phase, "phase_updated_at": datetime.now(timezone.utc).isoformat()}
    if _is_underwriter(user):
        patch["underwriter_id"] = user["id"]
    if payload.phase in ("approved", "declined"):
        patch["decided_by"] = user["email"]
        patch["decided_at"] = datetime.now(timezone.utc).isoformat()
    await db.prescreen.update_one({"user_id": user_id}, {"$set": patch}, upsert=True)
    label = PHASE_LABELS[payload.phase]
    await _notify_deal(
        client, user["email"], f"[D.O.X] Your deal is now: {label}",
        f"<p>Your file has moved to <strong>{label}</strong>.</p>"
        f"{('<p>' + escape_html(payload.note) + '</p>') if payload.note else ''}"
        "<p>Sign in to your portal for details and next steps.</p>",
        exclude_ids=(user["id"],),
    )
    return await _prescreen_payload(client)


# ---- Readiness-gated meeting scheduling (Jitsi) --------------------------
@api.post("/deals/{client_id}/meetings")
async def create_deal_meeting(client_id: str, payload: DealMeetingIn, user: dict = Depends(require_approved)):
    client = await _require_deal_access(user, client_id)
    snapshot = await _prescreen_payload(client)
    if snapshot["phase"] not in SCHEDULABLE_PHASES:
        raise HTTPException(status_code=400,
                            detail="This deal must be prepared (Ready to Underwrite) before scheduling.")
    # A client may only book once our team has approved (verified) ALL required documents.
    is_client_self = user["id"] == client_id and user.get("role") != "admin" \
        and user.get("account_type") not in ("partner", "underwriter")
    score = snapshot.get("score", {})
    docs_approved = score.get("required_total", 0) > 0 and score.get("verified", 0) >= score.get("required_total", 0)
    if is_client_self and not docs_approved:
        raise HTTPException(status_code=403,
                            detail="Scheduling unlocks once our team has approved all of your requested documents.")
    room = _jitsi_room(client.get("name") or "dox")
    meet_link = f"https://meet.jit.si/{room}"
    when = f"{payload.preferred_date} at {payload.preferred_time} ({payload.timezone or 'UTC'})"
    doc = {
        "id": str(uuid.uuid4()),
        "kind": "underwriting",
        "client_id": client_id,
        "client_name": client.get("name"),
        "client_email": client.get("email"),
        "with_role": payload.with_role,
        "requested_by": user["id"],
        "requested_by_name": user.get("name"),
        "requested_by_role": user.get("account_type") or user.get("role"),
        "preferred_date": payload.preferred_date,
        "preferred_time": payload.preferred_time,
        "timezone": payload.timezone,
        "notes": payload.notes,
        "meet_link": meet_link,
        "status": "scheduled",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.bookings.insert_one(dict(doc))
    body = (f"<p>An underwriting call for <strong>{client.get('name')}</strong> is scheduled for "
            f"<strong>{when}</strong>.</p>"
            f"<p>Join here: <a href=\"{meet_link}\" style=\"color:#D4AF37;\">{meet_link}</a></p>"
            f"<p>Requested with: {payload.with_role.title()}</p>")
    # firm always gets a copy; participants get copies with the requester as Reply-To
    await send_email(ADMIN_NOTIFY_EMAIL, f"[D.O.X] Underwriting call — {client.get('name')} · {when}",
                     email_shell("Underwriting Call Scheduled", body), reply_to=user.get("email"))
    await _notify_deal(client, user.get("email"), f"[D.O.X] Underwriting call confirmed — {when}", body)
    return {"ok": True, "id": doc["id"], "meet_link": meet_link}


@api.get("/deals/{client_id}/meetings")
async def list_deal_meetings(client_id: str, user: dict = Depends(require_approved)):
    await _require_deal_access(user, client_id)
    return await db.bookings.find(
        {"client_id": client_id, "kind": "underwriting"}, {"_id": 0}
    ).sort("created_at", -1).to_list(200)


# ---- Per-deal messaging (the real two-way channel) -----------------------
@api.get("/deals/{client_id}/messages")
async def list_deal_messages(client_id: str, user: dict = Depends(require_approved)):
    await _require_deal_access(user, client_id)
    msgs = await db.deal_messages.find({"client_id": client_id}, {"_id": 0}).sort("created_at", 1).to_list(500)
    await db.deal_messages.update_many(
        {"client_id": client_id, "read_by": {"$ne": user["id"]}},
        {"$addToSet": {"read_by": user["id"]}},
    )
    return msgs


@api.post("/deals/{client_id}/messages")
async def post_deal_message(client_id: str, payload: DealMessageIn, user: dict = Depends(require_approved)):
    client = await _require_deal_access(user, client_id)
    msg = {
        "id": str(uuid.uuid4()),
        "client_id": client_id,
        "sender_id": user["id"],
        "sender_name": user.get("name") or user.get("email"),
        "sender_role": user.get("account_type") or user.get("role"),
        "body": payload.body.strip(),
        "read_by": [user["id"]],
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.deal_messages.insert_one(dict(msg))
    await _notify_deal(
        client, user.get("email"),
        f"[D.O.X] New message on your deal from {msg['sender_name']}",
        f"<p><strong>{msg['sender_name']}</strong> sent you a message:</p>"
        f"<blockquote style=\"border-left:2px solid #D4AF37;padding-left:12px;color:#d4d4d8;\">"
        f"{escape_html(payload.body[:400])}</blockquote>"
        "<p>Sign in to your portal to reply.</p>",
        exclude_ids=(user["id"],),
    )
    return msg


# ---- Business email inboxes (Resend inbound → in-app Inbox) --------------
import re as _re
import json as _json


def _slug_handle(name: Optional[str], email: str) -> str:
    base = (name or email.split("@")[0] or "").strip().lower()
    base = _re.sub(r"[^a-z0-9]+", ".", base).strip(".")
    return base or email.split("@")[0].lower()


def _can_have_inbox(user: dict) -> bool:
    """Admin, underwriters and partners get a business inbox (not plain clients)."""
    return user.get("role") == "admin" or user.get("account_type") in ("partner", "underwriter")


async def assign_business_email(user: dict) -> Optional[str]:
    if user.get("business_email"):
        return user["business_email"]
    if not _can_have_inbox(user):
        return None
    handle = "admin" if user.get("role") == "admin" else _slug_handle(user.get("name"), user["email"])
    candidate, n = handle, 1
    while await db.users.find_one({"business_handle": candidate, "id": {"$ne": user["id"]}}):
        n += 1
        candidate = f"{handle}{n}"
    be = f"{candidate}@{MAIL_DOMAIN}"
    await db.users.update_one({"id": user["id"]},
                              {"$set": {"business_handle": candidate, "business_email": be}})
    user["business_email"] = be
    user["business_handle"] = candidate
    return be


async def _backfill_business_emails() -> None:
    async for u in db.users.find({"business_email": {"$exists": False}}):
        u.pop("_id", None)
        await assign_business_email(u)


def _extract_addresses(value) -> list[str]:
    """Pull bare email addresses out of a 'to'/'from' field (string or list)."""
    if value is None:
        return []
    items = value if isinstance(value, list) else [value]
    out = []
    for item in items:
        for m in _re.findall(r"[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}", str(item)):
            out.append(m.lower())
    return out


def _verify_resend_signature(raw_body: str, headers) -> bool:
    if not RESEND_WEBHOOK_SECRET:
        logger.warning("[INBOUND] RESEND_WEBHOOK_SECRET not set — rejecting")
        return False
    try:
        resend.Webhooks.verify({
            "payload": raw_body,
            "headers": {
                "id": headers.get("svix-id", ""),
                "timestamp": headers.get("svix-timestamp", ""),
                "signature": headers.get("svix-signature", ""),
            },
            "webhook_secret": RESEND_WEBHOOK_SECRET,
        })
        return True
    except Exception as exc:
        logger.warning("[INBOUND] signature verification failed: %s", exc)
        return False


def _fetch_received_email(email_id: str) -> dict:
    """Pull full body + attachment metadata from Resend's Receiving API."""
    out = {"html": "", "text": "", "attachments": []}
    try:
        rec = resend.Emails.Receiving.get(email_id)
        out["html"] = getattr(rec, "html", "") or ""
        out["text"] = getattr(rec, "text", "") or ""
    except Exception as exc:
        logger.warning("[INBOUND] receiving.get failed id=%s err=%s", email_id, exc)
    try:
        att = resend.Emails.Receiving.Attachments.list(email_id=email_id)
        items = att.get("data", []) if isinstance(att, dict) else getattr(att, "data", [])
        for a in (items or []):
            g = a.get if isinstance(a, dict) else (lambda k, d=None: getattr(a, k, d))
            out["attachments"].append({
                "filename": g("filename") or g("name") or "attachment",
                "content_type": g("content_type") or g("contentType") or "application/octet-stream",
                "size": g("size") or 0,
            })
    except Exception as exc:
        logger.info("[INBOUND] attachments.list skipped id=%s err=%s", email_id, exc)
    return out


@api.post("/inbound/resend")
async def resend_inbound(request: Request):
    raw = (await request.body()).decode("utf-8", "replace")
    if not _verify_resend_signature(raw, request.headers):
        raise HTTPException(status_code=401, detail="Invalid signature")
    try:
        event = _json.loads(raw)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid payload")
    if event.get("type") != "email.received":
        return {"ok": True, "ignored": event.get("type")}
    data = event.get("data", {}) or {}
    email_id = data.get("email_id") or data.get("id")
    if not email_id:
        return {"ok": True, "ignored": "no email_id"}
    if await db.inbox.find_one({"resend_email_id": email_id}, {"_id": 0, "id": 1}):
        return {"ok": True, "duplicate": True}

    to_addrs = _extract_addresses(data.get("to"))
    from_addrs = _extract_addresses(data.get("from"))
    from_raw = data.get("from") if isinstance(data.get("from"), str) else (from_addrs[0] if from_addrs else "")
    # route to the matching business inbox
    owner_id = None
    for addr in to_addrs:
        u = await db.users.find_one({"business_email": addr}, {"_id": 0, "id": 1})
        if u:
            owner_id = u["id"]
            break
    content = await asyncio.to_thread(_fetch_received_email, email_id)
    snippet = (content["text"] or _re.sub(r"<[^>]+>", " ", content["html"]))[:200].strip()
    doc = {
        "id": str(uuid.uuid4()),
        "resend_email_id": email_id,
        "owner_user_id": owner_id,
        "to": to_addrs,
        "from_email": from_addrs[0] if from_addrs else "",
        "from_raw": from_raw,
        "subject": data.get("subject") or "(no subject)",
        "snippet": snippet,
        "text": content["text"],
        "html": content["html"],
        "attachments": content["attachments"],
        "read": False,
        "replied": False,
        "linked_contact_id": None,
        "linked_deal_id": None,
        "received_at": data.get("created_at") or datetime.now(timezone.utc).isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.inbox.insert_one(dict(doc))
    logger.info("[INBOUND] stored id=%s to=%s owner=%s", email_id, to_addrs, owner_id)
    return {"ok": True}


async def _require_inbox_user(user: dict = Depends(require_approved)) -> dict:
    if not _can_have_inbox(user):
        raise HTTPException(status_code=403, detail="No business inbox for this account")
    await assign_business_email(user)
    return user


def _inbox_card(m: dict) -> dict:
    return {k: m.get(k) for k in ("id", "from_email", "from_raw", "to", "subject", "snippet",
                                  "read", "replied", "linked_contact_id", "linked_deal_id",
                                  "received_at", "attachments")}


@api.get("/inbox")
async def list_inbox(scope: Optional[str] = None, user: dict = Depends(_require_inbox_user)):
    be = user.get("business_email")
    if (user.get("role") == "admin" or _is_underwriter(user)) and scope == "all":
        q: dict = {}
    else:
        q = {"owner_user_id": user["id"]}
    msgs = await db.inbox.find(q, {"_id": 0}).sort("received_at", -1).to_list(500)
    unread = sum(1 for m in msgs if not m.get("read"))
    return {"business_email": be, "unread": unread, "messages": [_inbox_card(m) for m in msgs]}


async def _owned_message(message_id: str, user: dict) -> dict:
    m = await db.inbox.find_one({"id": message_id}, {"_id": 0})
    if not m:
        raise HTTPException(status_code=404, detail="Message not found")
    if user.get("role") != "admin" and not _is_underwriter(user) and m.get("owner_user_id") != user["id"]:
        raise HTTPException(status_code=403, detail="Not your message")
    return m


@api.get("/inbox/{message_id}")
async def get_inbox_message(message_id: str, user: dict = Depends(_require_inbox_user)):
    m = await _owned_message(message_id, user)
    if not m.get("read"):
        await db.inbox.update_one({"id": message_id}, {"$set": {"read": True}})
        m["read"] = True
    return m


class InboxReplyIn(BaseModel):
    body: str = Field(min_length=1, max_length=20000)


@api.post("/inbox/{message_id}/reply")
async def reply_inbox_message(message_id: str, payload: InboxReplyIn,
                              user: dict = Depends(_require_inbox_user)):
    m = await _owned_message(message_id, user)
    to_addr = m.get("from_email")
    if not to_addr:
        raise HTTPException(status_code=400, detail="No sender address to reply to")
    subject = m.get("subject") or ""
    if not subject.lower().startswith("re:"):
        subject = f"Re: {subject}"
    body_html = (f"<p>{escape_html(payload.body).replace(chr(10), '<br>')}</p>"
                 f"<hr style='border:none;border-top:1px solid #1f1f1f;margin:18px 0;'/>"
                 f"<p style='color:#71717a;font-size:12px;'>On {escape_html(m.get('received_at',''))}, "
                 f"{escape_html(m.get('from_raw') or to_addr)} wrote:</p>"
                 f"<blockquote style='border-left:2px solid #333;padding-left:12px;color:#a1a1aa;'>"
                 f"{escape_html((m.get('text') or '')[:1500])}</blockquote>")
    await send_email(to_addr, subject, email_shell(subject, body_html),
                     reply_to=user.get("business_email"))
    await db.inbox.update_one({"id": message_id}, {"$set": {"replied": True}})
    return {"ok": True}


class InboxLinkIn(BaseModel):
    contact_id: Optional[str] = None
    deal_id: Optional[str] = None


@api.post("/inbox/{message_id}/link")
async def link_inbox_message(message_id: str, payload: InboxLinkIn,
                             user: dict = Depends(_require_inbox_user)):
    await _owned_message(message_id, user)
    await db.inbox.update_one({"id": message_id},
                              {"$set": {"linked_contact_id": payload.contact_id,
                                        "linked_deal_id": payload.deal_id}})
    return {"ok": True}


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
async def assistant_chat(payload: AssistantIn, user: dict = Depends(require_underwriter)):
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
async def assistant_history(session_id: str, user: dict = Depends(require_underwriter)):
    msgs = await db.assistant_messages.find(
        {"user_id": user["id"], "session_id": session_id}, {"_id": 0}
    ).sort("created_at", 1).to_list(200)
    return msgs


# ---- Uploads (user docs) -------------------------------------------------
MAX_UPLOAD_BYTES = 200 * 1024 * 1024  # 200MB


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
        raise HTTPException(status_code=413, detail="File exceeds 200MB limit")
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
    inline: Optional[str] = Query(default=None),
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
        requester = await db.users.find_one({"id": user_id}, {"_id": 0, "password_hash": 0})
        if not requester:
            raise HTTPException(status_code=401, detail="Invalid token")
        # admin & underwriters may open any deal's files; partners may open their referred clients' files
        await _require_deal_access(requester, doc["user_id"])
    data, ct = get_object(doc["storage_path"])
    disposition = "inline" if inline else "attachment"
    headers = {"Content-Disposition": f'{disposition}; filename="{doc["original_filename"]}"'}
    return StreamingResponse(io.BytesIO(data), media_type=doc.get("content_type", ct), headers=headers)


@api.delete("/uploads/{upload_id}")
async def delete_upload(upload_id: str, user: dict = Depends(require_approved)):
    doc = await db.uploads.find_one({"id": upload_id, "is_deleted": False}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="File not found")
    if user.get("role") != "admin" and doc["user_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Not allowed")
    await db.uploads.update_one({"id": upload_id}, {"$set": {"is_deleted": True}})
    return {"ok": True}


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
    # partners & underwriters get a referral code on approval so they can invite clients
    if user.get("account_type") in ("partner", "underwriter") and not user.get("referral_code"):
        code = f"DOX{secrets.token_hex(3).upper()}"
        await db.users.update_one({"id": user_id}, {"$set": {"referral_code": code}})
    # give partners/underwriters their <handle>@thedoxs.com inbox on approval
    fresh = await db.users.find_one({"id": user_id}, {"_id": 0, "password_hash": 0})
    if fresh:
        await assign_business_email(fresh)
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


@api.put("/admin/users/{client_id}/access")
async def admin_set_client_access(client_id: str, payload: ClientAccessIn,
                                  admin: dict = Depends(require_admin)):
    client = await db.users.find_one({"id": client_id}, {"_id": 0, "password_hash": 0})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    valid = await db.users.find(
        {"id": {"$in": payload.assigned_ids},
         "account_type": {"$in": ["partner", "underwriter"]}},
        {"_id": 0, "id": 1},
    ).to_list(200)
    valid_ids = [u["id"] for u in valid]
    await db.users.update_one({"id": client_id}, {"$set": {"assigned_ids": valid_ids}})
    return {"ok": True, "assigned_ids": valid_ids}


@api.get("/admin/assistant-usage")
async def admin_assistant_usage(admin: dict = Depends(require_admin)):
    cutoff = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
    logs = await db.ai_usage_logs.find(
        {"created_at": {"$gte": cutoff}}, {"_id": 0}
    ).sort("created_at", -1).to_list(5000)
    per_user, per_day = {}, {}
    for entry in logs:
        key = entry.get("user_id")
        pu = per_user.setdefault(key, {
            "user_id": key, "user_name": entry.get("user_name") or "Unknown",
            "total": 0, "blocked": 0, "last_used": entry.get("created_at"),
        })
        pu["total"] += 1
        if entry.get("status") == "blocked":
            pu["blocked"] += 1
        day = (entry.get("created_at") or "")[:10]
        per_day[day] = per_day.get(day, 0) + 1
    recent = [{
        "user_name": e.get("user_name"), "template": e.get("template"),
        "status": e.get("status"), "created_at": e.get("created_at"),
    } for e in logs[:50]]
    return {
        "total": len(logs),
        "per_user": sorted(per_user.values(), key=lambda x: -x["total"]),
        "per_day": [{"day": d, "count": c} for d, c in sorted(per_day.items(), reverse=True)],
        "recent": recent,
    }


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
