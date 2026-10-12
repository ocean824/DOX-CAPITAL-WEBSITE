import { useCallback, useEffect, useState } from "react";
import { api, formatApiError } from "../lib/api";
import { Button } from "./ui/button";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, CheckCircle2, AlertTriangle, Download } from "lucide-react";

const NEXT = { missing: "verified", received: "verified", verified: "rejected", rejected: "received", na: "received" };
const CHIP = {
  missing: "text-white/40 border-white/15",
  received: "text-[hsl(var(--gold))] border-[hsl(var(--gold))]/40",
  verified: "text-emerald-300 border-emerald-500/40",
  rejected: "text-red-300 border-red-500/40",
  na: "text-white/30 border-white/10",
};

export const AdminReadiness = () => {
  const [rows, setRows] = useState([]);
  const [open, setOpen] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/admin/prescreen");
      setRows(data);
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || e.message);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const patch = (next) => setRows((rs) => rs.map((r) => (r.user.id === next.user.id ? next : r)));

  const setTrack = async (userId, track) => {
    try {
      const { data } = await api.put(`/admin/prescreen/${userId}/track`, { track });
      patch(data);
      toast.success("Track set — client notified by email");
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail) || e.message); }
  };

  const cycleItem = async (userId, item) => {
    const status = NEXT[item.status] || "verified";
    try {
      const { data } = await api.put(`/admin/prescreen/${userId}/items/${item.id}`, { status, note: null });
      patch(data);
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail) || e.message); }
  };

  if (loading) return <div className="py-6 text-sm text-white/50">Loading readiness files…</div>;
  if (rows.length === 0) return <div className="py-6 text-sm text-white/50">No approved clients yet.</div>;

  return (
    <div data-testid="admin-readiness" className="divide-y divide-white/10 border-y border-white/10">
      {rows.map((r) => {
        const isOpen = open === r.user.id;
        return (
          <div key={r.user.id} className="py-6">
            <div className="grid md:grid-cols-12 gap-4 items-center">
              <button data-testid={`readiness-row-${r.user.id}`}
                onClick={() => setOpen(isOpen ? "" : r.user.id)}
                className="md:col-span-4 text-left flex items-center gap-3">
                {isOpen ? <ChevronDown className="h-4 w-4 text-white/40" /> : <ChevronRight className="h-4 w-4 text-white/40" />}
                <span>
                  <span className="block font-display text-lg">{r.user.name}</span>
                  <span className="block text-xs text-white/45">{r.user.email}</span>
                </span>
              </button>

              <div className="md:col-span-3">
                <div className="flex gap-px bg-white/10 w-fit">
                  {Object.entries(r.tracks).map(([k, label]) => (
                    <button key={k} data-testid={`track-${r.user.id}-${k}`}
                      onClick={() => setTrack(r.user.id, k)}
                      className={`px-3 py-2 text-[10px] tracking-widest uppercase transition-colors ${
                        r.track === k ? "bg-white text-black" : "bg-[#050505] text-white/45 hover:text-white"
                      }`}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="md:col-span-3">
                <div className="h-[3px] bg-white/10">
                  <div className="h-full bg-[hsl(var(--gold))]" style={{ width: `${r.score.pct}%` }} />
                </div>
                <div className="text-xs text-white/45 mt-2">
                  {r.score.received}/{r.score.required_total} received · {r.open_flag_count} gates open
                </div>
              </div>

              <div className="md:col-span-2 md:text-right">
                {r.ready ? (
                  <span data-testid={`ready-${r.user.id}`} className="text-[10px] tracking-widest uppercase border px-2 py-1 text-emerald-300 border-emerald-500/40 inline-flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" /> Underwriter-ready
                  </span>
                ) : (
                  <span className="text-[10px] tracking-widest uppercase text-white/35">{r.score.pct}% complete</span>
                )}
              </div>
            </div>

            {isOpen && (
              <div className="mt-8 pl-7 space-y-8">
                <div>
                  <div className="label-kicker text-xs">Gates</div>
                  <div className="mt-3 grid sm:grid-cols-2 gap-2">
                    {r.red_flags.map((f) => (
                      <div key={f.id} className="text-xs flex items-start gap-2">
                        {f.state === "clear"
                          ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 mt-0.5 shrink-0" />
                          : <AlertTriangle className={`h-3.5 w-3.5 mt-0.5 shrink-0 ${f.state === "open" ? "text-red-400" : "text-white/35"}`} />}
                        <span className={f.state === "clear" ? "text-white/55" : "text-white/80"}>
                          {f.label}{f.detail ? ` — ${f.detail}` : ""}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {r.sections.map((s) => (
                  <div key={s.id}>
                    <div className="label-kicker text-xs text-[hsl(var(--gold))]">{s.number} · {s.title}</div>
                    <div className="mt-3 divide-y divide-white/5">
                      {s.items.map((i) => (
                        <div key={i.id} className="py-3 flex items-start justify-between gap-4">
                          <div className="min-w-0">
                            <div className="text-sm">{i.title}</div>
                            {i.uploads?.map((u) => (
                              <a key={u.id} href={`/api/uploads/${u.id}/download`} target="_blank" rel="noreferrer"
                                 data-testid={`adm-dl-${u.id}`}
                                 className="text-xs text-white/50 hover:text-white inline-flex items-center gap-1 mt-1 mr-4">
                                <Download className="h-3 w-3" /> {u.original_filename}
                              </a>
                            ))}
                          </div>
                          <Button data-testid={`cycle-${r.user.id}-${i.id}`} variant="outline"
                            onClick={() => cycleItem(r.user.id, i)}
                            className={`rounded-none bg-transparent h-7 px-3 text-[10px] tracking-widest uppercase shrink-0 ${CHIP[i.status]}`}>
                            {i.status}
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}

                {r.unassigned?.length > 0 && (
                  <div>
                    <div className="label-kicker text-xs">Unfiled uploads</div>
                    {r.unassigned.map((u) => (
                      <a key={u.id} href={`/api/uploads/${u.id}/download`} target="_blank" rel="noreferrer"
                         className="text-xs text-white/55 hover:text-white flex items-center gap-1 mt-2">
                        <Download className="h-3 w-3" /> {u.original_filename}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
