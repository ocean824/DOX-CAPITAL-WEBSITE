import { useCallback, useEffect, useRef, useState } from "react";
import { Navigate } from "react-router-dom";
import NavBar from "../components/NavBar";
import Footer from "../components/Footer";
import { api, formatApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Button } from "../components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../components/ui/tabs";
import { Badge } from "../components/ui/badge";
import { ReadinessTab } from "../components/ReadinessTab";
import { toast } from "sonner";
import {
  UploadCloud, FileText, Download, ExternalLink, Clock,
  CheckCircle2, FileSignature, ShieldAlert, LayoutGrid,
} from "lucide-react";

export default function DashboardPage() {
  const { user } = useAuth();
  const [uploads, setUploads] = useState([]);
  const [signDocs, setSignDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [pickedName, setPickedName] = useState("");

  const refreshUploads = useCallback(async () => {
    try {
      const r = await api.get("/uploads/mine");
      setUploads(r.data);
    } catch (err) {
      console.error("[dashboard] uploads refresh failed:", err);
    }
  }, []);

  useEffect(() => {
    if (user && user !== false && user.status === "approved") {
      Promise.all([
        api.get("/uploads/mine").catch(() => ({ data: [] })),
        api.get("/documents").catch(() => ({ data: [] })),
      ]).then(([u, d]) => {
        setUploads(u.data);
        setSignDocs(d.data);
        setLoading(false);
      });
    } else if (user !== null) {
      setLoading(false);
    }
  }, [user]);

  if (user === null) return <CenterMsg>Loading…</CenterMsg>;
  if (user === false) return <Navigate to="/auth" replace />;
  if (user.role === "admin") return <Navigate to="/admin" replace />;
  if (user.account_type === "partner" && user.status === "approved") return <Navigate to="/workspace" replace />;

  const status = user.status || "pending";

  const onUpload = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setPickedName(f.name);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", f);
      fd.append("category", "general");
      await api.post("/uploads", fd, { headers: { "Content-Type": "multipart/form-data" } });
      await refreshUploads();
      toast.success("Document uploaded");
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || err.message);
    } finally {
      setUploading(false);
      setPickedName("");
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="bg-[#050505] text-white min-h-screen grain">
      <NavBar />
      <section className="pt-32 pb-16 hero-glow">
        <div className="mx-auto max-w-7xl px-6 lg:px-12">
          <div className="label-kicker">Client Portal</div>
          <div className="flex flex-wrap items-end justify-between gap-6 mt-3">
            <div>
              <h1 className="font-display text-4xl lg:text-5xl font-light leading-tight">
                Welcome, {user.name?.split(" ")[0]}.
              </h1>
              <p className="text-white/55 mt-2 text-sm">{user.email}</p>
            </div>
            <StatusBadge status={status} />
          </div>
          {status === "approved" && (
            <a
              href="/workspace"
              data-testid="dashboard-workspace-link"
              className="mt-8 inline-flex items-center gap-3 border border-[hsl(var(--gold))]/40 px-6 py-4 hover:bg-[hsl(var(--gold))]/10 transition-colors"
            >
              <LayoutGrid className="h-5 w-5 text-[hsl(var(--gold))]" strokeWidth={1.25} />
              <span>
                <span className="block font-display text-xl">Open your deal room</span>
                <span className="block text-xs text-white/50 mt-1">
                  Your live deals, documents, meetings, messages and the knowledge assistant
                </span>
              </span>
              <ExternalLink className="h-4 w-4 text-white/40 ml-2" />
            </a>
          )}
        </div>
      </section>

      <section className="pb-32">
        <div className="mx-auto max-w-7xl px-6 lg:px-12">
          {status === "pending" && (
            <div data-testid="pending-banner" className="border border-white/15 p-8 bg-[#0a0a0a]">
              <div className="flex items-start gap-4">
                <Clock className="h-5 w-5 text-[hsl(var(--gold))] mt-1" strokeWidth={1.25} />
                <div>
                  <h3 className="font-display text-2xl">Your spot is reserved — access is locked.</h3>
                  <p className="text-white/60 mt-2 text-sm max-w-2xl">
                    To maintain a high success rate with our lending partners, every sign-up is
                    reviewed before access is granted.
                    Access activates once your referrer confirms your introduction or our team approves
                    your priority consultation. You'll receive an email at
                    <span className="text-white"> {user.email}</span> when your portal is live.
                    Document upload and signing tabs activate at that point.
                  </p>
                </div>
              </div>
            </div>
          )}
          {status === "rejected" && (
            <div className="border border-red-900/40 p-8 bg-red-950/20">
              <div className="flex items-start gap-4">
                <ShieldAlert className="h-5 w-5 text-red-400 mt-1" strokeWidth={1.25} />
                <div>
                  <h3 className="font-display text-2xl">Access not granted.</h3>
                  <p className="text-white/60 mt-2 text-sm max-w-2xl">
                    Reply to your application email if you believe this is in error.
                  </p>
                </div>
              </div>
            </div>
          )}
          {status === "approved" && (
            <Tabs defaultValue="uploads" className="mt-2">
              <TabsList className="rounded-none bg-transparent p-0 gap-8 border-b border-white/10">
                <TabsTrigger data-testid="tab-uploads" value="uploads"
                  className="rounded-none data-[state=active]:bg-transparent data-[state=active]:text-white data-[state=active]:border-b data-[state=active]:border-white px-0 pb-3 text-white/60">
                  Upload Documents
                </TabsTrigger>
                <TabsTrigger data-testid="tab-sign" value="sign"
                  className="rounded-none data-[state=active]:bg-transparent data-[state=active]:text-white data-[state=active]:border-b data-[state=active]:border-white px-0 pb-3 text-white/60">
                  Sign Documents
                </TabsTrigger>
                <TabsTrigger data-testid="tab-readiness" value="readiness"
                  className="rounded-none data-[state=active]:bg-transparent data-[state=active]:text-white data-[state=active]:border-b data-[state=active]:border-white px-0 pb-3 text-white/60">
                  Document Readiness
                </TabsTrigger>
              </TabsList>

              <TabsContent value="uploads" className="mt-8">
                <div className="grid lg:grid-cols-12 gap-8">
                  <div className="lg:col-span-5">
                    <h2 className="font-display text-2xl">Submit diligence files.</h2>
                    <p className="text-white/60 text-sm mt-3 max-w-md">
                      PDF, images, spreadsheets. 25MB per file. All uploads are encrypted and routed
                      to the D.O.X review team.
                    </p>
                    <label
                      data-testid="upload-dropzone"
                      className="mt-6 block border border-dashed border-white/20 p-8 cursor-pointer hover:bg-white/[0.02] transition"
                    >
                      <input ref={fileRef} type="file" className="hidden" onChange={onUpload}
                             data-testid="upload-input" />
                      <UploadCloud className="h-6 w-6 text-[hsl(var(--gold))]" strokeWidth={1.25} />
                      <div className="font-display text-xl mt-4">{uploading ? `Uploading ${pickedName}…` : "Click to upload"}</div>
                      <p className="text-white/45 text-xs mt-2">PDF, PNG, JPG, XLSX · max 25MB</p>
                    </label>
                  </div>
                  <div className="lg:col-span-7">
                    <div className="label-kicker">Your uploads</div>
                    <div className="mt-4 divide-y divide-white/10 border-y border-white/10">
                      {loading && <Row text="Loading…" />}
                      {!loading && uploads.length === 0 && <Row text="No documents uploaded yet." />}
                      {uploads.map((u) => (
                        <div key={u.id} className="py-4 flex items-center justify-between gap-4">
                          <div className="flex items-center gap-3 min-w-0">
                            <FileText className="h-4 w-4 text-white/50 shrink-0" strokeWidth={1.25} />
                            <div className="min-w-0">
                              <div className="truncate text-sm">{u.original_filename}</div>
                              <div className="text-xs text-white/40">
                                {new Date(u.created_at).toLocaleString()} · {(u.size/1024).toFixed(1)} KB
                              </div>
                            </div>
                          </div>
                          <a
                            href={`/api/uploads/${u.id}/download`}
                            target="_blank" rel="noreferrer"
                            data-testid={`download-${u.id}`}
                            className="text-xs text-white/70 hover:text-white inline-flex items-center gap-1"
                          >
                            <Download className="h-3 w-3" /> download
                          </a>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="sign" className="mt-8">
                <div className="max-w-4xl">
                  <h2 className="font-display text-2xl">Documents requiring your signature.</h2>
                  <p className="text-white/60 text-sm mt-3 max-w-2xl">
                    Click any document to review and sign. Signed copies are returned to the
                    D.O.X review team automatically.
                  </p>

                  <div className="mt-8 grid sm:grid-cols-2 gap-px bg-white/10">
                    {signDocs.map((d) => (
                      <a key={d.id}
                         href={d.external_url}
                         target="_blank" rel="noreferrer"
                         data-testid={`sign-${d.id}`}
                         className="bg-[#050505] p-6 hover:bg-[#0a0a0a] transition group flex flex-col">
                        <div className="flex items-start justify-between">
                          <FileSignature className="h-5 w-5 text-[hsl(var(--gold))]" strokeWidth={1.25} />
                          {d.required ? (
                            <Badge className="rounded-none border-white/20 bg-transparent text-white/70 text-[10px] tracking-widest uppercase">Required</Badge>
                          ) : (
                            <Badge variant="outline" className="rounded-none border-white/15 text-white/50 text-[10px] tracking-widest uppercase">Optional</Badge>
                          )}
                        </div>
                        <div className="font-display text-xl mt-6">{d.title}</div>
                        <p className="text-white/55 text-sm mt-2 flex-1">{d.description}</p>
                        <span className="text-xs text-white/60 group-hover:text-white inline-flex items-center gap-2 mt-6">
                          Open & sign <ExternalLink className="h-3 w-3" />
                        </span>
                      </a>
                    ))}
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="readiness" className="mt-8">
                <ReadinessTab />
              </TabsContent>
            </Tabs>
          )}
        </div>
      </section>

      <Footer />
    </div>
  );
}

function StatusBadge({ status }) {
  const map = {
    pending: { label: "Under review", cls: "border-[hsl(var(--gold))]/40 text-[hsl(var(--gold))]" },
    approved: { label: "Approved", cls: "border-emerald-500/40 text-emerald-300" },
    rejected: { label: "Closed", cls: "border-red-500/40 text-red-300" },
  };
  const m = map[status] || map.pending;
  return (
    <span data-testid={`status-${status}`} className={`text-xs tracking-widest uppercase border px-3 py-1.5 ${m.cls} flex items-center gap-2`}>
      {status === "approved" ? <CheckCircle2 className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
      {m.label}
    </span>
  );
}
function CenterMsg({ children }) {
  return <div className="min-h-screen flex items-center justify-center bg-[#050505] text-white/60 text-sm">{children}</div>;
}
function Row({ text }) {
  return <div className="py-4 text-sm text-white/50">{text}</div>;
}
