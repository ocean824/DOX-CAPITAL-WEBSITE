import { useState } from "react";
import { Lock, ArrowRight, X } from "lucide-react";
import { api, formatApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Input } from "./ui/input";
import { Button } from "./ui/button";

export default function ComingSoon() {
  const { refresh } = useAuth();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ email: "", password: "" });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErr("");
    try {
      await api.post("/auth/login", { email: form.email.trim(), password: form.password });
      const u = await refresh();
      if (!u || u.role !== "admin") {
        setErr("This account does not have pre-launch access.");
      }
    } catch (e2) {
      setErr(formatApiError(e2.response?.data?.detail) || "Unable to sign in.");
    } finally { setBusy(false); }
  };

  return (
    <div data-testid="coming-soon" className="min-h-screen bg-[#050505] text-white grain relative overflow-hidden flex flex-col">
      <div className="absolute inset-0 dot-grid opacity-[0.35] pointer-events-none" />
      <div className="absolute -top-40 -left-40 w-[46rem] h-[46rem] rounded-full pointer-events-none"
           style={{ background: "radial-gradient(circle, rgba(212,175,55,0.10), transparent 62%)" }} />

      <header className="relative z-10 px-6 sm:px-12 pt-10 flex items-center justify-between">
        <span className="font-display text-xl tracking-tight">D.O.X <span className="text-[#D4AF37]">CAPITAL</span></span>
        <span className="label-kicker text-xs text-white/40">EST. CONFIDENTIAL</span>
      </header>

      <main className="relative z-10 flex-1 px-6 sm:px-12 flex items-center">
        <div className="max-w-3xl">
          <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl leading-[1.04] tracking-tight">
            Under maintenance.
          </h1>

          <div className="mt-14 h-px w-40 bg-gradient-to-r from-[#D4AF37] to-transparent" />

          <div className="mt-10">
            {!open ? (
              <button data-testid="unlock-site-btn" onClick={() => setOpen(true)}
                className="group inline-flex items-center gap-3 border border-white/12 px-6 py-3 hover:border-[#D4AF37]/60 transition-colors">
                <Lock className="w-4 h-4 text-[#D4AF37]" />
                <span className="label-kicker text-xs text-white/70 group-hover:text-white transition-colors">
                  AUTHORIZED ACCESS
                </span>
                <ArrowRight className="w-4 h-4 text-white/40 group-hover:translate-x-1 transition-transform" />
              </button>
            ) : (
              <form data-testid="prelaunch-login-form" onSubmit={submit}
                className="max-w-sm border border-white/12 bg-white/[0.02] p-7 backdrop-blur-sm">
                <div className="flex items-start justify-between mb-6">
                  <p className="label-kicker text-xs text-[#D4AF37]">ADMINISTRATOR SIGN-IN</p>
                  <button type="button" data-testid="close-prelaunch-login" onClick={() => { setOpen(false); setErr(""); }}>
                    <X className="w-4 h-4 text-white/40 hover:text-white transition-colors" />
                  </button>
                </div>
                <label className="label-kicker text-[11px] text-white/40">EMAIL</label>
                <Input data-testid="prelaunch-email" type="email" required autoFocus value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="mt-2 mb-5 rounded-none bg-transparent border-white/15 h-11" />
                <label className="label-kicker text-[11px] text-white/40">PASSWORD</label>
                <Input data-testid="prelaunch-password" type="password" required value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  className="mt-2 rounded-none bg-transparent border-white/15 h-11" />
                {err && <p data-testid="prelaunch-error" className="mt-5 text-sm text-red-400">{err}</p>}
                <Button data-testid="prelaunch-submit" disabled={busy}
                  className="mt-7 w-full rounded-none bg-white text-black hover:bg-white/90 h-11 btn-shimmer">
                  {busy ? "Verifying…" : "Enter"}
                </Button>
              </form>
            )}
          </div>
        </div>
      </main>

      <footer className="relative z-10 px-6 sm:px-12 py-10 flex flex-wrap gap-x-10 gap-y-2 label-kicker text-[11px] text-white/30">
        <span>© {new Date().getFullYear()} D.O.X CAPITAL</span>
        <a href="mailto:admin@thedoxs.com" className="hover:text-[#D4AF37] transition-colors">ADMIN@THEDOXS.COM</a>
      </footer>
    </div>
  );
}
