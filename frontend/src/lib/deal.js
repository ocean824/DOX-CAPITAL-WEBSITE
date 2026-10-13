import { Check } from "lucide-react";

export const PHASE_LABELS = {
  intake: "Intake",
  in_preparation: "In Preparation",
  ready_to_underwrite: "Ready to Underwrite",
  in_underwriting: "In Underwriting",
  approved: "Approved",
  declined: "Declined",
};

export const PHASE_CLS = {
  intake: "border-white/20 text-white/60",
  in_preparation: "border-[hsl(var(--gold))]/40 text-[hsl(var(--gold))]",
  ready_to_underwrite: "border-sky-500/40 text-sky-300",
  in_underwriting: "border-indigo-400/40 text-indigo-300",
  approved: "border-emerald-500/40 text-emerald-300",
  declined: "border-red-500/40 text-red-300",
};

export const SCHEDULABLE = ["ready_to_underwrite", "in_underwriting", "approved"];

export const PHASE_ORDER = ["intake", "in_preparation", "ready_to_underwrite", "in_underwriting", "approved"];

const TIMELINE_STEPS = [
  { phase: "intake", title: "Application received", desc: "Your file is open with the D.O.X desk." },
  { phase: "in_preparation", title: "Documents in preparation", desc: "Upload and sign the required files in your portal." },
  { phase: "ready_to_underwrite", title: "Documents submitted", desc: "Your file is complete and queued for the underwriting desk." },
  { phase: "in_underwriting", title: "Under underwriter review", desc: "An underwriter is reviewing your file." },
  { phase: "approved", title: "Approved", desc: "Your file has been approved." },
];

export function DealTimeline({ phase }) {
  const declined = phase === "declined";
  const currentIdx = PHASE_ORDER.indexOf(phase);
  return (
    <div data-testid="deal-timeline" className="mt-8 border border-white/10 bg-[#0a0a0a] p-6 sm:p-8">
      <div className="label-kicker text-xs">Your deal timeline</div>
      <p className="text-white/50 text-sm mt-2">
        Updated by our team as your file moves through underwriting.
      </p>
      <ol className="mt-7 relative border-l border-white/10 ml-3">
        {TIMELINE_STEPS.map((step, i) => {
          const done = !declined && currentIdx > i;
          const active = !declined && currentIdx === i;
          return (
            <li key={step.phase} data-testid={`timeline-step-${step.phase}`} className="ml-6 pb-8 last:pb-0 relative">
              <span className={`absolute -left-[33px] top-0 flex h-5 w-5 items-center justify-center rounded-full border ${
                done ? "bg-[hsl(var(--gold))] border-[hsl(var(--gold))]"
                : active ? "border-[hsl(var(--gold))] bg-[hsl(var(--gold))]/20 animate-pulse"
                : "border-white/20 bg-black"}`}>
                {done && <Check className="h-3 w-3 text-black" strokeWidth={3} />}
              </span>
              <div className={`font-display text-lg ${active ? "text-white" : done ? "text-white/80" : "text-white/40"}`}>
                {step.title}
              </div>
              <p className={`text-xs mt-1 ${active ? "text-[hsl(var(--gold))]" : "text-white/40"}`}>
                {active ? `In progress — ${step.desc}` : step.desc}
              </p>
            </li>
          );
        })}
      </ol>
      {declined && (
        <p data-testid="timeline-declined" className="text-sm text-red-300 mt-2">
          This file has been closed. Reply to your application email with any questions.
        </p>
      )}
    </div>
  );
}

export function PhasePill({ phase }) {
  const cls = PHASE_CLS[phase] || PHASE_CLS.intake;
  return (
    <span data-testid={`phase-pill-${phase}`}
      className={`text-[10px] tracking-widest uppercase border px-2 py-1 ${cls}`}>
      {PHASE_LABELS[phase] || phase}
    </span>
  );
}
