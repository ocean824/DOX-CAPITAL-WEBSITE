import { useCallback, useEffect, useState } from "react";
import { api, formatApiError } from "../lib/api";
import { Button } from "./ui/button";
import { toast } from "sonner";
import { Plug, KeyRound, Copy, Trash2, Sparkles, FileText, Download } from "lucide-react";

function Empty({ text }) {
  return <div className="border border-white/10 p-10 text-white/40 text-sm">{text}</div>;
}

export default function McpPanel() {
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
Workspace -> Hermes MCP -> Generate key. The key (dox_mcp_...) is shown ONCE — copy and store it.
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
