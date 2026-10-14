# Connecting Hermes to D.O.X Capital (MCP)

This guide lets Hermes (or any MCP-compatible agent — Claude Desktop, Cursor, etc.)
control the D.O.X Capital website through the **Hermes Admin MCP** server.

---

## 1. Get your API key (Admin only)
1. Sign in to the site as an **Admin**.
2. Go to **Admin → Hermes MCP** tab.
3. Click **Generate key** (or **Rotate key**). The key (`dox_mcp_...`) is shown **once** — copy it now and store it somewhere safe. Rotating or revoking instantly invalidates the old key.

Keep this key secret. Anyone with it has full admin control of the site.

---

## 2. Connection details
- **Transport:** HTTP, JSON-RPC 2.0 (MCP protocol version `2024-11-05`)
- **Endpoint:** `https://YOUR-SITE/api/mcp`  (shown in the Admin → Hermes MCP tab)
- **Auth:** every request must include the header
  `Authorization: Bearer dox_mcp_xxxxxxxx`

---

## 3a. Connect via an MCP client (Claude Desktop, Cursor, etc.)
Most desktop MCP clients speak stdio, so bridge to the HTTP endpoint with `mcp-remote`.
Add this to your MCP client config (e.g. `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "dox-hermes": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "https://YOUR-SITE/api/mcp",
        "--header",
        "Authorization: Bearer ${DOX_MCP_KEY}"
      ],
      "env": { "DOX_MCP_KEY": "dox_mcp_YOUR_KEY_HERE" }
    }
  }
}
```

Restart the client. The `dox-hermes` server appears with all tools available.

## 3b. Connect directly over JSON-RPC (Hermes / custom agent)
Point Hermes at the endpoint with the Bearer header and speak JSON-RPC:

```bash
# 1) Handshake
curl -s https://YOUR-SITE/api/mcp \
  -H "Authorization: Bearer $DOX_MCP_KEY" -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}'

# 2) Discover tools (returns name + description + JSON-Schema inputSchema for each)
curl -s https://YOUR-SITE/api/mcp \
  -H "Authorization: Bearer $DOX_MCP_KEY" -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'

# 3) Call a tool
curl -s https://YOUR-SITE/api/mcp \
  -H "Authorization: Bearer $DOX_MCP_KEY" -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call",
       "params":{"name":"list_users","arguments":{"status":"pending"}}}'
```

A tool result comes back as `result.content[0].text` (a JSON string). Errors are
returned with `result.isError = true`.

---

## 4. What Hermes can do (tools)

### Members & access
- `list_users(status?, account_type?)` — list clients/partners/underwriters
- `get_user(user_id)` — full profile
- `approve_user(user_id)` / `reject_user(user_id)` — gate signups
- `set_workspace_role(user_id, workspace_role)` — staff vs client
- `list_partners()` / `list_underwriters()`
- `assign_partner(client_id, partner_id|null)` — link a referring partner

### Deals (pre-screen pipeline)
- `list_deals()` — all client deals with phase, track & readiness score
- `get_deal(client_id)` — full readiness payload (checklist, gates, metrics)
- `set_deal_phase(client_id, phase, note?)` — in_underwriting | approved | declined
- `list_deal_messages(client_id)` / `post_deal_message(client_id, body)` — the in-portal thread

### Workspace CRM
- `ws_list_transactions()` / `ws_get_transaction(id)`
- `ws_create_transaction(data)` / `ws_update_transaction(id, data)`
- `ws_list_contacts()` / `ws_create_contact(data)` / `ws_update_contact(id, data)`
- `ws_list_tasks()` / `ws_add_task(transaction_id, data)` / `ws_update_task(id, data)`
- `ws_list_pipeline_stages()`
- `ws_list_reviews()` / `ws_get_review(id)` / `ws_decide_review(id, decision, note?)`
- `ws_list_activity()` — recent activity feed
- `ws_list_users()` — workspace members
- `ws_get_settings()` / `ws_update_settings(data)` — assistant limits & approval policy

### Operations & comms
- `list_bookings()` — discovery / underwriting calls
- `list_uploads()` — client document metadata
- `list_inbox(limit?)` — inbound emails
- `compose_email(to, subject, body)` — send email as D.O.X Capital
- `get_site_status()` / `set_site_lock(locked)` — public-site invite-only toggle
- `search_knowledge(query?)` — SOP / knowledge vault
- `assistant_usage()` — 30-day AI usage summary

> For the `ws_*` tools that take `data`, call `tools/list` first — each returns the exact
> JSON-Schema for its `data` object (field names, types, required fields).

---

## 5. Security
- One active key at a time. **Rotate** issues a new key and kills the old one; **Revoke** disables access entirely.
- The key is stored only as a hash on the server — it cannot be re-displayed, so save it when generated.
- All actions run with Admin/Owner authority and are recorded in the activity feed.
- `.env` secrets are never exposed through MCP.
