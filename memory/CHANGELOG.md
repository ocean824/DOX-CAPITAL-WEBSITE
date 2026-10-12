# D.O.X Capital — Changelog

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
