import { useEffect, useRef, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { api, formatApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Button } from "../components/ui/button";
import { toast } from "sonner";
import { ArrowUpRight, ShieldCheck, Loader2 } from "lucide-react";

function routeForUser(u) {
  if (u.role === "admin") return "/workspace";
  if ((u.account_type === "underwriter" || u.account_type === "partner") && u.status === "approved") return "/workspace";
  return "/dashboard";
}

export default function AuthCallback() {
  const { setUser } = useAuth();
  const nav = useNavigate();
  const processed = useRef(false);

  const [phase, setPhase] = useState("processing"); // processing | legal | done | error
  const [pending, setPending] = useState(null); // {pending_token, email, name}
  const [audience, setAudience] = useState("client");
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (processed.current) return;
    processed.current = true;

    const hash = window.location.hash || "";
    const match = hash.match(/session_id=([^&]+)/);
    // clean the fragment immediately so it is never reprocessed
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
    const storedAudience = sessionStorage.getItem("dox_google_audience") || "client";
    setAudience(storedAudience === "partner" ? "partner" : "client");

    if (!match) {
      setPhase("error");
      setErr("No sign-in session was found. Please try again.");
      return;
    }
    const sessionId = decodeURIComponent(match[1]);

    (async () => {
      try {
        const { data } = await api.post("/auth/google/exchange", { session_id: sessionId });
        if (data.status === "ok") {
          setUser(data.user);
          toast.success("Welcome back");
          sessionStorage.removeItem("dox_google_audience");
          nav(routeForUser(data.user), { replace: true });
        } else {
          setPending(data);
          setPhase("legal");
        }
      } catch (e) {
        setPhase("error");
        setErr(formatApiError(e.response?.data?.detail) || e.message);
      }
    })();
  }, [nav, setUser]);

  const completeSignup = async () => {
    if (!accepted) {
      setErr("You must accept the Terms of Service and Privacy Policy to continue.");
      return;
    }
    setBusy(true); setErr("");
    try {
      await api.post("/auth/google/complete", {
        pending_token: pending.pending_token,
        account_type: audience,
        accepted_legal: true,
      });
      sessionStorage.removeItem("dox_google_audience");
      setPhase("done");
      toast.success("Application received");
    } catch (e) {
      setErr(formatApiError(e.response?.data?.detail) || e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#050505] text-white grain flex items-center justify-center px-6">
      <div className="w-full max-w-lg border border-white/10 bg-[#050505] p-10 lg:p-14">
        {phase === "processing" && (
          <div data-testid="google-callback-processing" className="flex items-center gap-3 text-white/60">
            <Loader2 className="h-5 w-5 animate-spin" strokeWidth={1.5} />
            <span>Finishing your Google sign-in…</span>
          </div>
        )}

        {phase === "legal" && (
          <div data-testid="google-callback-legal">
            <div className="label-kicker">One last step</div>
            <h1 className="font-display text-3xl lg:text-4xl font-light mt-3 leading-tight">
              Welcome, {pending?.name?.split(" ")[0] || "there"}.
            </h1>
            <p className="text-white/60 mt-4 text-sm">
              You're signing up with <span className="text-white">{pending?.email}</span>. Before we
              create your profile, confirm how you'll work with D.O.X and accept our terms.
            </p>

            <div className="mt-8">
              <div className="label-kicker mb-2">I am</div>
              <div className="flex gap-px bg-white/10 w-fit">
                {["client", "partner"].map((a) => (
                  <button key={a} data-testid={`google-audience-${a}`} onClick={() => setAudience(a)}
                    className={`px-5 py-2.5 label-kicker text-xs transition-colors ${
                      audience === a ? "bg-white text-black" : "bg-[#050505] text-white/50 hover:text-white"
                    }`}>
                    {a === "client" ? "Raising capital" : "Referring deals"}
                  </button>
                ))}
              </div>
            </div>

            <label data-testid="google-legal-label" className="mt-8 flex items-start gap-3 cursor-pointer select-none border border-white/10 bg-black/20 p-4">
              <input data-testid="google-legal-checkbox" type="checkbox" checked={accepted}
                onChange={(e) => setAccepted(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 accent-[hsl(var(--gold))]" />
              <span className="text-xs text-white/60 leading-relaxed">
                I have read and agree to the{" "}
                <Link to="/legal/terms" target="_blank" rel="noreferrer" className="text-white underline underline-offset-4">Terms of Service</Link>
                {" "}and{" "}
                <Link to="/legal/privacy" target="_blank" rel="noreferrer" className="text-white underline underline-offset-4">Privacy Policy</Link>
                {" "}(version June 2026). I understand my acceptance is an electronic signature and will be recorded with a timestamp and my IP address.
              </span>
            </label>

            {err && <p data-testid="google-legal-error" className="text-red-400 text-sm mt-4">{err}</p>}

            <Button data-testid="google-complete-btn" disabled={busy || !accepted} onClick={completeSignup}
              className="mt-8 rounded-none bg-white text-black hover:bg-white/90 h-11 px-6 btn-shimmer disabled:opacity-40">
              {busy ? "Creating your profile…" : "Create my profile"} <ArrowUpRight className="ml-2 h-4 w-4" strokeWidth={1.25} />
            </Button>
          </div>
        )}

        {phase === "done" && (
          <div data-testid="google-callback-done">
            <div className="label-kicker">Profile Reserved</div>
            <h1 className="font-display text-3xl mt-3">Your spot is reserved.</h1>
            <p className="text-white/60 mt-4 text-sm">
              Your {audience} profile has been created and our team has been notified. Access remains{" "}
              <span className="text-white">locked</span> until it is approved. A confirmation has been
              sent to <span className="text-white">{pending?.email}</span>.
            </p>
            <Button data-testid="google-done-signin" onClick={() => nav("/auth")} className="mt-8 rounded-none bg-white text-black hover:bg-white/90">
              Back to Sign In
            </Button>
          </div>
        )}

        {phase === "error" && (
          <div data-testid="google-callback-error">
            <div className="flex items-center gap-2 text-white/80"><ShieldCheck className="h-5 w-5" strokeWidth={1.5} /> Sign-in interrupted</div>
            <p className="text-white/55 mt-4 text-sm">{err}</p>
            <Button onClick={() => nav("/auth")} className="mt-8 rounded-none bg-white text-black hover:bg-white/90">
              Back to Sign In
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
