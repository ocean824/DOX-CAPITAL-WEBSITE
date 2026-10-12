import { useCallback, useEffect, useRef, useState } from "react";
import { api, formatApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import { toast } from "sonner";
import { Send } from "lucide-react";

/** Two-way per-deal messaging — the real conversation channel, CRM-linked. */
export function DealThread({ clientId }) {
  const { user } = useAuth();
  const [msgs, setMsgs] = useState([]);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const endRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get(`/deals/${clientId}/messages`);
      setMsgs(data);
    } catch (e) {
      console.error("[thread] load failed", e);
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs]);

  const send = async () => {
    const text = body.trim();
    if (!text) return;
    setBusy(true);
    try {
      await api.post(`/deals/${clientId}/messages`, { body: text });
      setBody("");
      await load();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div data-testid="deal-thread" className="border border-white/10 bg-[#0a0a0a] flex flex-col h-[460px]">
      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {loading && <p className="text-sm text-white/40">Loading conversation…</p>}
        {!loading && msgs.length === 0 && (
          <p className="text-sm text-white/40">No messages yet. Start the conversation below.</p>
        )}
        {msgs.map((m) => {
          const mine = m.sender_id === user?.id;
          return (
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[80%] p-3 ${mine ? "bg-white text-black" : "bg-white/[0.06] text-white"}`}>
                <div className="text-[10px] tracking-widest uppercase opacity-60 mb-1">
                  {m.sender_name} · {m.sender_role}
                </div>
                <div className="text-sm whitespace-pre-wrap">{m.body}</div>
                <div className="text-[10px] opacity-40 mt-1">{new Date(m.created_at).toLocaleString()}</div>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
      <div className="border-t border-white/10 p-3 flex items-end gap-2">
        <Textarea
          data-testid="deal-thread-input" rows={2} value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder="Write a message…"
          className="rounded-none bg-black/40 border-white/15 resize-none"
        />
        <Button data-testid="deal-thread-send" disabled={busy} onClick={send}
          className="rounded-none bg-[hsl(var(--gold))] text-black hover:bg-[hsl(var(--gold))]/90 h-11 px-4">
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
