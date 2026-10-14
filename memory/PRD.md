# D.O.X Capital — Product Requirements

## Original Problem Statement
Rebuild thedoxs.com as a modernized Fortune-500 / Apple-grade institutional debt-advisory site with minimalist 3D animations. Include all original site functionality (services, branding, copy), plus: book a discovery call (free Jitsi), account sign-up with admin approval (emails to deptofx@proton.me), authenticated user portal with Upload Documents + Sign Documents tabs, and all site events routed to deptofx@proton.me.

**Extension (June 2026):** fold the GitHub add-on `ocean824/THE-DOXS-ADD-ON` (D.O.X Workspace: CRM, pipeline, deal checklists, documents, review queue, messaging, calendar, knowledge vault, AI assistant, integrations) into the same codebase as a sub-site at `thedoxs.com/workspace`, sharing the site's MongoDB and logins. The workspace must be **deal-agnostic** (contracting, underwriting, debt placement, advisory — not real estate), and the owner's uploaded **deal-flow SOPs are the assistant's source of truth**.

## User Personas
1. **Founder / CEO seeking capital** — books a discovery call, registers, uploads diligence, signs agreements; as a workspace CLIENT sees only their own deals.
2. **D.O.X staff / coordinator** — workspace TEAM_MEMBER: assigned deals, SOP checklists, documents, review submissions, assistant with a daily limit.
3. **D.O.X Admin (deptofx@proton.me)** — site admin and workspace OWNER: approvals, all deals, policies, service keys, knowledge vault + grants.

## Architecture
- FastAPI backend: `server.py` (marketing site, auth, bookings, portal uploads, admin) + `backend/workspace/` package (10 route modules) mounted under `/api/workspace`.
- React 19 + Tailwind + Shadcn frontend: marketing/portal pages under `src/pages`, workspace sub-app under `src/workspace` mounted at route `/workspace/*`.
- MongoDB shared: site `users` collection untouched; workspace mirrors accounts into `ws_users` (role/active/notification_preferences).
- Auth: one session. Site JWT cookie `access_token`; `workspace/core.current_user()` maps it to OWNER / TEAM_MEMBER / CLIENT. No second login.
- Integrations: Resend (site + workspace notification emails), Jitsi (discovery calls), Emergent object storage (uploads), Emergent universal key → OpenAI `gpt-6-luna` (assistant).

## Role mapping (server-side only)
| Site account | Workspace role |
|---|---|
| `role=admin` | OWNER |
| approved + `workspace_role=staff` | TEAM_MEMBER |
| approved (default) | CLIENT |
| pending / rejected | 403 → workspace gate |
Admins flip Client/Staff per user in the admin console (`POST /api/admin/users/{id}/workspace-role`).

## What's Been Implemented
### 2026-06-14 — Google sign-in + Hermes Admin MCP
- **Emergent-managed Google sign-in** bridged into the existing JWT/cookie auth (does NOT use the generic `user_sessions` table — mints the app's own `access_token` JWT so `/auth/me`, roles and workspace work unchanged). Button appears on Client + Partner public auth tabs only (not admin/underwriter). New Google users are created as `status=pending` (admin approval still required); `account_type` follows the tab used. First-time users accept Terms/Privacy on a callback screen before the account is created (`legal_acceptance.method=google_oauth`); existing accounts are linked by email. Password login now rejects empty-hash (Google-only) accounts.
  - Backend: `POST /api/auth/google/exchange`, `POST /api/auth/google/complete`; `db.google_pending` (15-min TTL). Frontend: `src/pages/AuthCallback.jsx`, hash-detection in `App.js`, guard in `lib/auth.jsx`, `GoogleButton` in `AuthPage.jsx`.
- **Hermes Admin MCP** — JSON-RPC 2.0 MCP server at `POST /api/mcp` (Bearer-auth via a rotatable admin key hashed in `db.mcp_keys`) exposing **39 admin tools** for near-full site control: user/member management (list/get/approve/reject/set-role/assign-partner/list partners+underwriters), deal pipeline (list/get deal, set phase, deal messages), full Workspace CRM (transactions create/update, contacts, tasks, pipeline stages, reviews + decide, activity, workspace users, settings), and operations/comms (bookings, uploads, inbox, compose_email, site lock, knowledge search, assistant usage). Workspace CRM tools reuse the real route handlers under an OWNER principal. Admin manages it in the `/admin` → "Hermes MCP" tab (generate/rotate/revoke key, copy endpoint + MCP client config, **copy/download a ready-to-hand Hermes setup guide** that embeds the endpoint + freshly-generated key, view the full tool list). Standalone guide at `/app/HERMES_SETUP.md`. Core 14 tools tested green in `iteration_13.json`; 39-tool expansion + CRM writes + validation self-verified via curl.


### 2026-06-02 — marketing site + portal
- Landing, Services, Track Record, Compliance, Book (Jitsi), Auth, Dashboard, Admin console; JWT auth with admin approval; Resend live on the verified `thedoxs.com` domain; object storage uploads.

### 2026-06 — Workspace sub-site at /workspace
- Ported the whole add-on: CRM contacts, pipeline board (drag/drop), deals + auto checklists, documents (20 MB, signature-checked, client submissions), review queue with second-owner approval, messaging + mentions + SSE live updates, calendar with propose/accept/decline, knowledge vault (md/txt/csv/json/yaml/docx/xlsx/pptx/pdf extraction) with per-person grants, AI assistant, Hermes/Dox integration contracts and the dox-vault CLI.
- Single sign-on via the site session; `Repo.scope()` and `permitted_filter()` kept intact as the authorization boundary.
- Workspace CSS fully scoped under `.workspace` / `.app-modal` so the marketing site is untouched.
- "Workspace" button in the site header + a card on `/dashboard` for approved users.
- Notification emails (messages, mentions, meetings, grants, client submissions) via the existing Resend key to each user's own address.

### 2026-06 — Deal-agnostic model + SOPs as source of truth
- Deal record: `title`, `location`, `value`, `deal_type`, `counterparty_id`, `deal_lead`, `engagement_date`, `diligence_date`, `close_date`. Legacy real-estate fields migrated automatically on startup.
- Pipeline: Lead → Qualified → Underwriting → Term sheet → Closing / funding.
- Settings → **Deal setup**: editable deal types, 8-step checklist template (title + day offset), required document categories. New deals inherit them.
- Contacts: client / counterparty / partner / advisor.
- Knowledge vault items carry `trust`: **SOP (source of truth)** or reference. SOPs are retrieved first and the system prompt makes them binding, cited, and non-negotiable ("not covered by the SOPs" instead of improvising).
- New assistant mode **"Next step per our SOPs"** (`deal_guidance`) combining the deal's live data with the SOPs.
- Fixed the CSRF origin check that blocked browser mutations behind the ingress.

### 2026-06 — Pre-launch lock (coming soon gate)
- Site-wide gate: every route (`/`, `/book`, `/auth`, `/dashboard`, `/admin`, `/workspace/*`) renders a "Coming Soon" page while the site is locked. Only `role=admin` passes.
- Server-enforced, not just UI: `POST /api/auth/login` returns 403 for non-admins, `/api/auth/register` and `/api/bookings` return 403 while locked.
- Public `GET /api/site/status` → `{locked}`; admin `POST /api/admin/site-lock` `{locked: bool}`; stored in `site_config` (`{key:"site"}`), **default = locked**.
- Admin console → "Site visibility" panel with a Go public / Lock site toggle (`data-testid="toggle-site-lock"`).
- Coming soon page has a discreet "Authorized access" button revealing the admin sign-in form (`data-testid`: `coming-soon`, `unlock-site-btn`, `prelaunch-email/password/submit`).
- Files: `frontend/src/components/SiteGate.jsx`, `frontend/src/components/ComingSoon.jsx`, `App.js`, `pages/AdminPage.jsx`, `backend/server.py`.

### 2026-06 — Copy cleanup + Partner / Client account types
- Homepage: removed the hero stat strip ($1M+ / 24h / 100%), removed the whole Track Record section (stats, skyscraper image, credit-committee quote); "90%+ success rate" replaced with "a high success rate … every sign-up is reviewed"; compliance line now "the bar set by professional compliance teams"; deal-size FAQ now "$50M+ debt facilities, structure built around the project".
- Removed the Services, Track Record and Compliance sub-pages (`MarketingSubPage.jsx` deleted, routes removed). Nav/footer "Services" and "Compliance" now anchor to the homepage sections.
- **Account types**: `users.account_type` = `partner` | `client`, set at registration. Partner registration auto-sets `workspace_role=staff` (→ workspace TEAM_MEMBER); clients stay CLIENT. Admin approves both, same flow; `sync_workspace_users()` now runs on approval. Account type shown on admin approvals + users lists.
- Header for anonymous visitors: **Partner Sign In** (`/auth?as=partner`) and **Client Sign In** (`/auth?as=client`) replacing the single Sign in. The "Workspace" button is now partner/admin only.
- `/auth` has an audience switch ("I'm raising capital" / "I refer deals") with separate copy and sign-up forms (Firm + deals referred for partners, Company + capital raise for clients).
- Landing areas: partners → `/workspace` after login (and `/dashboard` redirects them there); clients → `/dashboard` document portal (kicker now "Client Portal").

### 2026-06 — Client document readiness (pre-screening checklist)
- Source of truth: the user's "Loan Underwriting Pre-Screening Checklist" PDF, encoded in `/app/backend/prescreen_checklist.py` (Sections 1, 1A, 2, 3, 4, 5A, 5B, 6 + key figures + red-flag gates). Thresholds hard-coded as supplied: equity ≥ 20%, DSCR ≥ 1.25x, collateral coverage ≥ 125%, construction contingency ≥ 10%. Required items: 14 common, 22 total on the pre-revenue track, 26 on the operating track.
- Admin assigns the track (Pre-Revenue / Development vs Profitable Operating Company) — the client cannot; assignment emails the client.
- Client dashboard → **Document Readiness** tab: full checklist, per-item upload, bulk "unfiled" upload area, readiness %, calculated LTV / coverage / DSCR, and the underwriting gate list (clear / open / unknown).
- Admin console → **Readiness** tab: one row per approved client (partners excluded) with track buttons, progress, open-gate count, expandable sections, per-item status cycling (received → verified → rejected) and download links.
- At 100% required documents with no open gates: one-time email to `deptofx@proton.me` "X is underwriter-ready" (guarded by `ready_notified_at`). Per-file upload emails are suppressed for checklist uploads.
- The checklist is also seeded into the Workspace knowledge vault on startup as a shared SOP (`SOPs/loan-underwriting-pre-screening-checklist.md`, `trust=sop`) so the AI assistant answers document questions from it.
- Endpoints: `GET /api/prescreen/me`, `PUT /api/prescreen/me/metrics`, `GET /api/admin/prescreen`, `PUT /api/admin/prescreen/{user_id}/track`, `PUT /api/admin/prescreen/{user_id}/items/{item_id}`; uploads use `category=prescreen:<item_id>` or `prescreen:unassigned`.
- Tested: iteration_5.json — 100% pass, no bugs. Site left PUBLIC (maintenance lock off) at user's request.
- OPEN REQUEST: user wants Hermes (Telegram bridge) to receive readiness updates and allow admin approval of tasks from the phone — not built yet.

## Testing status
- `/app/test_reports/iteration_3.json`: 45/45 workspace + 27/27 legacy backend, 3-role frontend smoke, CSS-leak check — all pass.
- `/app/test_reports/iteration_4.json`: 24/24 rewritten workspace tests + 27/27 legacy, full deal-agnostic + SOP regression, no issues.
- Canonical suites: `/app/backend/tests/workspace_test.py`, `/app/backend/tests/backend_test.py`.

## Prioritized Backlog
### P0
- [x] Pre-launch "coming soon" lock over the whole site — admin-only entry (2026-06, verified).
- [ ] User uploads his real contracting/underwriting SOPs to the vault and marks them SOP.
- [ ] User provides the finalized signed-document URLs (NDA, engagement letter, KYC, suitability) to replace the placeholder docusign.com links on `/dashboard`.

### P1
- [ ] Deal-type-specific checklist templates (different steps for contracting vs underwriting).
- [ ] SOP compliance scoring per deal ("3 of 5 SOP gates cleared") on the deal detail page.
- [ ] Forgot-password / reset flow on the main site.
- [ ] Partner-issued referral codes for invites; wire the site lead form into the workspace Dox referral intake.
- [ ] Admin-editable sign-documents list (CRUD) instead of `DEFAULT_SIGN_DOCS`.

### P2
- [ ] Vector/embedding retrieval for the vault (today: Mongo text search + SOP-first ordering).
- [ ] Refactor the long marketing components (`LandingPage`, `BookPage`, `DashboardPage`, `AdminPage`) and add type coverage.
- [ ] Migrate the site's `@app.on_event` hooks to a lifespan context manager.
- [ ] SEO/OpenGraph, sitemap, cookie banner, privacy/terms pages.


## Changelog
- **2026-06 (this session):** Restricted AI assistant access to **Admin (OWNER) + Underwriter only**. Removed `ai` permission from PARTNER and TEAM_MEMBER in `workspace/core.py`; gated `/api/assistant/chat` + `/api/assistant/history` behind `require_underwriter`. Frontend: removed the "Assistant" tab from the client portal (`DashboardPage.jsx`), hid the AI-assistant nav item for non-intel roles (`Shell.js`), and guarded the `/workspace/assistant` route with an `Intel` wrapper (OWNER/UNDERWRITER only). Verified via curl: Client/Partner → 403, Underwriter/Admin → 200.

- **2026-06 (later, same session):** Major workspace/access iteration (web + shared backend; no mobile):
  - **Unified workspace:** partners & underwriters now use the SAME workspace as admin (`Shell.js` nav identical for all staff; only CLIENT restricted). Differences are permission-driven: partner granted `internal` (loads Contacts/Tasks/Reviews scoped to their clients) but still no `manage`/`review`/`delete`/`ai`; underwriter unchanged (all deals, no `manage`). Connections & site-maintenance remain admin-only. Sidebar made scrollable.
  - **Routing:** approved partner/underwriter land on `/workspace` after login (`AuthPage.jsx`); header shows single "Workspace" button; Underwriting prescreen console linked from the workspace sidebar (OWNER/UW). Referral banner moved onto the workspace Dashboard (`Dashboard.js`) for partner/underwriter; referral system extended to underwriters (`/partner/me`, `/partner/clients`, register referral lookup, lazy/backfilled codes).
  - **Underwriter bird's-eye:** `core.py` transaction & activity scope for UNDERWRITER = `{}` (all deals, same Overview as admin).
  - **Comms visibility:** admin + underwriter read ALL firm email (inbox `scope=all`, `_owned_message`) and all deal messages. Underwriter/partner can download client checklist docs (`_require_deal_access` used in `/uploads/{id}/download`).
  - **Underwriter console:** status is a dropdown incl. `missing`; eye-preview button (always visible, dimmed when no file) opens doc inline via `/uploads/{id}/download?inline=1`.
  - **Workspace transaction Messages tab:** staff select between linked client conversations and send via `/api/deals/{clientId}/messages` (`TransactionDetail.js`).
  - **Admin Console:** All Users / Clients / Partners tabs; Clients "Manage access" modal assigns partners/underwriters to a client's file+conversations via `PUT /api/admin/users/{clientId}/access` (sets `client.assigned_ids`, honored by `_require_deal_access` + `_deal_recipients`).
  - **Dates:** calendar-picker icon removed (type-to-enter); Key milestones (engagement/diligence/close) editable for staff via `PATCH /workspace/transactions/{id}` with order validation on any milestone key.
  - **Misc:** uploads cap raised to 200MB (`/uploads` + workspace docs); footer "PART OF LOSSLESS HOLDINGS" → "POWERED BY ZAVREX OS" (workspace) and "Powered by ZAVREX OS" added to site/portal footer; Book Discovery Call hidden when logged in; workspace identity card illuminated → Overview.
  - **Regression:** iteration_11 — 36/36 backend pytest pass; testing agent fixed a Rule-of-Hooks bug in `AdminPage.jsx` (hooks hoisted above early returns). Added `test_review_regression.py`.

- **2026-06 (later, same session):** Operations/Underwriter console (`UnderwriterPage.jsx`) parity fix (web only, no backend change):
  - Extracted the full underwriting function panel into a shared `DealPanel` component (phase actions + Review/Schedule/Messages tabs, gates, document sections, status cycling, inline preview).
  - The **"Your referred clients"** dropdown now renders `DealPanel` (full functions) instead of a messages-only `DealThread`, so Admin — whose referred-clients list is ALL clients via `/partner/clients` — gets identical underwriting capabilities on every client, matching the Underwriter.
  - Reordered: **"Deals ready for underwriting"** moved to the top (work surface first, `pb-10`), **"Your referred clients"** moved below (`pb-32`) with a helper subtitle. Verified via screenshot as admin: expanding a referred client shows phase actions + Review/Schedule/Messages.

- **2026-06 (later, same session):** Two completed backlog items (web + backend):
  - **Sidebar rename:** workspace sidebar "Underwriting console" link now reads **"Operations"** for OWNER/admin and stays "Underwriting console" for UNDERWRITER (`workspace/components/Shell.js`, role conditional). Link still routes to `/underwriter`.
  - **Legal e-sign on signup:** backend already recorded consent in `legal_acceptance` (version=`LEGAL_VERSION` "June 2026", terms/privacy doc ids, `accepted_at` timestamp, `ip` from X-Forwarded-For/client host, `user_agent`) and 422s when `accepted_legal` is false. Added the missing FRONTEND piece in `AuthPage.jsx`: a required e-sign checkbox for Client/Partner/Underwriter signups with links to `/legal/terms` and `/legal/privacy` and a "version June 2026 · recorded with timestamp + IP" notice; register submit disabled until checked; `accepted_legal` now sent in the payload. Verified via curl (true→created, false→422, IP/version/timestamp persisted) and screenshot (disabled button until checked).

- **2026-06 (later, same session):** Three items (web + backend), testing agent iteration_12 = 15/15 backend + full web e2e, no bugs:
  - **Underwriting quick filters (`UnderwriterPage.jsx`):** new `DealFilters` chip row atop the deals list — All / per-phase (only phases present) / "Gates open" + a "Sort: % ready" toggle. `visibleRows` derives from `rows` via `dealFilter`/`sortReady`; empty filter shows "No deals match this filter." testids `deal-filters`, `deal-filter-*`, `deal-sort-ready`.
  - **Contacts AI drafting:** new `draft` permission added to OWNER/UNDERWRITER/PARTNER only (`core.py` PERMS). New backend `POST /api/workspace/ai/contact-draft` (`ai_routes.py`, GPT-6 Luna via Emergent key, FORBIDDEN gateway + `_parse_drafts`) returns editable nurture email(s): single or a 3-step sequence (step/send_after/subject/body). New `ContactDraft` modal component wired into `Contacts.js` detail view behind a role check (Admin/Underwriter/Partner); each draft has Copy + Send (Send → `/api/inbox/compose`). Client blocked (403 + no button).
  - **Inbox reply fix + Compose (`Inbox.js`):** root cause — `.message-compose` is a flex ROW and the full-width "Link to deal" div squashed the reply textarea. Added `.inbox-compose` CSS (column layout, 120px textarea) → reply box now full-width. Added a **Compose** button + modal (To/Subject/Message) posting to new `POST /api/inbox/compose` (`server.py`, sends via Resend with the user's business email as reply-to).

- **2026-06 (later, same session):** Calendar availability + availability-aware client booking (web + backend), testing agent iteration_13 = 12/12 backend + web e2e, no bugs:
  - **Staff availability** (`availability.py` + `db.availability`, schemas `AvailabilityIn/Out`): weekly hours per weekday (on/off + start–end), blocked dates, and a bookable slot length. Endpoints `GET/PUT /api/workspace/availability` (all staff; CLIENT 403). Editor UI: `AvailabilityEditor` modal opened from an "Availability" button on `/workspace/calendar`.
  - **Client scheduler now picks specific people** (`DealScheduler.jsx`): `GET /api/deals/{cid}/team` lists the assigned underwriter + partner + admins (with `has_availability`); client selects person(s); `GET /api/deals/{cid}/slots?date=&person_ids=` returns the common available 30-min slots (intersection; people without availability impose no constraint → `unconstrained` free-time fallback). `create_deal_meeting` now takes `participant_ids`, resolves/validates them, and returns **409** if the chosen time is outside a selected person's hours or on a blocked date; bookings store `participant_names`. DealScheduler ungated for staff (viewer != client) since the doc-approval gate is client-only (backend already enforced this).
  - **Accept/deny invitations** already existed for workspace meetings (`/meetings/{id}/respond`, Calendar meeting detail) — left unchanged.

- **2026-06 (later, same session):** Three availability enhancements (web + backend), pytest `test_availability_scheduling.py` 12/12:
  - **Availability on Profile:** added a "Manage availability" entry on the Settings → My account tab (`Settings.js`), opening the same `AvailabilityEditor` — so staff can edit from Settings as well as the Calendar. Shown for all staff, hidden for clients.
  - **Slot buffers:** `buffer_minutes` added to the availability model/editor (`AvailabilityEditor` select). Slot generation now enforces a gap around existing bookings so staff aren't booked back-to-back (verified: a 09:00 booking with 15-min buffer removed 09:00+09:30 → 16 slots became 14).
  - **Timezone display:** slot computation rewritten to produce absolute **UTC instants** (`availability.py`, via `zoneinfo`; added `tzdata` to requirements). Each person's weekly hours are interpreted in their own `timezone`, intersected in UTC. The `/deals/{cid}/slots` endpoint returns ISO-UTC slots + `host_timezone`; the client scheduler (`DealScheduler.jsx`) renders each slot in the client's local timezone with the host's time beneath and a "Times in your timezone (X) · host in Y" note. Booking converts the picked instant back to the client's local date/time; backend validates the absolute instant (covers date/DST edges). NOTE: slot contract changed from naive "HH:MM" to ISO-UTC strings.