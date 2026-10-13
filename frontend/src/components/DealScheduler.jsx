import { useCallback, useEffect, useState } from "react";
import { api, formatApiError } from "../lib/api";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { toast } from "sonner";
import { Video, CalendarPlus, Lock } from "lucide-react";

/** Scheduling is unlocked only once our team has verified ALL required documents. */
export function DealScheduler({ clientId, phase }) {
  const [docs, setDocs] = useState(null); // {verified, required_total}
  const docsApproved = !!docs && docs.required_total > 0 && docs.verified >= docs.required_total;
  const gated = !docsApproved;
  const [meetings, setMeetings] = useState([]);
  const [form, setForm] = useState({ with_role: "underwriter", preferred_date: "", preferred_time: "", notes: "" });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [mtg, pre] = await Promise.all([
        api.get(`/deals/${clientId}/meetings`),
        api.get(`/prescreen/me`),
      ]);
      setMeetings(mtg.data);
      setDocs(pre.data?.score || { verified: 0, required_total: 0 });
    } catch (e) {
      console.error("[scheduler] load failed", e);
      setDocs({ verified: 0, required_total: 0 });
    }
  }, [clientId]);

  useEffect(() => { load(); }, [load]);

  const book = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
      await api.post(`/deals/${clientId}/meetings`, { ...form, timezone: tz });
      toast.success("Underwriting call scheduled — calendar invite emailed");
      setForm({ with_role: "underwriter", preferred_date: "", preferred_time: "", notes: "" });
      await load();
    } catch (e2) {
      toast.error(formatApiError(e2.response?.data?.detail) || e2.message);
    } finally {
      setBusy(false);
    }
  };

  if (gated) {
    const n = docs || { verified: 0, required_total: 0 };
    return (
      <div data-testid="scheduler-gated" className="border border-white/10 p-6 bg-[#0a0a0a] flex items-start gap-3">
        <Lock className="h-4 w-4 text-white/40 mt-1" strokeWidth={1.25} />
        <div className="max-w-xl">
          <p className="text-sm text-white/70">
            Access to the underwriting call is granted only to applicants who have successfully
            provided <span className="text-white">all requested documentation</span> and had every
            item approved by our team.
          </p>
          <p className="text-xs text-white/45 mt-3">
            {n.required_total > 0
              ? `${n.verified} of ${n.required_total} required documents approved. Complete the Document Readiness tab and wait for our team to verify each item.`
              : "Your document checklist is being prepared — complete the Document Readiness tab to begin."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div data-testid="deal-scheduler" className="grid lg:grid-cols-2 gap-6">
      <form onSubmit={book} className="border border-white/10 p-6 bg-[#0a0a0a] space-y-4">
        <div className="label-kicker flex items-center gap-2"><CalendarPlus className="h-4 w-4 text-[hsl(var(--gold))]" /> Schedule underwriting call</div>
        <div>
          <label className="label-kicker text-xs">With</label>
          <div className="flex gap-px bg-white/10 mt-2 w-fit">
            {["underwriter", "admin"].map((r) => (
              <button type="button" key={r} data-testid={`sched-with-${r}`}
                onClick={() => setForm((s) => ({ ...s, with_role: r }))}
                className={`px-4 py-2 text-[10px] tracking-widest uppercase ${form.with_role === r ? "bg-white text-black" : "bg-[#050505] text-white/50 hover:text-white"}`}>
                {r}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label-kicker text-xs">Date</label>
            <Input data-testid="sched-date" type="date" required value={form.preferred_date}
              onChange={(e) => setForm((s) => ({ ...s, preferred_date: e.target.value }))}
              className="rounded-none bg-black/40 border-white/15 mt-2" />
          </div>
          <div>
            <label className="label-kicker text-xs">Time</label>
            <Input data-testid="sched-time" type="time" required value={form.preferred_time}
              onChange={(e) => setForm((s) => ({ ...s, preferred_time: e.target.value }))}
              className="rounded-none bg-black/40 border-white/15 mt-2" />
          </div>
        </div>
        <Textarea data-testid="sched-notes" rows={2} value={form.notes}
          onChange={(e) => setForm((s) => ({ ...s, notes: e.target.value }))}
          placeholder="Agenda (optional)" className="rounded-none bg-black/40 border-white/15" />
        <Button data-testid="sched-submit" disabled={busy}
          className="rounded-none bg-white text-black hover:bg-white/90 h-11 px-6 btn-shimmer">
          {busy ? "Scheduling…" : "Confirm call"}
        </Button>
      </form>

      <div>
        <div className="label-kicker">Scheduled calls</div>
        <div className="mt-4 divide-y divide-white/10 border-y border-white/10">
          {meetings.length === 0 && <p className="py-4 text-sm text-white/40">No calls scheduled yet.</p>}
          {meetings.map((m) => (
            <div key={m.id} className="py-4 flex items-center justify-between gap-4">
              <div>
                <div className="text-sm">{m.preferred_date} · {m.preferred_time} <span className="text-white/40">({m.timezone})</span></div>
                <div className="text-xs text-white/45">with {m.with_role} · requested by {m.requested_by_name}</div>
              </div>
              <a href={m.meet_link} target="_blank" rel="noreferrer"
                 data-testid={`meeting-link-${m.id}`}
                 className="text-xs text-[hsl(var(--gold))] hover:underline inline-flex items-center gap-1">
                <Video className="h-3 w-3" /> Join
              </a>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
