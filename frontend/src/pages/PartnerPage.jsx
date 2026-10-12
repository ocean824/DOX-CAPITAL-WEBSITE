import { useCallback, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import NavBar from "../components/NavBar";
import Footer from "../components/Footer";
import { api, formatApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { DealThread } from "../components/DealThread";
import { PhasePill } from "../lib/deal";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, Copy, Users } from "lucide-react";

export default function PartnerPage() {
  const { user } = useAuth();
  const [me, setMe] = useState(null);
  const [clients, setClients] = useState([]);
  const [open, setOpen] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [m, c] = await Promise.all([api.get("/partner/me"), api.get("/partner/clients")]);
      setMe(m.data); setClients(c.data);
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || e.message);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (user === null) return;
    if (user && (user.role === "admin" || user.account_type === "partner")) load();
    else setLoading(false);
  }, [user, load]);

  if (user === null) return <Center>Loading…</Center>;
  if (user === false) return <Navigate to="/auth?as=partner" replace />;
  if (user.role !== "admin" && user.account_type !== "partner") return <Navigate to="/dashboard" replace />;

  const copyCode = () => {
    if (me?.referral_code) {
      navigator.clipboard?.writeText(me.referral_code);
      toast.success("Referral code copied");
    }
  };

  return (
    <div className="text-white min-h-screen grain">
      <NavBar />
      <section className="pt-32 pb-10 hero-glow">
        <div className="mx-auto max-w-7xl px-6 lg:px-12">
          <div className="label-kicker">Partner Console</div>
          <h1 className="font-display text-4xl lg:text-5xl font-light mt-3">Your referred deals.</h1>

          {me?.referral_code && (
            <div data-testid="partner-referral" className="mt-8 inline-flex items-center gap-4 border border-[hsl(var(--gold))]/40 px-6 py-4">
              <div>
                <div className="label-kicker text-xs text-[hsl(var(--gold))]">Your referral code</div>
                <div className="font-display text-2xl mt-1 tracking-widest">{me.referral_code}</div>
              </div>
              <button data-testid="copy-referral" onClick={copyCode} className="text-white/60 hover:text-white"><Copy className="h-4 w-4" /></button>
            </div>
          )}
        </div>
      </section>

      <section className="pb-32">
        <div className="mx-auto max-w-7xl px-6 lg:px-12">
          <div className="label-kicker flex items-center gap-2"><Users className="h-4 w-4" /> Assigned clients</div>
          {loading ? <p className="mt-6 text-sm text-white/50">Loading…</p>
            : clients.length === 0 ? <Empty text="No clients linked to you yet. Share your referral code to onboard clients." />
            : (
              <div data-testid="partner-clients" className="mt-4 divide-y divide-white/10 border-y border-white/10">
                {clients.map((r) => {
                  const isOpen = open === r.user.id;
                  return (
                    <div key={r.user.id} className="py-6">
                      <div className="grid md:grid-cols-12 gap-4 items-center">
                        <button data-testid={`partner-row-${r.user.id}`} onClick={() => setOpen(isOpen ? "" : r.user.id)}
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
            )}
        </div>
      </section>
      <Footer />
    </div>
  );
}

function Empty({ text }) { return <div className="mt-4 border border-white/10 p-10 text-white/40 text-sm">{text}</div>; }
function Center({ children }) { return <div className="min-h-screen flex items-center justify-center bg-[#050505] text-white/60 text-sm">{children}</div>; }
