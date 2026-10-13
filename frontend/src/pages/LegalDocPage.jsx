import { useParams, Link, Navigate } from "react-router-dom";
import NavBar from "../components/NavBar";
import Footer from "../components/Footer";
import { ArrowLeft } from "lucide-react";
import { getLegalDoc, LEGAL_EFFECTIVE_DATE } from "../legal/legalContent";

// Inline **bold** rendering.
function renderInline(text, keyBase) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) => {
    if (p.startsWith("**") && p.endsWith("**")) {
      return (
        <strong key={`${keyBase}-b-${i}`} className="font-semibold text-white">
          {p.slice(2, -2)}
        </strong>
      );
    }
    return <span key={`${keyBase}-t-${i}`}>{p}</span>;
  });
}

// Minimal block parser: ## / ### headings, "- " bullets, "N. " ordered lists, paragraphs.
function renderBody(body) {
  const lines = body.split("\n");
  const blocks = [];
  let list = null; // { type: 'ul' | 'ol', items: [] }

  const flush = () => {
    if (!list) return;
    const Tag = list.type === "ul" ? "ul" : "ol";
    blocks.push(
      <Tag
        key={`list-${blocks.length}`}
        className={`my-4 space-y-2 pl-5 text-white/70 leading-relaxed ${
          list.type === "ul" ? "list-disc" : "list-decimal"
        }`}
      >
        {list.items.map((it, i) => (
          <li key={i}>{renderInline(it, `li-${blocks.length}-${i}`)}</li>
        ))}
      </Tag>
    );
    list = null;
  };

  lines.forEach((raw, idx) => {
    const line = raw.trim();
    if (!line) {
      flush();
      return;
    }
    if (line.startsWith("### ")) {
      flush();
      blocks.push(
        <h3 key={idx} className="font-display text-lg text-white mt-8 mb-2">
          {line.slice(4)}
        </h3>
      );
      return;
    }
    if (line.startsWith("## ")) {
      flush();
      blocks.push(
        <h2 key={idx} className="font-display text-2xl text-white mt-10 mb-3">
          {line.slice(3)}
        </h2>
      );
      return;
    }
    if (line.startsWith("- ")) {
      if (!list || list.type !== "ul") {
        flush();
        list = { type: "ul", items: [] };
      }
      list.items.push(line.slice(2));
      return;
    }
    const ordered = line.match(/^(\d+)\.\s+(.*)$/);
    if (ordered) {
      if (!list || list.type !== "ol") {
        flush();
        list = { type: "ol", items: [] };
      }
      list.items.push(ordered[2]);
      return;
    }
    flush();
    blocks.push(
      <p key={idx} className="my-4 text-white/70 leading-relaxed">
        {renderInline(line, `p-${idx}`)}
      </p>
    );
  });
  flush();
  return blocks;
}

export default function LegalDocPage() {
  const { slug } = useParams();
  const doc = getLegalDoc(slug);
  if (!doc) return <Navigate to="/legal" replace />;

  return (
    <div className="text-white grain min-h-screen" data-testid={`legal-doc-${doc.slug}`}>
      <NavBar />
      <article className="pt-32 pb-24">
        <div className="mx-auto max-w-3xl px-6 lg:px-12">
          <Link
            to="/legal"
            data-testid="legal-back-link"
            className="inline-flex items-center gap-2 text-sm text-white/50 hover:text-white transition-colors"
          >
            <ArrowLeft className="h-4 w-4" strokeWidth={1.5} /> Legal Center
          </Link>

          <div className="label-kicker mt-8 text-white/40">{doc.docId}</div>
          <h1 className="font-display text-3xl sm:text-4xl lg:text-5xl font-light tracking-tight mt-3">
            {doc.title}
          </h1>
          <p className="text-white/40 text-sm mt-4">
            Effective {LEGAL_EFFECTIVE_DATE}
          </p>

          <div className="mt-10 border-t border-white/10 pt-8">
            {renderBody(doc.body)}
          </div>
        </div>
      </article>
      <Footer />
    </div>
  );
}
