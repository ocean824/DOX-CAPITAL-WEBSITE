import { useCallback, useEffect, useRef, useState } from "react";
import { api, formatApiError } from "../lib/api";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { toast } from "sonner";
import {
  UploadCloud, CheckCircle2, AlertTriangle, CircleDashed, FileText, Paperclip, HelpCircle,
} from "lucide-react";

const STATUS = {
  missing: { label: "Missing", cls: "text-white/40 border-white/15", Icon: CircleDashed },
  received: { label: "Received", cls: "text-[hsl(var(--gold))] border-[hsl(var(--gold))]/40", Icon: FileText },
  verified: { label: "Verified", cls: "text-emerald-300 border-emerald-500/40", Icon: CheckCircle2 },
  rejected: { label: "Rejected", cls: "text-red-300 border-red-500/40", Icon: AlertTriangle },
  na: { label: "N/A", cls: "text-white/30 border-white/10", Icon: CircleDashed },
};

export const ReadinessTab = () => {
  const [data, setData] = useState(null);
  const [metrics, setMetrics] = useState({});
  const [saving, setSaving] = useState(false);
  const [busyItem, setBusyItem] = useState("");
  const bulkRef = useRef(null);

  const load = useCallback(async () => {
    const { data: d } = await api.get("/prescreen/me");
    setData(d);
    setMetrics(d.metrics || {});
  }, []);

  useEffect(() => { load().catch((e) => toast.error(formatApiError(e.response?.data?.detail) || e.message)); }, [load]);

  const upload = async (file, itemId) => {
    setBusyItem(itemId);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("category", `prescreen:${itemId}`);
      await api.post("/uploads", fd, { headers: { "Content-Type": "multipart/form-data" } });
      await load();
      toast.success("Uploaded");
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || e.message);
    } finally { setBusyItem(""); }
  };

  const uploadMany = async (files, itemId) => {
    const list = Array.from(files || []);
    if (!list.length) return;
    if (list.length === 1) return upload(list[0], itemId);
    setBusyItem(itemId);
    let ok = 0;
    try {
      for (const file of list) {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("category", `prescreen:${itemId}`);
        await api.post("/uploads", fd, { headers: { "Content-Type": "multipart/form-data" } });
        ok += 1;
      }
      await load();
      toast.success(`Uploaded ${ok} files`);
    } catch (e) {
      await load();
      toast.error(`${formatApiError(e.response?.data?.detail) || e.message}${ok ? ` — ${ok} uploaded before the error` : ""}`);
    } finally { setBusyItem(""); }
  };

  const saveMetrics = async () => {
    setSaving(true);
    try {
      const { data: d } = await api.put("/prescreen/me/metrics", { metrics });
      setData(d);
      toast.success("Figures saved — gates recalculated");
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || e.message);
    } finally { setSaving(false); }
  };

  if (!data) return <div className="py-10 text-sm text-white/50">Loading checklist…</div>;

  const { score, computed, red_flags: flags, sections, metric_fields, track_label, ready } = data;

  return (
    <div data-testid="readiness-tab" className="space-y-14">
      <div className="grid lg:grid-cols-12 gap-10">
        <div className="lg:col-span-7">
          <h2 className="font-display text-2xl">
            {track_label ? `${track_label} file` : "Your document checklist"}
          </h2>
          <p className="text-white/60 text-sm mt-3 max-w-xl">
            {track_label
              ? "Everything below comes from the D.O.X underwriting pre-screening checklist. Upload each item and clear every gate — the file goes to the underwriting desk only when both are complete."
              : "Our team is classifying your file as either a pre-revenue development or a profitable operating company. The items below are required either way — start now and the rest appears once your track is set."}
          </p>

          <div className="mt-8">
            <div className="flex items-end justify-between">
              <div className="label-kicker text-xs">Readiness</div>
              <div data-testid="readiness-score" className="font-display text-3xl tabular">{score.pct}%</div>
            </div>
            <div className="mt-3 h-[3px] bg-white/10">
              <div className="h-full bg-[hsl(var(--gold))] transition-all duration-700"
                   style={{ width: `${score.pct}%` }} />
            </div>
            <p className="text-xs text-white/45 mt-3">
              {score.received} of {score.required_total} required documents received · {score.verified} verified ·{" "}
              {data.open_flag_count} gate{data.open_flag_count === 1 ? "" : "s"} outstanding
            </p>
            {ready && (
              <p data-testid="readiness-ready" className="text-sm text-emerald-300 mt-4 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4" /> Underwriter-ready — our desk has been notified.
              </p>
            )}
          </div>
        </div>

        <div className="lg:col-span-5">
          <div className="label-kicker text-xs">Calculated ratios</div>
          <div className="mt-4 grid grid-cols-3 gap-px bg-white/10">
            <Ratio label="LTV" value={computed.ltv} suffix="%" />
            <Ratio label="Coverage" value={computed.coverage} suffix="%" />
            <Ratio label="DSCR" value={computed.dscr} suffix="x" />
          </div>
        </div>
      </div>

      {metric_fields.length > 0 && (
        <div>
          <div className="label-kicker text-xs">Key figures</div>
          <p className="text-white/55 text-sm mt-3 max-w-2xl">
            These drive the underwriting gates automatically — equity floor, collateral coverage and
            debt service coverage.
          </p>
          <div className="mt-6 grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {metric_fields.map((f) => (
              <div key={f.id}>
                <label className="text-xs text-white/50 block mb-2">{f.label}</label>
                {f.type === "bool" ? (
                  <div className="flex gap-px bg-white/10">
                    {[["Yes", true], ["No", false]].map(([lbl, val]) => (
                      <button key={lbl} data-testid={`metric-${f.id}-${lbl.toLowerCase()}`}
                        onClick={() => setMetrics((s) => ({ ...s, [f.id]: val }))}
                        className={`px-5 py-2 text-xs transition-colors ${
                          metrics[f.id] === val ? "bg-white text-black" : "bg-[#050505] text-white/50 hover:text-white"
                        }`}>
                        {lbl}
                      </button>
                    ))}
                  </div>
                ) : (
                  <Input data-testid={`metric-${f.id}`} type="number" inputMode="decimal"
                    value={metrics[f.id] ?? ""}
                    placeholder={f.type === "percent" ? "%" : "$"}
                    onChange={(e) => setMetrics((s) => ({ ...s, [f.id]: e.target.value }))}
                    className="rounded-none bg-black/40 border-white/15" />
                )}
              </div>
            ))}
          </div>
          <Button data-testid="save-metrics" onClick={saveMetrics} disabled={saving}
            className="mt-7 rounded-none bg-white text-black hover:bg-white/90 h-11 px-6">
            {saving ? "Saving…" : "Save figures"}
          </Button>
        </div>
      )}

      <div>
        <div className="label-kicker text-xs">Underwriting gates</div>
        <div className="mt-4 divide-y divide-white/10 border-y border-white/10">
          {flags.map((f) => {
            const st = f.state === "clear" ? STATUS.verified : f.state === "open" ? STATUS.rejected : STATUS.missing;
            const Icon = f.state === "clear" ? CheckCircle2 : f.state === "open" ? AlertTriangle : HelpCircle;
            return (
              <div key={f.id} data-testid={`gate-${f.id}`} className="py-4 flex items-start gap-3">
                <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${st.cls.split(" ")[0]}`} strokeWidth={1.5} />
                <div>
                  <div className="text-sm">{f.label}</div>
                  {f.detail && <div className="text-xs text-white/45 mt-1">{f.detail}</div>}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {sections.map((s) => (
        <div key={s.id} data-testid={`section-${s.id}`}>
          <div className="flex items-baseline gap-3">
            <span className="label-kicker text-xs text-[hsl(var(--gold))]">{s.number}</span>
            <h3 className="font-display text-xl">{s.title}</h3>
          </div>
          <div className="mt-4 divide-y divide-white/10 border-y border-white/10">
            {s.items.map((i) => {
              const st = STATUS[i.status] || STATUS.missing;
              return (
                <div key={i.id} data-testid={`item-${i.id}`} className="py-5 grid md:grid-cols-12 gap-4 items-start">
                  <div className="md:col-span-7">
                    <div className="text-sm flex items-center gap-2">
                      {i.title}
                      {!i.required && <span className="text-[10px] tracking-widest uppercase text-white/30">optional</span>}
                    </div>
                    {i.note && <div className="text-xs text-white/45 mt-1 max-w-lg">{i.note}</div>}
                    {i.note_admin && <div className="text-xs text-red-300 mt-1">{i.note_admin}</div>}
                    {i.uploads?.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {i.uploads.map((u) => (
                          <div key={u.id} className="text-xs text-white/50 flex items-center gap-2">
                            <Paperclip className="h-3 w-3" /> {u.original_filename}
                          </div>
                        ))}
                      </div>
                    )}
                    {i.note && i.status === "rejected" && (
                      <div className="text-xs text-red-300 mt-2">{i.note}</div>
                    )}
                  </div>
                  <div className="md:col-span-2">
                    <span className={`text-[10px] tracking-widest uppercase border px-2 py-1 ${st.cls}`}>
                      {st.label}
                    </span>
                  </div>
                  <div className="md:col-span-3 md:text-right">
                    <label className="inline-flex items-center gap-2 text-xs text-white/70 hover:text-white cursor-pointer">
                      <input type="file" className="hidden" multiple data-testid={`upload-${i.id}`}
                        onChange={(e) => { if (e.target.files?.length) uploadMany(e.target.files, i.id); e.target.value = ""; }} />
                      <UploadCloud className="h-4 w-4" strokeWidth={1.25} />
                      {busyItem === i.id ? "Uploading…" : i.uploads?.length ? "Replace / add" : "Upload"}
                    </label>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      <div>
        <div className="label-kicker text-xs">Not sure where it goes?</div>
        <label data-testid="bulk-upload" className="mt-4 block border border-dashed border-white/20 p-8 cursor-pointer hover:bg-white/[0.02] transition max-w-xl">
          <input ref={bulkRef} type="file" className="hidden" multiple data-testid="bulk-upload-input"
            onChange={(e) => { if (e.target.files?.length) uploadMany(e.target.files, "unassigned"); e.target.value = ""; }} />
          <UploadCloud className="h-6 w-6 text-[hsl(var(--gold))]" strokeWidth={1.25} />
          <div className="font-display text-xl mt-4">
            {busyItem === "unassigned" ? "Uploading…" : "Drop any supporting files here"}
          </div>
          <p className="text-white/45 text-xs mt-2">
            Select several at once — our team files each against the right checklist item · PDF, PNG, JPG, XLSX · max 200MB each
          </p>
        </label>
        {data.unassigned?.length > 0 && (
          <div className="mt-4 space-y-1">
            {data.unassigned.map((u) => (
              <div key={u.id} className="text-xs text-white/50 flex items-center gap-2">
                <Paperclip className="h-3 w-3" /> {u.original_filename} — awaiting filing
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

function Ratio({ label, value, suffix }) {
  return (
    <div className="bg-[#050505] p-5">
      <div className="font-display text-2xl tabular">{value ?? "—"}{value != null ? suffix : ""}</div>
      <div className="text-[10px] tracking-widest uppercase text-white/40 mt-1">{label}</div>
    </div>
  );
}
