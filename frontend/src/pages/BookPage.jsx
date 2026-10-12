import { useState } from "react";
import { useNavigate } from "react-router-dom";
import NavBar from "../components/NavBar";
import Footer from "../components/Footer";
import Reveal from "../components/Reveal";
import { api, formatApiError } from "../lib/api";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "../components/ui/select";
import { Calendar } from "../components/ui/calendar";
import { toast } from "sonner";
import { ArrowUpRight, CalendarDays, Clock, Video, ShieldCheck } from "lucide-react";

const TIME_SLOTS = [
  "09:00", "09:30", "10:00", "10:30",
  "11:00", "13:00", "13:30", "14:00",
  "14:30", "15:00", "15:30", "16:00", "16:30",
];

export default function BookPage() {
  const nav = useNavigate();
  const [step, setStep] = useState(1);
  const [date, setDate] = useState(undefined);
  const [time, setTime] = useState("");
  const [form, setForm] = useState({
    name: "", email: "", phone: "", company: "",
    role: "Founder", capital_range: "$1M – $5M",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    notes: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [confirmation, setConfirmation] = useState(null);

  const setField = (k) => (e) =>
    setForm((s) => ({ ...s, [k]: typeof e === "string" ? e : e.target.value }));

  const submit = async () => {
    if (!date || !time) { toast.error("Pick a date and time"); return; }
    setSubmitting(true);
    try {
      const { data } = await api.post("/bookings", {
        ...form,
        preferred_date: date.toISOString().slice(0, 10),
        preferred_time: time,
      });
      setConfirmation(data);
      setStep(3);
      toast.success("Discovery call booked");
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || e.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-[#050505] text-white min-h-screen grain">
      <NavBar />
      <section className="pt-32 pb-20 hero-glow">
        <div className="mx-auto max-w-6xl px-6 lg:px-12">
          <div className="label-kicker">Discovery Call</div>
          <h1 className="font-display text-5xl lg:text-6xl font-light tracking-tight mt-4 leading-[1.04]">
            30 minutes to map your path to capital.
          </h1>
          <p className="text-white/60 mt-6 max-w-2xl">
            A confidential, NDA-governed conversation. You leave with a clear diagnosis
            across entity, operations, narrative, and lender fit.
          </p>

          {/* Stepper */}
          <div className="flex items-center gap-6 mt-12 text-xs">
            {["When", "About You", "Confirmed"].map((label, i) => {
              const n = i + 1;
              const active = n === step;
              const done = n < step;
              return (
                <div key={label} className="flex items-center gap-3">
                  <div className={`w-7 h-7 border ${active || done ? "border-white text-white" : "border-white/20 text-white/40"} flex items-center justify-center font-mono`}>
                    {n}
                  </div>
                  <span className={`label-kicker ${active ? "text-white" : ""}`}>{label}</span>
                  {i < 2 && <div className="w-12 h-px bg-white/10" />}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <Reveal as="section" className="pb-32">
        <div className="mx-auto max-w-6xl px-6 lg:px-12 grid lg:grid-cols-12 gap-px bg-white/10">
          {/* Left rail trust */}
          <aside className="lg:col-span-4 bg-[#050505] p-8 space-y-6">
            <div>
              <div className="label-kicker flex items-center gap-2"><CalendarDays className="h-3 w-3" /> Duration</div>
              <div className="text-white mt-2">30 minutes</div>
            </div>
            <div>
              <div className="label-kicker flex items-center gap-2"><Video className="h-3 w-3" /> Platform</div>
              <div className="text-white mt-2">Jitsi Meet (browser, no install)</div>
            </div>
            <div>
              <div className="label-kicker flex items-center gap-2"><ShieldCheck className="h-3 w-3" /> Confidentiality</div>
              <div className="text-white mt-2">NDA-governed, encrypted</div>
            </div>
            <div className="pt-6 border-t border-white/10">
              <div className="label-kicker">Confidence</div>
              <p className="text-white/60 text-sm mt-2">
                $1M+ closed for partners. 48 term-sheets reviewed.
                You'll speak with a principal — not a sales agent.
              </p>
            </div>
          </aside>

          {/* Right panel */}
          <div className="lg:col-span-8 bg-[#050505] p-8 lg:p-12">
            {step === 1 && (
              <div className="grid md:grid-cols-2 gap-10">
                <div>
                  <div className="label-kicker">Pick a date</div>
                  <div className="mt-4 inline-block border border-white/10">
                    <Calendar
                      mode="single"
                      selected={date}
                      onSelect={(d) => setDate(d)}
                      disabled={(d) => {
                        const today = new Date(); today.setHours(0,0,0,0);
                        return d < today || d.getDay() === 0 || d.getDay() === 6;
                      }}
                      data-testid="booking-calendar"
                      className="bg-transparent text-white"
                    />
                  </div>
                </div>
                <div>
                  <div className="label-kicker">Pick a time</div>
                  <div className="grid grid-cols-3 gap-2 mt-4">
                    {TIME_SLOTS.map((t) => (
                      <button
                        key={t}
                        data-testid={`time-${t}`}
                        onClick={() => setTime(t)}
                        className={`px-3 py-2 text-sm border ${time === t ? "border-white bg-white text-black" : "border-white/15 text-white/80 hover:border-white/40"} transition-colors`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                  <div className="label-kicker mt-8 flex items-center gap-2"><Clock className="h-3 w-3" /> Timezone</div>
                  <div className="text-sm text-white/60 mt-2">{form.timezone}</div>

                  <Button
                    data-testid="booking-next"
                    disabled={!date || !time}
                    onClick={() => setStep(2)}
                    className="rounded-none bg-white text-black hover:bg-white/90 mt-10 w-full h-12 btn-shimmer"
                  >
                    Continue <ArrowUpRight className="ml-2 h-4 w-4" strokeWidth={1.25} />
                  </Button>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-6">
                <div className="grid md:grid-cols-2 gap-6">
                  <Field label="Full name">
                    <Input data-testid="bk-name" value={form.name} onChange={setField("name")} placeholder="Jane Doe" className="rounded-none bg-black/40 border-white/15" />
                  </Field>
                  <Field label="Email">
                    <Input data-testid="bk-email" type="email" value={form.email} onChange={setField("email")} placeholder="jane@firm.com" className="rounded-none bg-black/40 border-white/15" />
                  </Field>
                  <Field label="Phone (optional)">
                    <Input data-testid="bk-phone" value={form.phone} onChange={setField("phone")} placeholder="+1 555 123 4567" className="rounded-none bg-black/40 border-white/15" />
                  </Field>
                  <Field label="Company">
                    <Input data-testid="bk-company" value={form.company} onChange={setField("company")} placeholder="Firm name" className="rounded-none bg-black/40 border-white/15" />
                  </Field>
                  <Field label="Role">
                    <Select value={form.role} onValueChange={setField("role")}>
                      <SelectTrigger data-testid="bk-role" className="rounded-none bg-black/40 border-white/15"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {["Founder", "CEO / Principal", "CFO", "Family Office", "Fund / Lender", "Advisor", "Other"].map((r) => (
                          <SelectItem key={r} value={r}>{r}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Capital range">
                    <Select value={form.capital_range} onValueChange={setField("capital_range")}>
                      <SelectTrigger data-testid="bk-capital" className="rounded-none bg-black/40 border-white/15"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {["< $1M", "$1M – $5M", "$5M – $15M", "$15M – $50M", "> $50M"].map((r) => (
                          <SelectItem key={r} value={r}>{r}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                </div>
                <Field label="What are you trying to close? (optional)">
                  <Textarea data-testid="bk-notes" value={form.notes} onChange={setField("notes")} rows={4}
                    placeholder="A brief description of the deal, the target lender type, and the timing."
                    className="rounded-none bg-black/40 border-white/15" />
                </Field>
                <div className="flex items-center gap-3 pt-2">
                  <Button data-testid="bk-back" variant="outline" className="rounded-none border-white/20 hover:bg-white/10" onClick={() => setStep(1)}>
                    Back
                  </Button>
                  <Button
                    data-testid="bk-submit"
                    onClick={submit}
                    disabled={submitting || !form.name || !form.email}
                    className="rounded-none bg-white text-black hover:bg-white/90 px-7 h-11 btn-shimmer"
                  >
                    {submitting ? "Booking…" : "Confirm Discovery Call"}
                  </Button>
                </div>
              </div>
            )}

            {step === 3 && confirmation && (
              <div data-testid="bk-confirmation" className="py-8">
                <div className="label-kicker">Confirmed</div>
                <h2 className="font-display text-4xl mt-3">You're on the calendar.</h2>
                <p className="text-white/65 mt-4 max-w-lg">
                  An invitation has been sent to <span className="text-white">{form.email}</span>.
                  Bring the most pressing version of your file — even if it's incomplete.
                </p>
                <div className="mt-8 border border-white/15 p-6 grid sm:grid-cols-2 gap-6 max-w-2xl">
                  <Detail label="Date">{date.toDateString()}</Detail>
                  <Detail label="Time">{time} {form.timezone}</Detail>
                  <Detail label="Platform">Jitsi Meet</Detail>
                  <Detail label="Meeting link">
                    <a href={confirmation.meet_link} target="_blank" rel="noreferrer"
                       className="text-[hsl(var(--gold))] hover:underline break-all" data-testid="bk-meet-link">
                      {confirmation.meet_link}
                    </a>
                  </Detail>
                </div>
                <div className="flex gap-3 mt-10">
                  <Button onClick={() => nav("/")} variant="outline" className="rounded-none border-white/20 hover:bg-white/10">Back to home</Button>
                  <Button onClick={() => nav("/auth")} className="rounded-none bg-white text-black hover:bg-white/90">Create Portal Account</Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </Reveal>

      <Footer />
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <Label className="label-kicker">{label}</Label>
      <div className="mt-2">{children}</div>
    </div>
  );
}
function Detail({ label, children }) {
  return (
    <div>
      <div className="label-kicker">{label}</div>
      <div className="text-white text-sm mt-1">{children}</div>
    </div>
  );
}
