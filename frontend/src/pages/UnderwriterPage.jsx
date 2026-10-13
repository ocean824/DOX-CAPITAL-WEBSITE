import { useCallback, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import NavBar from "../components/NavBar";
import Footer from "../components/Footer";
import { api, formatApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Button } from "../components/ui/button";
import { DealScheduler } from "../components/DealScheduler";
import { DealThread } from "../components/DealThread";
import { PhasePill, PHASE_LABELS } from "../lib/deal";
import { toast } from "sonner";
import {
  ChevronDown, ChevronRight, CheckCircle2, AlertTriangle, Download, MessageSquare, CalendarClock, Copy, Users,
} from "lucide-react";

const STATUS_OPTIONS = [
  { key: "missing", label: "Missing" },
  { key: "received", label: "Received" },
  { key: "verified", label: "Verified" },
  { key: "rejected", label: "Rejected" },
  { key: "na", label: "N/A" },
];
const CHIP = {
  missing: "text-white/40 border-white/15", received: "text-[hsl(var(--gold))] border-[hsl(var(--gold))]/40",
  verified: "text-emerald-300 border-emerald-500/40", rejected: "text-red-300 border-red-500/40",
  na: "text-white/30 border-white/10",
};
const PHASE_ACTIONS = [
  { to: "in_underwriting", label: "Start Underwriting" },
  { to: "approved", label: "Approve" },
  { to: "declined", label: "Decline" },
];

export default function UnderwriterPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState([]);
  const [me, setMe] = useState(null);
  const [myClients, setMyClients] = useState([]);
  const [openClient, setOpenClient] = useState("");
  const [open, setOpen] = useState("");
  const [menu, setMenu] = useState("");
  const [panel, setPanel] = useState("review");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [deals, m, c] = await Promise.all([
        api.get("/underwriter/deals"),
        api.get("/partner/me"),
        api.get("/partner/clients"),
      ]);
      setRows(deals.data);
      setMe(m.data);
      setMyClients(c.data);
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || e.message);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (user === null) return;
    if (user && (user.role === "admin" || user.account_type === "underwriter")) load();
    else setLoading(false);
  }, [user, load]);

  if (user === null) return <Center>Loading…</Center>;
  if (user === false) return <Navigate to="/auth?as=underwriter" replace />;
  if (user.role !== "admin" && user.account_type !== "underwriter") return <Navigate to="/dashboard" replace />;

  const patch = (next) => setRows((rs) => rs.map((r) => (r.user.id === next.user.id ? next : r)));

  const copyCode = () => {
    if (me?.referral_code) {
      navigator.clipboard?.writeText(me.referral_code);
      toast.success("Referral code copied");
    }
  };

  const setItemStatus = async (uid, item, status) => {
    setMenu("");
    if (status === item.status) return;
    try {
      const { data } = await api.put(`/admin/prescreen/${uid}/items/${item.id}`, { status, note: null });
      patch(data);
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail) || e.message); }
  };
  const setPhase = async (uid, phase) => {
    try {
      const { data } = await api.put(`/underwriter/deals/${uid}/phase`, { phase });
      patch(data);
      toast.success(`Deal moved to ${PHASE_LABELS[phase]} — parties notified`);
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail) || e.message); }
  };

  return (
    <div className="text-white min-h-screen grain">
      <NavBar />
      <section className="pt-32 pb-10 hero-glow">
        <div className="mx-auto max-w-7xl px-6 lg:px-12">
          <div className="label-kicker">Underwriter Console</div>
          <h1 className="font-display text-4xl lg:text-5xl font-light mt-3">Deals prepared for underwriting.</h1>
          <p className="text-white/55 mt-3 text-sm max-w-2xl">
            Every file below has reached the Ready-to-Underwrite phase. Review documents, clear gates,
            move the deal through underwriting and schedule calls.
          </p>

          {me?.referral_code && (
            <div data-testid="underwriter-referral" className="mt-8 inline-flex items-center gap-4 border border-[hsl(var(--gold))]/40 px-6 py-4">
              <div>
                <div className="label-kicker text-xs text-[hsl(var(--gold))]">Your referral code</div>
                <div className="font-display text-2xl mt-1 tracking-widest">{me.referral_code}</div>
                <div className="text-xs text-white/45 mt-1">Share this so your clients link directly to you.</div>
              </div>
              <button data-testid="copy-referral" onClick={copyCode} className="text-white/60 hover:text-white"><Copy className="h-4 w-4" /></button>
            </div>
          )}
        </div>
      </section>

      {myClients.length > 0 && (
        <section className="pb-6">
          <div className="mx-auto max-w-7xl px-6 lg:px-12">
            <div className="label-kicker flex items-center gap-2"><Users className="h-4 w-4" /> Your referred clients</div>
            <div data-testid="underwriter-clients" className="mt-4 divide-y divide-white/10 border-y border-white/10">
              {myClients.map((r) => {
                const isOpen = openClient === r.user.id;
                return (
                  <div key={r.user.id} className="py-6">
                    <div className="grid md:grid-cols-12 gap-4 items-center">
                      <button data-testid={`client-row-${r.user.id}`} onClick={() => setOpenClient(isOpen ? "" : r.user.id)}
                        className="md:col-span-6 text-left flex items-center gap-3">
                        {isOpen ? <ChevronDown className="h-4 w-4 text-white/40" /> : <ChevronRight className="h-4 w-4 text-white/40" />}
                        <span>
                          <span className="block font-display text-lg">{r.user.name}</span>
                          <span className="block text-xs text-white/45">{r.user.email}</span>
                        </span>
                      </button>
                      <div className="md:col-span-3"><PhasePill phase={r.phase} /></div>
                      <div className="md:col-span-3">
                        <div className="h-[3px] bg-white/10"><div className="h-full bg-[hsl(var(--gold))]" style={{ width: `${r.score.pct}%` }} /></div>
                        <div className="text-xs text-white/45 mt-2">{r.score.pct}% ready</div>
                      </div>
                    </div>
                    {isOpen && (
                      <div className="mt-6 pl-7">
                        <div className="label-kicker text-xs mb-3">Conversation</div>
                        <DealThread clientId={r.user.id} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      <section className="pb-32">
        <div className="mx-auto max-w-7xl px-6 lg:px-12">
          {loading ? <p className="text-sm text-white/50">Loading deals…</p>
            : rows.length === 0 ? <Empty text="No deals are ready for underwriting yet." />
            : (
              <div data-testid="underwriter-deals" className="divide-y divide-white/10 border-y border-white/10">
                {rows.map((r) => {
                  const isOpen = open === r.user.id;
                  return (
                    <div key={r.user.id} className="py-6">
                      <div className="grid md:grid-cols-12 gap-4 items-center">
                        <button data-testid={`uw-row-${r.user.id}`} onClick={() => { setOpen(isOpen ? "" : r.user.id); setPanel("review"); }}
                          className="md:col-span-5 text-left flex items-center gap-3">
                          {isOpen ? <ChevronDown className="h-4 w-4 text-white/40" /> : <ChevronRight className="h-4 w-4 text-white/40" />}
                          <span>
                            <span className="block font-display text-lg">{r.user.name}</span>
                            <span className="block text-xs text-white/45">{r.user.email}</span>
                          </span>
                        </button>
                        <div className="md:col-span-3"><PhasePill phase={r.phase} /></div>
                        <div className="md:col-span-4">
                          <div className="h-[3px] bg-white/10"><div className="h-full bg-[hsl(var(--gold))]" style={{ width: `${r.score.pct}%` }} /></div>
                          <div className="text-xs text-white/45 mt-2">{r.score.received}/{r.score.required_total} received · {r.open_flag_count} gates open</div>
                        </div>
                      </div>

                      {isOpen && (
                        <div className="mt-6 pl-7">
                          <div className="flex flex-wrap gap-2 mb-6">
                            {PHASE_ACTIONS.map((a) => (
                              <Button key={a.to} data-testid={`uw-phase-${r.user.id}-${a.to}`} onClick={() => setPhase(r.user.id, a.to)}
                                disabled={r.phase === a.to}
                                className="rounded-none bg-white text-black hover:bg-white/90 h-9 px-4 text-xs disabled:opacity-40">
                                {a.label}
                              </Button>
                            ))}
                            <div className="flex-1" />
                            <TabBtn active={panel === "review"} onClick={() => setPanel("review")} icon={CheckCircle2} label="Review" />
                            <TabBtn active={panel === "schedule"} onClick={() => setPanel("schedule")} icon={CalendarClock} label="Schedule" />
                            <TabBtn active={panel === "messages"} onClick={() => setPanel("messages")} icon={MessageSquare} label="Messages" />
                          </div>

                          {panel === "review" && (
                            <div className="space-y-8">
                              <div>
                                <div className="label-kicker text-xs">Gates</div>
                                <div className="mt-3 grid sm:grid-cols-2 gap-2">
                                  {r.red_flags.map((f) => (
                                    <div key={f.id} className="text-xs flex items-start gap-2">
                                      {f.state === "clear" ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 mt-0.5 shrink-0" />
                                        : <AlertTriangle className={`h-3.5 w-3.5 mt-0.5 shrink-0 ${f.state === "open" ? "text-red-400" : "text-white/35"}`} />}
                                      <span className={f.state === "clear" ? "text-white/55" : "text-white/80"}>{f.label}{f.detail ? ` — ${f.detail}` : ""}</span>
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
                                               className="text-xs text-white/50 hover:text-white inline-flex items-center gap-1 mt-1 mr-4">
                                              <Download className="h-3 w-3" /> {u.original_filename}
                                            </a>
                                          ))}
                                        </div>
                                        <div className="relative shrink-0">
                                          <Button data-testid={`uw-cycle-${r.user.id}-${i.id}`} variant="outline" onClick={() => setMenu(menu === `${r.user.id}-${i.id}` ? "" : `${r.user.id}-${i.id}`)}
                                            className={`rounded-none bg-transparent h-7 px-3 text-[10px] tracking-widest uppercase ${CHIP[i.status]}`}>
                                            {i.status} <ChevronDown className="h-3 w-3 ml-1 opacity-60" />
                                          </Button>
                                          {menu === `${r.user.id}-${i.id}` && (
                                            <div className="absolute right-0 mt-1 z-20 bg-[#0d0d12] border border-white/15 min-w-[150px] py-1 shadow-xl">
                                              {STATUS_OPTIONS.map((s) => (
                                                <button key={s.key} data-testid={`uw-status-${r.user.id}-${i.id}-${s.key}`} onClick={() => setItemStatus(r.user.id, i, s.key)}
                                                  className={`w-full text-left px-3 py-2 text-[10px] tracking-widest uppercase hover:bg-white/5 ${i.status === s.key ? "text-white" : "text-white/50"}`}>
                                                  {s.label}
                                                </button>
                                              ))}
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                          {panel === "schedule" && <DealScheduler clientId={r.user.id} phase={r.phase} />}
                          {panel === "messages" && <DealThread clientId={r.user.id} />}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
        </div>
      </section>
      <Footer />
    </div>
  );
}

function TabBtn({ active, onClick, icon: Icon, label }) {
  return (
    <button onClick={onClick}
      className={`inline-flex items-center gap-2 text-xs px-3 py-2 border ${active ? "border-white text-white" : "border-white/15 text-white/50 hover:text-white"}`}>
      <Icon className="h-3.5 w-3.5" /> {label}
    </button>
  );
}
function Empty({ text }) { return <div className="border border-white/10 p-10 text-white/40 text-sm">{text}</div>; }
function Center({ children }) { return <div className="min-h-screen flex items-center justify-center bg-[#050505] text-white/60 text-sm">{children}</div>; }
