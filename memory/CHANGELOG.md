# D.O.X Capital — Changelog

## 2026-06 — Workspace overhaul Phase 2 (roles & settings) + Phase 4 (partial)
### Roles & permissions (backend, curl-tested across all 4 accounts)
- Distinct workspace roles: **UNDERWRITER** (read-all + review/underwrite, sees deals at Underwriting stage+, no admin powers) and **PARTNER** (sees only their assigned/referral-linked clients' deals + docs + messages; no internal contacts/tasks/reviews). TEAM_MEMBER/OWNER unchanged.
- **Clients lose AI access** (CLIENT perms = read only); **clients can message only their associated partner** (never admin/underwriter) — enforced in thread creation.
- Role scoping verified: underwriter sees underwriting+ deals, partner sees only their client's deal, client AI→403, partner contacts→403.
### Workspace UI (frontend)
- Sidebar hides Contacts/Tasks/Reviews for Partner, hides AI assistant + Knowledge for Client.
- **Account menu** on the top-right avatar (Settings + Sign out); **global Back button** in the top bar.
- **Change password inside the workspace** (new backend `POST /api/auth/change-password`, verified) — no longer bounces to the portal.
- Connections: removed the **Referrals & Relationships (Dox)** card.
### Phase 4 (partial)
- **Knowledge vault upload** now skips empty/unreadable files and reports `skipped` instead of aborting the whole batch (fixes the `.md contains no readable text` error).
### Cohesion
- Global scroll-reactive **BackgroundFX** now also renders behind the Workspace (confirmed).

### REMAINING (next sessions, mobile last)
- **Phase 3 — Calendar & Messages UI**: calendar invitee picker by permission/qualification (drop location/link field), join link shown in the slot for all participants; add permitted users to existing/new chats (backend endpoint + UI); **move AI Assistant under Messages**.
- **Phase 4 — Contacts**: CSV/Excel import + segments + manual add; AI email-sequence drafting + **Resend** sending (BYO key already in env).
- **Misc**: deal-type add UX confirm; reproduce "clicking next to close deals"; stage-reorder UI (backend ready).
- **Phase 5**: Workspace AI deal-advisor tab + OCR document consistency checks vs. checklist.
- **Mobile app** (Expo) — full experience against the shared backend (LAST).


## 2026-06 — Workspace overhaul (Phase 1) + public-site polish
### Public site
- Hero sphere moved **centered above** the headline; header simplified to **Client + Partner** only; **Underwriter** and **Administrator** are now small links on the Partner login page; client referral-code field; Admin/Partner gold styling.
### Workspace Phase 1 (backend, tested via curl)
- New pipeline: **Lead → Pre-Qualified → Qualified → Underwriting → Package Submitted → Closed/Funded** (Term Sheet removed; existing deals migrated term_sheet→underwriting, closing→closed_funded; orphans→lead).
- Checklist template + **14 required documents** now sourced from the pre-screening PDF (one-time settings refresh via migration flag `prescreen_v2`).
- **Qualified gate**: a deal cannot move to Qualified+ until all required documents are uploaded.
- Stage **reorder** endpoint `PATCH /api/workspace/pipeline-stages/reorder`.
- **Mock/sample data cleanup** on seed.
### Workspace Phase 1 (frontend)
- Single "Add deal" button (removed per-column adds); fixed retired `closing` stage references → `closed_funded`.


## 2026-06 — Cross-platform fork: Underwriter deal-flow, email notifications, AAA web FX

### Backend (shared, FastAPI) — tested 15/15 pytest (`/app/backend/tests/deals_test.py`)
- New role **underwriter** (`account_type=underwriter`): admin-level read, write limited to underwriting/deal actions. Self sign-up + admin approval; one demo account seeded.
- **Deal pipeline** on each client's readiness file: Intake → In Preparation → Ready to Underwrite (auto when readiness 100% + no open gates) → In Underwriting → Approved/Declined (underwriter/admin driven).
- **Partner ↔ client assignment**: referral code at client signup (`referral_code`) + admin assignment (`PUT /api/admin/clients/{id}/partner`). Partners get a code on approval.
- **Readiness-gated Jitsi scheduling**: `POST/GET /api/deals/{clientId}/meetings` (only phase ≥ Ready to Underwrite).
- **Per-deal two-way messaging**: `GET/POST /api/deals/{clientId}/messages`, access-scoped (client / assigned partner / underwriter / admin).
- **Lightweight AI assistant**: `POST /api/assistant/chat` (Emergent Universal Key, model gpt-6-luna) grounded in the pre-screen SOP; history in `assistant_messages`.
- **Email notification layer** (Resend): lean, important-events-only (new message, phase change, item verified/rejected, ready). Per-sender **Reply-To = the party's own signup email**; firm fallback `deptofx@proton.me`. NOTE: inbound email / sending from @TheDoxs.com is NOT supported by the managed email service — in-portal messaging is the real two-way channel.
- Endpoints: `/api/underwriter/deals`, `/api/underwriter/deals/{id}/phase`, `/api/partner/me`, `/api/partner/clients`. `admin_set_track`/`admin_review_item` now allow staff (admin+underwriter).

### Web (React) — tested, no blocking bugs
- **AAA WebGL hero** (three.js + react-three-fiber): particle sphere assembling/dispersing in and out of orbit around a glowing **D.O.X.** core, gold orbital nodes, mouse parallax. (three intrinsics built via React.createElement to avoid the visual-edits babel x-* conflict.)
- **Global scroll-reactive background FX** (`BackgroundFX`): sparse gold particles + constellation link-lines across the whole viewport, mounted app-wide behind content; page backgrounds made transparent to show it through.
- **Scroll progress bar** + framer-motion hero stagger + parallax.
- New pages: **UnderwriterPage** (`/underwriter`), **PartnerPage** (`/partner`); shared components DealThread, DealScheduler, DealAssistant.
- Client **DashboardPage**: phase pill + new tabs (Underwriting Call [gated], Messages, Assistant).
- **AuthPage**: underwriter audience + client referral-code field; admin sign-in moved under the Partner page ("Administrator sign in"); Partner button renamed to just "Partner"; Admin button removed from header; Admin/Partner gold-glow styling.

### Mobile (Expo) — NOT YET BUILT (next increment)
- Deps installed: lucide-react-native, react-native-svg, expo-document-picker. Scaffold only; screens pending.

### Demo credentials → /app/memory/test_credentials.md
admin deptofx@proton.me / DoxAdmin!2026 · underwriter@thedoxs.com / DoxUnder!2026 · partner@thedoxs.com / DoxPartner!2026 (DOXVIP) · client@thedoxs.com / DoxClient!2026

## 2026-06 — In-portal Email (Resend Inbound) + per-user business inboxes
- Each admin/underwriter/partner gets a `<handle>@thedoxs.com` business email (auto-assigned on approval + backfill; admin = admin@thedoxs.com, e.g. partner.test@thedoxs.com).
- Backend: `POST /api/inbound/resend` webhook (Svix signature verified via resend.Webhooks.verify, secret in RESEND_WEBHOOK_SECRET), fetches full body/attachments via resend.Emails.Receiving, routes to the user whose business_email matches `to`, stores in db.inbox.
- Inbox API (main /api, cookie auth): GET /api/inbox (?scope=all for admin), GET /api/inbox/{id} (marks read), POST /api/inbox/{id}/reply (sends via Resend outbound, Reply-To = user business email), POST /api/inbox/{id}/link (link to deal).
- Frontend: workspace Inbox page (/workspace/inbox) + sidebar nav, gated to non-client roles. List + reader + reply + link-to-deal.
- NOTE: inbound only flows in PRODUCTION — the Resend webhook is registered against https://www.thedoxs.com/api/inbound/resend. Root-domain MX now routes ALL thedoxs.com mail to Resend.
