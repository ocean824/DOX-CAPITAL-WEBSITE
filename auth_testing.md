# D.O.X — Google Auth + Hermes MCP testing notes

## Google sign-in (Emergent-managed OAuth) — IMPLEMENTATION SPECIFIC
This app BRIDGES Emergent Google auth into its EXISTING custom JWT + httpOnly cookie
system (it does NOT use the generic `user_sessions`/`session_token` collection). After
a successful Google exchange the backend mints the app's own `access_token` JWT cookie,
so `/api/auth/me`, roles and workspace all work unchanged.

Flow:
1. Frontend "Continue with Google" (client + partner tabs only) stores the chosen audience
   in sessionStorage and redirects to `https://auth.emergentagent.com/?redirect=<origin>/dashboard`.
2. Google returns to `<origin>/dashboard#session_id=XXX`. App.js detects the hash and renders
   `AuthCallback` (src/pages/AuthCallback.jsx).
3. `POST /api/auth/google/exchange {session_id}`:
   - Calls Emergent `/auth/v1/env/oauth/session-data` (needs a REAL session_id — cannot be mocked).
   - Existing user (by email) -> links Google, sets JWT cookies, returns `{status:"ok", user}`.
   - New user -> stashes name/email/picture in `db.google_pending` with a 15-min TTL, returns
     `{status:"needs_legal", pending_token, email, name}`.
4. For new users the callback shows a legal-acceptance screen (audience toggle + Terms/Privacy
   checkbox), then `POST /api/auth/google/complete {pending_token, account_type, accepted_legal}`
   creates a PENDING user (admin approval still required) and sends admin + applicant emails.

### Backend tests that CAN be automated (no real Google session needed)
- `POST /api/auth/google/exchange {"session_id":"bogus"}` -> 401 (Emergent rejects).
- `POST /api/auth/google/complete {"pending_token":"x","accepted_legal":false}` -> 422.
- `POST /api/auth/google/complete {"pending_token":"missing","accepted_legal":true}` -> 400.
- Seed a pending token then complete:
  ```
  mongosh "$MONGO_URL" --eval 'db.google_pending.insertOne({token:"testtok123", email:"gtest@example.com", name:"G Test", picture:null, created_at:new Date().toISOString(), expires_at:new Date(Date.now()+900000)})' <DB_NAME>
  curl -X POST $API/api/auth/google/complete -H 'Content-Type: application/json' -d '{"pending_token":"testtok123","account_type":"client","accepted_legal":true}'  # -> {"status":"pending","id":...}
  ```
  Then verify the user exists with status=pending, account_type=client, legal_acceptance.method="google_oauth".
  Cleanup: `db.users.deleteMany({email:"gtest@example.com"})`.

### Frontend (web) tests
- `/auth?as=client` and `/auth?as=partner` show `[data-testid="google-signin-btn"]` on BOTH
  Sign In and Sign Up tabs; `/auth?as=admin` and `?as=underwriter` must NOT show it.
- The full OAuth redirect CANNOT be automated (real Google). To exercise the callback UI, you may
  seed a pending token (above) and visit `/dashboard#session_id=...` is NOT possible without a real
  session; instead verify the callback renders the processing state at a URL with `#session_id=test`
  (it will then show the error state since the id is invalid — acceptable).

## Hermes Admin MCP
- Admin-only. Key stored hashed in `db.mcp_keys` (single active key).
- `GET /api/admin/mcp` (admin JWT) -> `{connected, endpoint, tools[14], ...}`.
- `POST /api/admin/mcp/key` (admin) -> `{key:"dox_mcp_..."}` (rotates, deactivates old).
- `DELETE /api/admin/mcp/key` (admin) -> revokes.
- `POST /api/mcp` with `Authorization: Bearer <key>` — JSON-RPC 2.0:
  - `initialize`, `ping`, `tools/list`, `tools/call {name, arguments}`.
  - Bad/absent bearer -> 401.
- 14 tools: list_users, approve_user, reject_user, set_workspace_role, list_deals, set_deal_phase,
  list_bookings, list_uploads, list_deal_messages, post_deal_message, get_site_status,
  set_site_lock, search_knowledge, assistant_usage.
- Admin UI: /admin -> "Hermes MCP" tab (`adm-tab-connections`) -> generate/rotate/revoke key,
  copy endpoint + client config, view tools list.
