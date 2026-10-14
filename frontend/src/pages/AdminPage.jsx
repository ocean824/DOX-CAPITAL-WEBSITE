import { useCallback, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import NavBar from "../components/NavBar";
import Footer from "../components/Footer";
import { api, formatApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../components/ui/tabs";
import { AdminReadiness } from "../components/AdminReadiness";
import { toast } from "sonner";
import { Check, X, Download, Calendar as CalIcon, User as UserIcon, FileText, Video, Users as UsersIcon, Plug, KeyRound, Copy, Trash2, Sparkles } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "../components/ui/dialog";
import { Checkbox } from "../components/ui/checkbox";

export function AdminConsole({ embedded = false }) {
  const { user } = useAuth();
  const [users, setUsers] = useState([]);
  const [uploads, setUploads] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [accessClient, setAccessClient] = useState(null);
  const [accessIds, setAccessIds] = useState([]);

  const loadAll = useCallback(async () => {
    try {
      const [u, up, b] = await Promise.all([
        api.get("/admin/users"),
        api.get("/admin/uploads"),
        api.get("/admin/bookings"),
      ]);
      setUsers(u.data); setUploads(up.data); setBookings(b.data);
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || e.message);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (user && user !== false && user.role === "admin") loadAll();
    else if (user !== null) setLoading(false);
  }, [user, loadAll]);

  if (user === null) return <CenterMsg>Loading…</CenterMsg>;
  if (user === false) return <Navigate to="/auth" replace />;
  if (user.role !== "admin") return <Navigate to="/dashboard" replace />;

  const approve = async (id) => {
    try { await api.post(`/admin/users/${id}/approve`); toast.success("User approved"); loadAll(); }
    catch (e) { toast.error(formatApiError(e.response?.data?.detail) || e.message); }
  };
  const reject = async (id) => {
    try { await api.post(`/admin/users/${id}/reject`); toast.success("User rejected"); loadAll(); }
    catch (e) { toast.error(formatApiError(e.response?.data?.detail) || e.message); }
  };

  const setWorkspaceRole = async (id, workspace_role) => {
    try {
      await api.post(`/admin/users/${id}/workspace-role`, { workspace_role });
      toast.success(workspace_role === "staff" ? "Promoted to workspace staff" : "Set to workspace client");
      loadAll();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail) || e.message); }
  };

  const pending = users.filter((u) => u.status === "pending");  const everyone = users.filter((u) => u.role !== "admin");
  const clients = everyone.filter((u) => u.account_type !== "partner" && u.account_type !== "underwriter");
  const partners = everyone.filter((u) => u.account_type === "partner");
  const staffMembers = everyone.filter((u) => (u.account_type === "partner" || u.account_type === "underwriter") && u.status === "approved");

  const openAccess = (u) => { setAccessClient(u); setAccessIds(u.assigned_ids || []); };
  const toggleAccessId = (id) => setAccessIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  const saveAccess = async () => {
    try {
      await api.put(`/admin/users/${accessClient.id}/access`, { assigned_ids: accessIds });
      toast.success("Client access updated");
      setAccessClient(null);
      loadAll();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail) || e.message); }
  };

  const usersList = (list, onAccess) => (
    list.length === 0 ? <Empty text="No users in this group yet." /> : (
      <div className="border-y border-white/10 divide-y divide-white/10">
        {list.map((u) => (
          <div key={u.id} className="py-5 grid md:grid-cols-12 gap-4 items-center">
            <div className="md:col-span-4 flex items-center gap-3">
              <UserIcon className="h-4 w-4 text-white/40" strokeWidth={1.25} />
              <div>
                <div className="font-display text-base">{u.name}</div>
                <div className="text-white/50 text-xs">{u.email}</div>
                <div className="label-kicker text-[10px] mt-1 text-white/40">
                  {u.account_type === "partner" ? "Partner" : u.account_type === "underwriter" ? "Underwriter" : "Client"}
                </div>
              </div>
            </div>
            <div className="md:col-span-3 text-sm text-white/60">{u.company || "—"}</div>
            <div className="md:col-span-3 text-xs text-white/40">
              {new Date(u.created_at).toLocaleString()}
              {onAccess && u.status === "approved" && (u.assigned_ids?.length > 0) && (
                <div className="flex flex-wrap gap-1 mt-1.5" data-testid={`assigned-badges-${u.id}`}>
                  {u.assigned_ids.map((aid) => {
                    const m = everyone.find((x) => x.id === aid);
                    if (!m) return null;
                    return (
                      <span key={aid} data-testid={`assigned-badge-${u.id}-${aid}`}
                        className="text-[9px] tracking-wide uppercase border border-[hsl(var(--gold))]/40 text-[hsl(var(--gold))] px-1.5 py-0.5">
                        {m.name} · {m.account_type === "underwriter" ? "UW" : "Partner"}
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="md:col-span-2 flex flex-col items-end gap-2">
              <StatusBadge status={u.status} />
              {u.status === "approved" && (
                <div className="flex items-center gap-1">
                  <button data-testid={`ws-role-client-${u.id}`} onClick={() => setWorkspaceRole(u.id, "client")}
                    className={`text-[10px] tracking-widest uppercase border px-2 py-1 ${u.workspace_role !== "staff" ? "border-white/60 text-white" : "border-white/15 text-white/40 hover:text-white"}`}>Client</button>
                  <button data-testid={`ws-role-staff-${u.id}`} onClick={() => setWorkspaceRole(u.id, "staff")}
                    className={`text-[10px] tracking-widest uppercase border px-2 py-1 ${u.workspace_role === "staff" ? "border-[hsl(var(--gold))] text-[hsl(var(--gold))]" : "border-white/15 text-white/40 hover:text-white"}`}>Staff</button>
                </div>
              )}
              {onAccess && u.status === "approved" && (
                <button data-testid={`manage-access-${u.id}`} onClick={() => onAccess(u)}
                  className="text-[10px] tracking-widest uppercase border border-[hsl(var(--gold))]/40 text-[hsl(var(--gold))] px-2 py-1 hover:bg-[hsl(var(--gold))]/10 flex items-center gap-1">
                  <UsersIcon className="h-3 w-3" /> Manage access
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    )
  );

  return (
    <>
      <section className={embedded ? "pb-12" : "pt-32 pb-12 hero-glow"}>
        <div className="mx-auto max-w-7xl px-6 lg:px-12">
          {!embedded && <div className="label-kicker">Admin Console</div>}
          {!embedded && (
            <h1 className="font-display text-4xl lg:text-5xl font-light mt-3 leading-tight">
              D.O.X operations.
            </h1>
          )}
          <div className="grid sm:grid-cols-4 gap-px bg-white/10 mt-10 max-w-3xl">
            <Stat n={pending.length} label="Pending users" />
            <Stat n={everyone.length} label="Total partners" />
            <Stat n={uploads.length} label="Uploads" />
            <Stat n={bookings.length} label="Bookings" />
          </div>
        </div>
      </section>

      <section className="pb-32">
        <div className="mx-auto max-w-7xl px-6 lg:px-12">
          <Tabs defaultValue="approvals">
            <TabsList className="rounded-none bg-transparent p-0 gap-8 border-b border-white/10">
              <TabsTrigger data-testid="adm-tab-approvals" value="approvals"
                className="rounded-none data-[state=active]:bg-transparent data-[state=active]:text-white data-[state=active]:border-b data-[state=active]:border-white px-0 pb-3 text-white/60">
                Approvals
              </TabsTrigger>
              <TabsTrigger data-testid="adm-tab-users" value="users"
                className="rounded-none data-[state=active]:bg-transparent data-[state=active]:text-white data-[state=active]:border-b data-[state=active]:border-white px-0 pb-3 text-white/60">
                All Users
              </TabsTrigger>
              <TabsTrigger data-testid="adm-tab-clients" value="clients"
                className="rounded-none data-[state=active]:bg-transparent data-[state=active]:text-white data-[state=active]:border-b data-[state=active]:border-white px-0 pb-3 text-white/60">
                Clients
              </TabsTrigger>
              <TabsTrigger data-testid="adm-tab-partners" value="partners"
                className="rounded-none data-[state=active]:bg-transparent data-[state=active]:text-white data-[state=active]:border-b data-[state=active]:border-white px-0 pb-3 text-white/60">
                Partners
              </TabsTrigger>
              <TabsTrigger data-testid="adm-tab-readiness" value="readiness"
                className="rounded-none data-[state=active]:bg-transparent data-[state=active]:text-white data-[state=active]:border-b data-[state=active]:border-white px-0 pb-3 text-white/60">
                Readiness
              </TabsTrigger>
              <TabsTrigger data-testid="adm-tab-uploads" value="uploads"
                className="rounded-none data-[state=active]:bg-transparent data-[state=active]:text-white data-[state=active]:border-b data-[state=active]:border-white px-0 pb-3 text-white/60">
                Uploads
              </TabsTrigger>
              <TabsTrigger data-testid="adm-tab-bookings" value="bookings"
                className="rounded-none data-[state=active]:bg-transparent data-[state=active]:text-white data-[state=active]:border-b data-[state=active]:border-white px-0 pb-3 text-white/60">
                Bookings
              </TabsTrigger>
              <TabsTrigger data-testid="adm-tab-connections" value="connections"
                className="rounded-none data-[state=active]:bg-transparent data-[state=active]:text-white data-[state=active]:border-b data-[state=active]:border-white px-0 pb-3 text-white/60">
                Hermes MCP
              </TabsTrigger>
            </TabsList>

            <TabsContent value="approvals" className="mt-8">
              {pending.length === 0 ? (
                <Empty text="No pending applications right now." />
              ) : (
                <div className="divide-y divide-white/10 border-y border-white/10">
                  {pending.map((u) => (
                    <div key={u.id} className="py-6 grid md:grid-cols-12 gap-4 items-start">
                      <div className="md:col-span-4">
                        <div className="font-display text-xl">{u.name}</div>
                        <div className="text-white/50 text-sm">{u.email}</div>
                        <div data-testid={`acct-type-${u.id}`} className="label-kicker text-[10px] mt-2 text-[hsl(var(--gold))]">
                          {u.account_type === "partner" ? "Partner" : "Client"}
                        </div>
                      </div>
                      <div className="md:col-span-3 text-sm text-white/65">{u.company || "—"}</div>
                      <div className="md:col-span-3 text-sm text-white/65">{u.message || "—"}</div>
                      <div className="md:col-span-2 flex items-center justify-end gap-2">
                        <Button data-testid={`approve-${u.id}`} onClick={() => approve(u.id)}
                          className="rounded-none bg-white text-black hover:bg-white/90">
                          <Check className="h-4 w-4 mr-1" /> Approve
                        </Button>
                        <Button data-testid={`reject-${u.id}`} onClick={() => reject(u.id)}
                          variant="outline" className="rounded-none border-white/20 hover:bg-white/10">
                          <X className="h-4 w-4 mr-1" /> Reject
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="users" className="mt-8">
              {everyone.length === 0 ? <Empty text="No users yet." /> : usersList(everyone)}
            </TabsContent>

            <TabsContent value="clients" className="mt-8" data-testid="adm-clients-list">
              {usersList(clients, openAccess)}
            </TabsContent>

            <TabsContent value="partners" className="mt-8" data-testid="adm-partners-list">
              {usersList(partners)}
            </TabsContent>

            <TabsContent value="readiness" className="mt-8">
              <AdminReadiness />
            </TabsContent>

            <TabsContent value="uploads" className="mt-8">
              {uploads.length === 0 ? <Empty text="No uploads yet." /> : (
                <div className="border-y border-white/10 divide-y divide-white/10">
                  {uploads.map((u) => (
                    <div key={u.id} className="py-4 grid md:grid-cols-12 gap-4 items-center">
                      <div className="md:col-span-5 flex items-center gap-3 min-w-0">
                        <FileText className="h-4 w-4 text-white/40 shrink-0" strokeWidth={1.25} />
                        <div className="min-w-0">
                          <div className="truncate text-sm">{u.original_filename}</div>
                          <div className="text-xs text-white/40">{u.user_name} · {u.user_email}</div>
                        </div>
                      </div>
                      <div className="md:col-span-3 text-xs text-white/40">{new Date(u.created_at).toLocaleString()}</div>
                      <div className="md:col-span-2 text-xs text-white/50">{(u.size/1024).toFixed(1)} KB</div>
                      <div className="md:col-span-2 text-right">
                        <a href={`/api/uploads/${u.id}/download`}
                           target="_blank" rel="noreferrer"
                           data-testid={`adm-download-${u.id}`}
                           className="text-xs text-white/70 hover:text-white inline-flex items-center gap-1">
                          <Download className="h-3 w-3" /> download
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="bookings" className="mt-8">
              {bookings.length === 0 ? <Empty text="No bookings yet." /> : (
                <div className="border-y border-white/10 divide-y divide-white/10">
                  {bookings.map((b) => (
                    <div key={b.id} className="py-5 grid md:grid-cols-12 gap-4 items-center">
                      <div className="md:col-span-4">
                        <div className="font-display text-base">{b.name}</div>
                        <div className="text-white/50 text-xs">{b.email} · {b.phone || "—"}</div>
                      </div>
                      <div className="md:col-span-3 text-sm text-white/65">
                        <CalIcon className="h-3 w-3 inline mr-1 text-white/40" />
                        {b.preferred_date} {b.preferred_time} · {b.timezone}
                      </div>
                      <div className="md:col-span-3 text-sm text-white/65">
                        {b.company || "—"} · {b.capital_range || "—"}
                      </div>
                      <div className="md:col-span-2 text-right">
                        <a href={b.meet_link} target="_blank" rel="noreferrer"
                           className="text-xs text-[hsl(var(--gold))] hover:underline inline-flex items-center gap-1">
                          <Video className="h-3 w-3" /> Jitsi
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="connections" className="mt-8">
              <McpPanel />
            </TabsContent>
          </Tabs>
        </div>
      </section>

      <Dialog open={!!accessClient} onOpenChange={(o) => { if (!o) setAccessClient(null); }}>
        <DialogContent data-testid="client-access-modal" className="bg-[#0b0b10] border-white/15 text-white">
          <DialogHeader>
            <DialogTitle className="font-display font-light">Client access</DialogTitle>
            <DialogDescription className="text-white/55">
              Choose which partners and underwriters can view {accessClient?.name}'s file and conversations.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[50vh] overflow-y-auto divide-y divide-white/10 border-y border-white/10">
            {staffMembers.length === 0 ? (
              <p className="py-6 text-sm text-white/50">No approved partners or underwriters yet.</p>
            ) : staffMembers.map((s) => (
              <label key={s.id} data-testid={`access-option-${s.id}`}
                className="flex items-center gap-3 py-3 cursor-pointer">
                <Checkbox checked={accessIds.includes(s.id)} onCheckedChange={() => toggleAccessId(s.id)}
                  data-testid={`access-check-${s.id}`} className="border-white/30 data-[state=checked]:bg-[hsl(var(--gold))] data-[state=checked]:border-[hsl(var(--gold))]" />
                <span className="flex-1">
                  <span className="block text-sm">{s.name}</span>
                  <span className="block text-xs text-white/45">{s.email}</span>
                </span>
                <span className="label-kicker text-[10px] text-white/40">{s.account_type === "partner" ? "Partner" : "Underwriter"}</span>
              </label>
            ))}
          </div>
          <p className="text-[11px] text-white/35">Underwriters already have firm-wide review access; adding them here also includes them on this deal's conversation and notifications.</p>
          <DialogFooter>
            <Button data-testid="cancel-client-access" variant="outline" onClick={() => setAccessClient(null)}
              className="rounded-none border-white/20 hover:bg-white/10">Cancel</Button>
            <Button data-testid="save-client-access" onClick={saveAccess}
              className="rounded-none bg-white text-black hover:bg-white/90">Save access</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function AdminPage() {
  return (
    <div className="text-white min-h-screen grain">
      <NavBar />
      <AdminConsole />
      <Footer />
    </div>
  );
}

function Stat({ n, label }) {
  return (
    <div className="bg-[#050505] p-5">
      <div className="font-display text-3xl tabular">{n}</div>
      <div className="text-xs text-white/50 mt-1">{label}</div>
    </div>
  );
}
function StatusBadge({ status }) {
  const map = {
    pending: "border-[hsl(var(--gold))]/40 text-[hsl(var(--gold))]",
    approved: "border-emerald-500/40 text-emerald-300",
    rejected: "border-red-500/40 text-red-300",
  };
  return <span className={`text-[10px] tracking-widest uppercase border px-2 py-1 ${map[status] || ""}`}>{status}</span>;
}
function Empty({ text }) { return <div className="border border-white/10 p-10 text-white/40 text-sm">{text}</div>; }
function CenterMsg({ children }) { return <div className="min-h-screen flex items-center justify-center bg-[#050505] text-white/60 text-sm">{children}</div>; }

function McpPanel() {
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [newKey, setNewKey] = useState(null);
  const [activity, setActivity] = useState([]);

  const endpoint = `${process.env.REACT_APP_BACKEND_URL}/api/mcp`;

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/admin/mcp");
      setInfo(data);
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || e.message);
    } finally { setLoading(false); }
  }, []);

  const loadActivity = useCallback(async () => {
    try {
      const { data } = await api.get("/admin/mcp/activity?limit=50");
      setActivity(data);
    } catch { /* silent */ }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    loadActivity();
    const t = setInterval(loadActivity, 5000);
    return () => clearInterval(t);
  }, [loadActivity]);

  const generate = async () => {
    setBusy(true);
    try {
      const { data } = await api.post("/admin/mcp/key");
      setNewKey(data.key);
      load();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail) || e.message); }
    finally { setBusy(false); }
  };

  const revoke = async () => {
    setBusy(true);
    try {
      await api.delete("/admin/mcp/key");
      setNewKey(null);
      toast.success("MCP connection revoked");
      load();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail) || e.message); }
    finally { setBusy(false); }
  };

  const copy = async (text, msg = "Copied to clipboard") => {
    try { await navigator.clipboard.writeText(text); toast.success(msg); }
    catch { toast.error("Clipboard unavailable — select and copy manually."); }
  };

  const clientConfig = JSON.stringify({
    mcpServers: {
      "dox-hermes": {
        command: "npx",
        args: ["mcp-remote", endpoint, "--header", "Authorization: Bearer ${DOX_MCP_KEY}"],
        env: { DOX_MCP_KEY: newKey || "YOUR_KEY_HERE" },
      },
    },
  }, null, 2);

  const keyLine = newKey || "dox_mcp_YOUR_KEY_HERE";
  const toolLines = (info?.tools || []).map((t) => `- ${t.name}: ${t.description}`).join("\n");
  const guideText = `# Connecting Hermes to D.O.X Capital (MCP)

## 1. Get your key (Admin only)
Admin -> Hermes MCP tab -> Generate key. The key (dox_mcp_...) is shown ONCE — copy and store it.
Rotating or revoking instantly invalidates the old key.

## 2. Connection
Transport : HTTP, JSON-RPC 2.0 (MCP protocol 2024-11-05)
Endpoint  : ${endpoint}
Auth      : header  Authorization: Bearer ${keyLine}

## 3a. MCP client (Claude Desktop / Cursor) — add to your config:
${clientConfig}

## 3b. Direct JSON-RPC (Hermes / custom agent):
# handshake
curl -s ${endpoint} -H "Authorization: Bearer ${keyLine}" -H "Content-Type: application/json" \\
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}'
# discover tools (each returns its JSON-Schema inputSchema)
curl -s ${endpoint} -H "Authorization: Bearer ${keyLine}" -H "Content-Type: application/json" \\
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'
# call a tool
curl -s ${endpoint} -H "Authorization: Bearer ${keyLine}" -H "Content-Type: application/json" \\
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"list_deals","arguments":{}}}'

Tool results come back as result.content[0].text (a JSON string). Errors set result.isError=true.
For ws_* tools that take a "data" object, call tools/list first to get the exact field schema.

## 4. Available tools (${(info?.tools || []).length})
${toolLines}

## 5. Security
One active key at a time. Rotate = new key + old killed. Revoke = disable all access.
Key is stored hashed and cannot be re-displayed — save it on generation.
All actions run with Admin/Owner authority and are logged in the activity feed.
`;

  const downloadGuide = () => {
    const blob = new Blob([guideText], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "HERMES_SETUP.md"; a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) return <Empty text="Loading connection…" />;

  const connected = info?.connected;

  return (
    <div className="space-y-8">
      <div className="border border-white/10 p-6 lg:p-8 bg-white/[0.02]">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <Sparkles className="h-6 w-6 text-[hsl(var(--gold))]" strokeWidth={1.3} />
            <div>
              <div className="label-kicker text-[10px] text-white/40">Intelligence &amp; Control Plane</div>
              <h2 className="font-display text-2xl font-light mt-1">Hermes Admin MCP</h2>
            </div>
          </div>
          <span data-testid="mcp-status-badge"
            className={`text-[10px] tracking-widest uppercase border px-2.5 py-1 ${connected ? "border-emerald-500/40 text-emerald-300" : "border-white/20 text-white/40"}`}>
            {connected ? "Connected" : "Not connected"}
          </span>
        </div>
        <p className="text-white/55 text-sm mt-5 max-w-2xl">
          Give Hermes (or any MCP-compatible agent like Claude) a single admin key to run the firm —
          approve members, move deals, message clients, and control the public site through the tools below.
          The key is scoped to this endpoint and can be rotated or revoked at any time.
        </p>

        <div className="mt-6 grid gap-3 max-w-2xl">
          <div>
            <div className="label-kicker text-[10px] text-white/40 mb-1.5">MCP Endpoint</div>
            <div className="flex items-center gap-2">
              <code data-testid="mcp-endpoint" className="flex-1 text-xs text-white/80 bg-black/40 border border-white/10 px-3 py-2.5 truncate">{endpoint}</code>
              <Button data-testid="mcp-copy-endpoint" onClick={() => copy(endpoint, "Endpoint copied")} variant="outline"
                className="rounded-none border-white/20 hover:bg-white/10 h-[42px]"><Copy className="h-4 w-4" /></Button>
            </div>
          </div>
          {connected && (
            <div className="text-xs text-white/40">
              Issued by {info.created_by} · {info.created_at ? new Date(info.created_at).toLocaleString() : "—"} ·
              {" "}Last used {info.last_used ? new Date(info.last_used).toLocaleString() : "never"}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 mt-6 flex-wrap">
          <Button data-testid="mcp-generate-key" onClick={generate} disabled={busy}
            className="rounded-none bg-white text-black hover:bg-white/90">
            <KeyRound className="h-4 w-4 mr-2" /> {connected ? "Rotate key" : "Generate key"}
          </Button>
          {connected && (
            <Button data-testid="mcp-revoke-key" onClick={revoke} disabled={busy} variant="outline"
              className="rounded-none border-red-500/30 text-red-300 hover:bg-red-500/10">
              <Trash2 className="h-4 w-4 mr-2" /> Revoke
            </Button>
          )}
        </div>

        {newKey && (
          <div data-testid="mcp-new-key-block" className="mt-6 border border-[hsl(var(--gold))]/30 bg-[hsl(var(--gold))]/[0.04] p-4">
            <div className="label-kicker text-[10px] text-[hsl(var(--gold))] mb-2">Save this key — shown only once</div>
            <div className="flex items-center gap-2">
              <code data-testid="mcp-key-value" className="flex-1 text-xs text-white/90 bg-black/50 border border-white/10 px-3 py-2.5 break-all">{newKey}</code>
              <Button data-testid="mcp-copy-key" onClick={() => copy(newKey, "Key copied")} variant="outline"
                className="rounded-none border-white/20 hover:bg-white/10 h-[42px]"><Copy className="h-4 w-4" /></Button>
            </div>
          </div>
        )}
      </div>

      <div className="border border-white/10 p-6 lg:p-8">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-[hsl(var(--gold))]" /> <h3 className="font-display text-lg font-light">Activity — what Hermes is doing</h3></div>
          <span className="flex items-center gap-2 text-[10px] tracking-widest uppercase text-emerald-300/80">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" /> Live
          </span>
        </div>
        <p className="text-white/45 text-xs mt-3">Every tool call made with this key, newest first (auto-refreshes).</p>
        {activity.length === 0 ? (
          <div className="mt-4 text-white/35 text-sm border border-white/10 p-6" data-testid="mcp-activity-empty">No activity yet. Actions appear here the moment Hermes calls a tool.</div>
        ) : (
          <div className="mt-4 divide-y divide-white/5 border border-white/10 max-h-96 overflow-y-auto" data-testid="mcp-activity-feed">
            {activity.map((a) => (
              <div key={a.id} data-testid="mcp-activity-row" className="flex items-start gap-3 p-3">
                <span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${a.status === "ok" ? "bg-emerald-400" : "bg-red-400"}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <code className="text-xs text-[hsl(var(--gold))]">{a.tool}</code>
                    <span className="text-[10px] text-white/30">{a.created_at ? new Date(a.created_at).toLocaleString() : ""}</span>
                  </div>
                  <p className="text-white/55 text-xs mt-1 truncate">{a.summary}</p>
                  {a.arguments && a.arguments !== "{}" && (
                    <p className="text-white/30 text-[11px] mt-0.5 truncate">args: {a.arguments}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="border border-white/10 p-6 lg:p-8">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2"><Plug className="h-4 w-4 text-white/50" /> <h3 className="font-display text-lg font-light">Client configuration</h3></div>
          <Button data-testid="mcp-copy-config" onClick={() => copy(clientConfig, "Config copied")} variant="outline"
            className="rounded-none border-white/20 hover:bg-white/10"><Copy className="h-4 w-4 mr-2" /> Copy config</Button>
        </div>
        <p className="text-white/45 text-xs mt-3">Paste into your MCP client (e.g. Claude Desktop). Replace the key with the one above.</p>
        <pre data-testid="mcp-client-config" className="mt-4 text-xs text-white/70 bg-black/40 border border-white/10 p-4 overflow-x-auto">{clientConfig}</pre>
      </div>

      <div className="border border-white/10 p-6 lg:p-8">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2"><FileText className="h-4 w-4 text-white/50" /> <h3 className="font-display text-lg font-light">Setup guide for Hermes</h3></div>
          <div className="flex items-center gap-2">
            <Button data-testid="mcp-copy-guide" onClick={() => copy(guideText, "Guide copied")} variant="outline"
              className="rounded-none border-white/20 hover:bg-white/10"><Copy className="h-4 w-4 mr-2" /> Copy guide</Button>
            <Button data-testid="mcp-download-guide" onClick={downloadGuide} variant="outline"
              className="rounded-none border-white/20 hover:bg-white/10"><Download className="h-4 w-4 mr-2" /> Download .md</Button>
          </div>
        </div>
        <p className="text-white/45 text-xs mt-3">A ready-to-hand guide (endpoint, auth, config, tools). It embeds your freshly generated key if one is shown above — otherwise a placeholder.</p>
        <pre data-testid="mcp-guide" className="mt-4 text-xs text-white/70 bg-black/40 border border-white/10 p-4 overflow-x-auto max-h-96">{guideText}</pre>
      </div>

      <div className="border border-white/10 p-6 lg:p-8">
        <h3 className="font-display text-lg font-light flex items-center gap-2"><Sparkles className="h-4 w-4 text-[hsl(var(--gold))]" /> Available tools <span className="text-white/40 text-sm">({info?.tools?.length || 0})</span></h3>
        <div className="mt-5 grid sm:grid-cols-2 gap-px bg-white/10" data-testid="mcp-tools-list">
          {(info?.tools || []).map((t) => (
            <div key={t.name} data-testid={`mcp-tool-${t.name}`} className="bg-[#050505] p-4">
              <code className="text-xs text-[hsl(var(--gold))]">{t.name}</code>
              <p className="text-white/50 text-xs mt-1.5 leading-relaxed">{t.description}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
