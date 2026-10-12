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

export function PhasePill({ phase }) {
  const cls = PHASE_CLS[phase] || PHASE_CLS.intake;
  return (
    <span data-testid={`phase-pill-${phase}`}
      className={`text-[10px] tracking-widest uppercase border px-2 py-1 ${cls}`}>
      {PHASE_LABELS[phase] || phase}
    </span>
  );
}
