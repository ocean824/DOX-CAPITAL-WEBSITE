import { useRef, useState } from "react";
import { api, formatApiError } from "../lib/api";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { toast } from "sonner";
import { Sparkles, Send } from "lucide-react";

const STARTERS = [
  "What documents do I need for the Profitable track?",
  "What are the red-flag gates I must clear?",
  "Explain the two underwriting tracks.",
];

/** Lightweight AI assistant (Emergent Universal Key) grounded in the pre-screen SOP. */
export function DealAssistant() {
  const [log, setLog] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const sessionRef = useRef(null);

  const ask = async (text) => {
    const message = (text ?? input).trim();
    if (!message || busy) return;
    setInput("");
    setLog((l) => [...l, { role: "user", text: message }]);
    setBusy(true);
    try {
      const { data } = await api.post("/assistant/chat", { message, session_id: sessionRef.current });
      sessionRef.current = data.session_id;
      setLog((l) => [...l, { role: "assistant", text: data.reply }]);
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || e.message);
      setLog((l) => [...l, { role: "assistant", text: "The assistant is temporarily unavailable. Please try again." }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div data-testid="deal-assistant" className="max-w-3xl">
      <div className="flex items-center gap-2 label-kicker">
        <Sparkles className="h-4 w-4 text-[hsl(var(--gold))]" /> D.O.X Readiness Assistant
      </div>
      <p className="text-white/55 text-sm mt-2">
        Ask about the documents, metrics and gates your file needs to reach underwriting.
      </p>

      {log.length === 0 && (
        <div className="mt-6 flex flex-wrap gap-2">
          {STARTERS.map((s) => (
            <button key={s} data-testid="assistant-starter" onClick={() => ask(s)}
              className="text-xs border border-white/15 px-3 py-2 text-white/70 hover:bg-white/5">
              {s}
            </button>
          ))}
        </div>
      )}

      <div className="mt-6 space-y-4">
        {log.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[85%] p-3 text-sm whitespace-pre-wrap ${m.role === "user" ? "bg-white text-black" : "bg-white/[0.06] text-white border-l-2 border-[hsl(var(--gold))]"}`}>
              {m.text}
            </div>
          </div>
        ))}
        {busy && <p className="text-sm text-white/40">Thinking…</p>}
      </div>

      <div className="mt-6 flex items-center gap-2">
        <Input data-testid="assistant-input" value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") ask(); }}
          placeholder="Ask the assistant…" className="rounded-none bg-black/40 border-white/15" />
        <Button data-testid="assistant-send" disabled={busy} onClick={() => ask()}
          className="rounded-none bg-[hsl(var(--gold))] text-black hover:bg-[hsl(var(--gold))]/90 h-11 px-4">
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
