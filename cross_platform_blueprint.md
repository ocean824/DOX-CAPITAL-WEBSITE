# Cross-Platform Port Blueprint

## 1. Detection
- **Source Platform:** Web (`/app/frontend` is fully populated with 94+ files, React DOM)
- **Target Platform:** Mobile (`/app/mobile` is currently an empty Expo boilerplate)
- **Evidence:** 
  - `frontend/src/pages` contains main web pages (`LandingPage.jsx`, `AuthPage.jsx`, `DashboardPage.jsx`, `AdminPage.jsx`, `BookPage.jsx`)
  - `frontend/src/workspace` contains a full secondary application suite for partners and staff.
  - `mobile/app` contains only base boilerplate `index.tsx`, `_layout.tsx`, and `+html.tsx`.

## 2. Existing App Map
### Screens & Routes
- **`/` (LandingPage):** Public-facing marketing, value proposition, "Discovery Call" and "Sign In" CTAs.
- **`/book` (BookPage):** 3-step booking flow (Date/Time -> User Info -> Confirmation with Jitsi link).
- **`/auth` (AuthPage):** Tabbed interface (Login / Register) with audience toggle (`?as=client|partner|admin`).
- **`/dashboard` (DashboardPage):** Client portal for approved users. Tabs for Uploads, Sign Documents, Document Readiness (Checklist). Shows pending/rejected status banners.
- **`/admin` (AdminPage):** Operations console. Approvals, All Users, Readiness overview, Uploads list, Bookings list, and Site Lock toggle.
- **`/workspace/*` (WorkspaceApp):** Extensive partner/staff deal room application with sub-routes: Dashboard, Transactions, TransactionDetail, Contacts, Tasks, Reviews, Messages, Assistant, Settings, Integrations, Knowledge, Calendar.

### Components & State
- **State Management:** React Context (`AuthProvider`) for user session and token refresh.
- **UI Framework:** Shadcn-like components (Button, Input, Tabs, Select, Calendar, Badge, Label) styled with Tailwind CSS. Lucide React icons. Sonner for toast notifications.
- **Key Patterns:**
  - Multi-step forms (Booking).
  - Tabbed data views (Dashboard, Admin, Auth).
  - Reveal/scroll animations (`Reveal`, `HeroOrb`).

### Primary User Flows
1. **Client Flow:** Land -> Book Call / Register -> Wait for Approval -> Access Dashboard -> Upload Docs / Sign Docs / Track Readiness.
2. **Partner Flow:** Land -> Register as Partner -> Wait for Approval -> Access Workspace.
3. **Admin Flow:** Login -> Approve Users -> Review Uploads / Bookings -> Manage Prescreening Readiness.

## 3. Shared Backend API Surface (`/api`)
The new mobile app must reuse these existing endpoints via the `EXPO_PUBLIC_BACKEND_URL` prefix:

**Public / Config**
- `GET /api/` - Health check.
- `GET /api/site/status` - Returns `{ locked: bool }`.
- `GET /api/stats` - Public platform metrics.

**Auth**
- `POST /api/auth/register` - `{ name, email, password, company, role_requested, message, account_type }`
- `POST /api/auth/login` - `{ email, password }` -> Returns `{ user, access_token }`.
- `POST /api/auth/logout` - Clears session.
- `GET /api/auth/me` - Get current user.
- `POST /api/auth/refresh` - Rotate access token.

**Bookings**
- `POST /api/bookings` - `{ name, email, phone, company, role, capital_range, preferred_date, preferred_time, timezone, notes }` -> Returns Jitsi link.
- `GET /api/bookings/{booking_id}` - Get booking details.

**Documents (Admin Curated)**
- `GET /api/documents` - List external documents to sign (DocuSign links).

**Prescreen / Readiness**
- `GET /api/prescreen/me` - Get current user's checklist.
- `PUT /api/prescreen/me/metrics` - `{ metrics: {...} }` Update user metrics.
- `GET /api/admin/prescreen` - Admin: view all checklists.
- `PUT /api/admin/prescreen/{user_id}/track` - `{ track: "pre_revenue" | "operating" }` Admin sets track.
- `PUT /api/admin/prescreen/{user_id}/items/{item_id}` - `{ status, note }` Admin reviews checklist item.

**Uploads**
- `POST /api/uploads` - Multipart form `file` and `category`. 25MB max.
- `GET /api/uploads/mine` - List current user's uploaded files.
- `GET /api/uploads/{upload_id}/download` - Download file (requires auth).

**Admin Ops**
- `POST /api/admin/site-lock` - `{ locked: bool }`
- `GET /api/admin/users?status=...` - List users.
- `POST /api/admin/users/{user_id}/approve` - Approve account.
- `POST /api/admin/users/{user_id}/reject` - Reject account.
- `GET /api/admin/uploads` - List all uploads.
- `GET /api/admin/bookings` - List all bookings.
- `POST /api/admin/users/{user_id}/workspace-role` - `{ workspace_role: "staff" | "client" }`

**(Workspace)**
- Multiple endpoints under `workspace_auth`, `workspace_crm`, `workspace_documents`, `workspace_reviews`, `workspace_messages`, `workspace_ai`, `workspace_integrations`, `workspace_knowledge`, `workspace_calendar`.

## 4. Data Models & Integrations
- **MongoDB Collections:** `users`, `site_config`, `bookings`, `sign_documents`, `prescreen`, `uploads`, `knowledge_items`, plus workspace-specific collections.
- **Integrations:**
  - **Emergent Storage:** Object storage for file uploads.
  - **Resend:** Transactional emails (falls back to mock logging if no key).
  - **Jitsi:** Generates deterministic `meet.jit.si` room links for bookings.
  - **DocuSign:** External links provided in the `sign_documents` collection.

*Target Platform Variant Notes:* File uploads on mobile must use `expo-document-picker` to yield a file URI that is appended to `FormData` rather than a standard web `File` object. Auth must fall back to passing the token in the `Authorization: Bearer <token>` header since `httponly` cookies may face restrictions on React Native fetch depending on the setup.

## 5. Port Requirements (Target: Mobile Expo)
- **Framework:** Expo with `expo-router` using the `app/` directory paradigm.
- **Auth Implementation:** Store `access_token` and `refresh_token` in `expo-secure-store`. Modify the `api` axios/fetch wrapper to append `Authorization: Bearer <token>` instead of relying purely on cookies.
- **UI Translation:** 
  - Use `react-native-safe-area-context` for notches.
  - Use `KeyboardAvoidingView` or `react-native-keyboard-aware-scroll-view` for forms (especially Booking and Auth).
  - Translate Tailwind utility classes using NativeWind or direct `StyleSheet.create`.
  - Replace `lucide-react` with `lucide-react-native`.
- **Screen-by-Screen Port:**
  - `app/index.tsx` (Landing): Vertical scroll view, marketing copy, CTAs.
  - `app/book/index.tsx` (Booking): Multi-step form. Replace HTML calendar with a native date picker (`@react-native-community/datetimepicker`).
  - `app/auth/index.tsx` (Auth): Tabbed view (React Native Top Tabs or simple state-driven views) for Login/Register.
  - `app/(app)/dashboard.tsx` (Client Dashboard): Tabbed view. Replace dropzone with `expo-document-picker` for file uploads. Use `Linking.openURL` for DocuSign links and Jitsi links.
  - `app/(admin)/admin.tsx` (Admin Console): Approvals and site lock list views.
  - `app/(workspace)/...` (Workspace): Deeply nested folder mapping to the Workspace module. Will require bottom-tab navigation for the core deal-room views.

## 6. Open Questions / Risks
- **Scope of Workspace Port:** The `WorkspaceApp` on the web is incredibly massive (Transactions, Messages, AI Assistant, Calendar, Contacts, Settings). Does the initial mobile MVP require the entire workspace to be ported, or just the primary client-facing portal (Dashboard) and Booking flows?
- **File Upload Limits:** Mobile network latency vs the 25MB file upload limit. Consider adding upload progress indicators using Axios on mobile.
- **File Download Handling:** `GET /api/uploads/{id}/download` returns a binary stream. On mobile, this requires `expo-file-system` to save the file locally, then `expo-sharing` to let the user open/view it.
- **Push Notifications:** The backend currently sends Resend emails for state changes (approved, bookings, etc.). Should the mobile app wire up Expo Push Notifications eventually?