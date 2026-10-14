import { useCallback, useEffect, useState } from "react";
import { api, formatApiError } from "../lib/api";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { toast } from "sonner";
import { Video, CalendarPlus, Lock } from "lucide-react";
import { useAuth } from "../lib/auth";

/** Scheduling is unlocked only once our team has verified ALL required documents. */
export function DealScheduler({ clientId, phase }) {
  const { user } = useAuth();
  const isStaff = !!user && user.id !== clientId &&
    (user.role === "admin" || user.account_type === "underwriter" || user.account_type === "partner");
  const [docs, setDocs] = useState(null); // {verified, required_total}
  const docsApproved = !!docs && docs.required_total > 0 && docs.verified >= docs.required_total;
  const gated = !isStaff && !docsApproved;
  const [meetings, setMeetings] = useState([]);
  const [form, setForm] = useState({ preferred_date: "", preferred_time: "", notes: "" });
  const [team, setTeam] = useState([]);
  const [picked, setPicked] = useState([]);
  const [slots, setSlots] = useState({ slots: [], unconstrained: true });
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [mtg, pre, tm] = await Promise.all([
        api.get(`/deals/${clientId}/meetings`),
        api.get(`/prescreen/me`),
        api.get(`/deals/${clientId}/team`),
      ]);
      setMeetings(mtg.data);
      setDocs(pre.data?.score || { verified: 0, required_total: 0 });
      setTeam(tm.data || []);
    } catch (e) {
      console.error("[scheduler] load failed", e);
      setDocs({ verified: 0, required_total: 0 });
    }
  }, [clientId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!form.preferred_date || picked.length === 0) { setSlots({ slots: [], unconstrained: true }); return; }
    let active = true;
    setSlotsLoading(true);
    api.get(`/deals/${clientId}/slots`, { params: { date: form.preferred_date, person_ids: picked.join(",") } })
      .then((r) => { if (active) setSlots(r.data); })
      .catch(() => { if (active) setSlots({ slots: [], unconstrained: true }); })
      .finally(() => { if (active) setSlotsLoading(false); });
    return () => { active = false; };
  }, [clientId, form.preferred_date, picked]);

  const book = async (e) => {
    e.preventDefault();
    if (!picked.length) { toast.error("Select who you want on the call"); return; }
    if (!form.preferred_time) { toast.error("Pick a time"); return; }
    setBusy(true);
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
      await api.post(`/deals/${clientId}/meetings`, { ...form, participant_ids: picked, timezone: tz });
      toast.success("Underwriting call scheduled — calendar invite emailed");
      setForm({ preferred_date: "", preferred_time: "", notes: "" });
      setPicked([]);
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
          <label className="label-kicker text-xs">Who do you want on the call?</label>
          <div className="mt-2 space-y-2">
            {team.length === 0 && <p className="text-xs text-white/40">Your D.O.X team will appear here.</p>}
            {team.map((p) => {
              const on = picked.includes(p.id);
              return (
                <button type="button" key={p.id} data-testid={`sched-person-${p.id}`}
                  onClick={() => setPicked((s) => (on ? s.filter((x) => x !== p.id) : [...s, p.id]))}
                  className={`w-full flex items-center justify-between border px-4 py-3 text-left ${on ? "border-[hsl(var(--gold))] bg-[hsl(var(--gold))]/5" : "border-white/15 hover:border-white/30"}`}>
                  <span className="text-sm">{p.name}<span className="text-white/40 text-xs ml-2 uppercase tracking-wide">{p.role}</span></span>
                  <span className={`text-[10px] uppercase tracking-widest ${on ? "text-[hsl(var(--gold))]" : "text-white/30"}`}>{on ? "Selected" : p.has_availability ? "Available" : "Flexible"}</span>
                </button>
              );
            })}
          </div>
        </div>
        <div>
          <label className="label-kicker text-xs">Date</label>
          <Input data-testid="sched-date" type="date" required value={form.preferred_date}
            onChange={(e) => setForm((s) => ({ ...s, preferred_date: e.target.value, preferred_time: "" }))}
            className="rounded-none bg-black/40 border-white/15 mt-2" />
        </div>
        <div>
          <label className="label-kicker text-xs">Time</label>
          {picked.length === 0 ? (
            <p className="text-xs text-white/40 mt-2" data-testid="sched-pick-person-hint">Select who you want on the call first.</p>
          ) : slotsLoading ? (
            <p className="text-xs text-white/40 mt-2">Checking availability…</p>
          ) : slots.unconstrained ? (
            <Input data-testid="sched-time" type="time" required value={form.preferred_time}
              onChange={(e) => setForm((s) => ({ ...s, preferred_time: e.target.value }))}
              className="rounded-none bg-black/40 border-white/15 mt-2" />
          ) : slots.slots.length === 0 ? (
            <p className="text-xs text-amber-300/80 mt-2" data-testid="sched-no-slots">No open times for everyone selected on this day. Try another date.</p>
          ) : (
            <div className="flex flex-wrap gap-2 mt-2" data-testid="sched-slots">
              {slots.slots.map((t) => (
                <button type="button" key={t} data-testid={`sched-slot-${t}`}
                  onClick={() => setForm((s) => ({ ...s, preferred_time: t }))}
                  className={`px-3 py-2 text-xs border ${form.preferred_time === t ? "bg-white text-black border-white" : "border-white/15 text-white/60 hover:text-white"}`}>
                  {t}
                </button>
              ))}
            </div>
          )}
        </div>
        <Textarea data-testid="sched-notes" rows={2} value={form.notes}
          onChange={(e) => setForm((s) => ({ ...s, notes: e.target.value }))}
          placeholder="Agenda (optional)" className="rounded-none bg-black/40 border-white/15" />
        <Button data-testid="sched-submit" disabled={busy || !picked.length || !form.preferred_time || !form.preferred_date}
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
                <div className="text-xs text-white/45">with {m.participant_names?.length ? m.participant_names.join(", ") : (m.with_role || "team")} · requested by {m.requested_by_name}</div>
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
