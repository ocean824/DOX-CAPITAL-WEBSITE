import { useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import NavBar from "../components/NavBar";
import Footer from "../components/Footer";
import { api, formatApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../components/ui/tabs";
import { toast } from "sonner";
import { ArrowUpRight, ShieldCheck } from "lucide-react";

const COPY = {
  client: {
    kicker: "Client Access",
    heading: "Why you can't just 'sign up'.",
    body:
      "To maintain a high success rate with our lending partners, every sign-up is reviewed before access is granted. Your spot is reserved when you create a profile, but access remains locked until your referrer confirms — or until our team approves you after a priority consultation.",
    bullets: [
      "Quality Control — referred businesses only",
      "Referrer Vetting before access is granted",
      "Exclusivity — intensive, white-glove service",
    ],
    roleLabel: "Your role",
    rolePlaceholder: "Founder / CFO / Owner",
    companyLabel: "Company",
    messageLabel: "Tell us about the capital you're raising",
    messagePlaceholder: "Facility size, use of funds, and the assets or business behind it.",
    cta: "Request Client Access",
    footnote: (
      <>No referrer yet? <Link to="/book" className="text-white underline underline-offset-4">Schedule a priority consultation</Link> and we'll personally review your business.</>
    ),
  },
  partner: {
    kicker: "Partner Access",
    heading: "Refer deals into a closed pipeline.",
    body:
      "Partners introduce the businesses we underwrite. Your referrals skip the cold queue and enter the Workspace directly — with live deal stages, documents and the process assistant attached to each file you bring us.",
    bullets: [
      "Your referrals bypass the cold-application queue",
      "Live deal stages and documents in the Workspace",
      "Fee alignment confirmed in writing before closing",
    ],
    roleLabel: "Your role at the firm",
    rolePlaceholder: "Broker / Advisor / Introducer",
    companyLabel: "Firm",
    messageLabel: "What kind of deals do you refer?",
    messagePlaceholder: "Sectors, typical facility size, and volume per year.",
    cta: "Request Partner Access",
    footnote: (
      <>Already referring for another desk? Mention it in your application — we verify every partner before access is granted.</>
    ),
  },
  admin: {
    kicker: "Administrator",
    heading: "Operations console.",
    body:
      "Sign in to approve accounts, review uploads and bookings, manage the Workspace and control whether the public site is live or under maintenance.",
    bullets: [
      "Approve or reject client and partner accounts",
      "Review every upload, booking and signed document",
      "Toggle the public site between live and maintenance",
    ],
    footnote: <>Administrator accounts are provisioned internally — there is no self sign-up.</>,
  },
  underwriter: {
    kicker: "Underwriter Access",
    heading: "Underwrite prepared deals.",
    body:
      "Underwriters see every file that has reached the Ready-to-Underwrite phase. Review the pre-screening checklist, clear the red-flag gates, move the deal through underwriting and schedule calls — all from one console.",
    bullets: [
      "See all deals prepared for underwriting",
      "Review documents and clear underwriting gates",
      "Move deals to In Underwriting, Approved or Declined",
    ],
    roleLabel: "Your title",
    rolePlaceholder: "Credit / Underwriting",
    companyLabel: "Firm / desk",
    messageLabel: "Your underwriting focus",
    messagePlaceholder: "Asset classes and facility sizes you underwrite.",
    cta: "Request Underwriter Access",
    footnote: <>Underwriter access is reviewed and approved by an administrator before activation.</>,
  },
};

export default function AuthPage() {
  const { setUser, refresh } = useAuth();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const audience = ["partner", "admin", "underwriter"].includes(params.get("as")) ? params.get("as") : "client";
  const copy = COPY[audience];
  const isAdmin = audience === "admin";

  const [tab, setTab] = useState("login");
  const [li, setLi] = useState({ email: "", password: "" });
  const [liErr, setLiErr] = useState("");
  const [liBusy, setLiBusy] = useState(false);

  const [rg, setRg] = useState({
    name: "", email: "", password: "", company: "",
    role_requested: "", message: "", referral_code: "",
  });
  const [rgErr, setRgErr] = useState("");
  const [rgBusy, setRgBusy] = useState(false);
  const [rgDone, setRgDone] = useState(false);

  const switchAudience = (next) => {
    setParams({ as: next });
    setRgErr(""); setLiErr("");
  };

  const doLogin = async (e) => {
    e.preventDefault();
    setLiBusy(true); setLiErr("");
    try {
      const { data } = await api.post("/auth/login", li);
      setUser(data.user);
      await refresh();
      toast.success("Welcome back");
      const u = data.user;
      if (u.role === "admin") nav("/admin");
      else if (u.account_type === "underwriter" && u.status === "approved") nav("/underwriter");
      else if (u.account_type === "partner" && u.status === "approved") nav("/partner");
      else nav("/dashboard");
    } catch (e2) {
      setLiErr(formatApiError(e2.response?.data?.detail) || e2.message);
    } finally {
      setLiBusy(false);
    }
  };

  const doRegister = async (e) => {
    e.preventDefault();
    setRgBusy(true); setRgErr("");
    try {
      await api.post("/auth/register", {
        ...rg,
        account_type: audience,
        referral_code: audience === "client" ? rg.referral_code : undefined,
      });
      setRgDone(true);
      toast.success("Application received");
    } catch (e2) {
      setRgErr(formatApiError(e2.response?.data?.detail) || e2.message);
    } finally {
      setRgBusy(false);
    }
  };

  return (
    <div className="text-white min-h-screen grain">
      <NavBar />
      <section className="pt-32 pb-20 hero-glow">
        <div className="mx-auto max-w-6xl px-6 lg:px-12">
          <div className="flex flex-wrap gap-px bg-white/10 w-fit mb-px">
            {["client", "partner"].map((a) => (
              <button key={a} data-testid={`audience-${a}`} onClick={() => switchAudience(a)}
                className={`px-6 py-3 label-kicker text-xs transition-colors ${
                  audience === a ? "bg-white text-black" : "bg-[#050505] text-white/50 hover:text-white"
                }`}>
                {a === "client" ? "I'm raising capital" : "I refer deals"}
              </button>
            ))}
            {(audience === "admin" || audience === "underwriter") && (
              <button data-testid={`audience-${audience}`}
                className="px-6 py-3 label-kicker text-xs bg-white text-black">
                {audience === "admin" ? "Administrator" : "Underwriter"}
              </button>
            )}
          </div>

          <div className="grid lg:grid-cols-12 gap-px bg-white/10">
            <aside className="lg:col-span-5 bg-[#050505] p-10 lg:p-14">
              <div className="label-kicker">{copy.kicker}</div>
              <h1 className="font-display text-4xl lg:text-5xl font-light mt-4 leading-tight">
                {copy.heading}
              </h1>
              <p className="text-white/60 mt-6 max-w-md">{copy.body}</p>
              <div className="mt-10 space-y-4 text-sm text-white/55">
                {copy.bullets.map((b) => <Row key={b} icon={ShieldCheck} text={b} />)}
              </div>
              <p className="text-xs text-white/35 mt-10">{copy.footnote}</p>
              {audience === "partner" && (
                <div className="mt-6 space-y-2">
                  <button data-testid="admin-access-link" onClick={() => switchAudience("admin")}
                    className="block text-xs text-white/40 hover:text-[hsl(var(--gold))] underline underline-offset-4">
                    Administrator sign in
                  </button>
                  <button data-testid="underwriter-access-link" onClick={() => switchAudience("underwriter")}
                    className="block text-xs text-white/40 hover:text-[hsl(var(--gold))] underline underline-offset-4">
                    Underwriter sign in
                  </button>
                </div>
              )}
              {(audience === "admin" || audience === "underwriter") && (
                <button data-testid="back-to-partner-link" onClick={() => switchAudience("partner")}
                  className="mt-6 block text-xs text-white/40 hover:text-white underline underline-offset-4">
                  ← Back to partner access
                </button>
              )}
            </aside>

            <div className="lg:col-span-7 bg-[#050505] p-10 lg:p-14">
              <Tabs value={isAdmin ? "login" : tab} onValueChange={setTab}>
                <TabsList className="rounded-none bg-transparent p-0 gap-6 border-b border-white/10">
                  <TabsTrigger data-testid="tab-login" value="login"
                    className="rounded-none data-[state=active]:bg-transparent data-[state=active]:text-white data-[state=active]:border-b data-[state=active]:border-white px-0 pb-3 text-white/60">
                    {audience === "partner" ? "Partner Sign In" : audience === "admin" ? "Admin Sign In" : audience === "underwriter" ? "Underwriter Sign In" : "Client Sign In"}
                  </TabsTrigger>
                  {!isAdmin && (
                    <TabsTrigger data-testid="tab-register" value="register"
                      className="rounded-none data-[state=active]:bg-transparent data-[state=active]:text-white data-[state=active]:border-b data-[state=active]:border-white px-0 pb-3 text-white/60">
                      Sign Up
                    </TabsTrigger>
                  )}
                </TabsList>

                <TabsContent value="login" className="mt-8">
                  <form onSubmit={doLogin} className="space-y-5 max-w-md">
                    <Field label="Email">
                      <Input data-testid="login-email" type="email" required value={li.email}
                        onChange={(e) => setLi((s) => ({ ...s, email: e.target.value }))}
                        className="rounded-none bg-black/40 border-white/15" />
                    </Field>
                    <Field label="Password">
                      <Input data-testid="login-password" type="password" required value={li.password}
                        onChange={(e) => setLi((s) => ({ ...s, password: e.target.value }))}
                        className="rounded-none bg-black/40 border-white/15" />
                    </Field>
                    {liErr && <p data-testid="login-error" className="text-red-400 text-sm">{liErr}</p>}
                    <Button data-testid="login-submit" disabled={liBusy}
                      className="rounded-none bg-white text-black hover:bg-white/90 h-11 px-6 btn-shimmer">
                      {liBusy ? "Signing in…" : "Sign In"} <ArrowUpRight className="ml-2 h-4 w-4" strokeWidth={1.25} />
                    </Button>
                  </form>
                </TabsContent>

                <TabsContent value="register" className="mt-8">
                  {rgDone ? (
                    <div data-testid="register-success" className="max-w-md">
                      <div className="label-kicker">Profile Reserved</div>
                      <h3 className="font-display text-3xl mt-3">Your spot is reserved.</h3>
                      <p className="text-white/60 mt-4">
                        Your {audience} profile has been created and our team has been notified.
                        Access remains <span className="text-white">locked</span> until it is
                        approved. A confirmation has been sent to{" "}
                        <span className="text-white">{rg.email}</span>.
                      </p>
                      <Button onClick={() => setTab("login")} className="mt-8 rounded-none bg-white text-black hover:bg-white/90">
                        Back to Sign In
                      </Button>
                    </div>
                  ) : (
                    <form onSubmit={doRegister} className="grid sm:grid-cols-2 gap-5 max-w-2xl">
                      <Field label="Full name">
                        <Input data-testid="reg-name" required value={rg.name}
                          onChange={(e) => setRg((s) => ({ ...s, name: e.target.value }))}
                          className="rounded-none bg-black/40 border-white/15" />
                      </Field>
                      <Field label={copy.companyLabel}>
                        <Input data-testid="reg-company" value={rg.company}
                          onChange={(e) => setRg((s) => ({ ...s, company: e.target.value }))}
                          className="rounded-none bg-black/40 border-white/15" />
                      </Field>
                      <Field label="Email">
                        <Input data-testid="reg-email" type="email" required value={rg.email}
                          onChange={(e) => setRg((s) => ({ ...s, email: e.target.value }))}
                          className="rounded-none bg-black/40 border-white/15" />
                      </Field>
                      <Field label={copy.roleLabel}>
                        <Input data-testid="reg-role" value={rg.role_requested}
                          placeholder={copy.rolePlaceholder}
                          onChange={(e) => setRg((s) => ({ ...s, role_requested: e.target.value }))}
                          className="rounded-none bg-black/40 border-white/15" />
                      </Field>
                      {audience === "client" && (
                        <Field label="Referral code (optional)" className="sm:col-span-2">
                          <Input data-testid="reg-referral" value={rg.referral_code}
                            placeholder="From your D.O.X partner, e.g. DOXVIP"
                            onChange={(e) => setRg((s) => ({ ...s, referral_code: e.target.value.toUpperCase() }))}
                            className="rounded-none bg-black/40 border-white/15" />
                          <p className="text-xs text-white/40 mt-1">Have a partner introduction? Enter their code to link your file.</p>
                        </Field>
                      )}
                      <Field label="Password" className="sm:col-span-2">
                        <Input data-testid="reg-password" type="password" required minLength={8} value={rg.password}
                          onChange={(e) => setRg((s) => ({ ...s, password: e.target.value }))}
                          className="rounded-none bg-black/40 border-white/15" />
                        <p className="text-xs text-white/40 mt-1">Minimum 8 characters.</p>
                      </Field>
                      <Field label={copy.messageLabel} className="sm:col-span-2">
                        <Textarea data-testid="reg-message" rows={3} value={rg.message}
                          onChange={(e) => setRg((s) => ({ ...s, message: e.target.value }))}
                          className="rounded-none bg-black/40 border-white/15"
                          placeholder={copy.messagePlaceholder} />
                      </Field>
                      {rgErr && <p data-testid="register-error" className="sm:col-span-2 text-red-400 text-sm">{rgErr}</p>}
                      <div className="sm:col-span-2">
                        <Button data-testid="reg-submit" disabled={rgBusy}
                          className="rounded-none bg-white text-black hover:bg-white/90 h-11 px-6 btn-shimmer">
                          {rgBusy ? "Submitting…" : copy.cta} <ArrowUpRight className="ml-2 h-4 w-4" strokeWidth={1.25} />
                        </Button>
                      </div>
                    </form>
                  )}
                </TabsContent>
              </Tabs>
            </div>
          </div>
        </div>
      </section>
      <Footer />
    </div>
  );
}

function Field({ label, children, className = "" }) {
  return (
    <div className={className}>
      <Label className="label-kicker">{label}</Label>
      <div className="mt-2">{children}</div>
    </div>
  );
}
function Row({ icon: Icon, text }) {
  return (
    <div className="flex items-center gap-3">
      <Icon className="h-4 w-4 text-[hsl(var(--gold))]" strokeWidth={1.25} />
      <span>{text}</span>
    </div>
  );
}
