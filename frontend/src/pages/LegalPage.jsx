import { Link } from "react-router-dom";
import NavBar from "../components/NavBar";
import Footer from "../components/Footer";
import Reveal from "../components/Reveal";
import { ArrowUpRight } from "lucide-react";
import { LEGAL_DOCS, LEGAL_EFFECTIVE_DATE } from "../legal/legalContent";

export default function LegalPage() {
  return (
    <div className="text-white grain min-h-screen" data-testid="legal-hub">
      <NavBar />
      <section className="pt-32 pb-24">
        <div className="mx-auto max-w-5xl px-6 lg:px-12">
          <Reveal>
            <div className="label-kicker">Legal Center</div>
            <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-light tracking-tight mt-4">
              Policies, Agreements &amp; Disclosures
            </h1>
            <p className="text-white/60 text-lg mt-6 max-w-2xl leading-relaxed">
              The complete set of D.O.X Capital policies. Where an account or
              engagement is created, you agree to the applicable documents by
              electronic signature. Effective {LEGAL_EFFECTIVE_DATE}.
            </p>
          </Reveal>

          <div className="mt-14 grid gap-4 sm:grid-cols-2">
            {LEGAL_DOCS.map((doc) => (
              <Reveal key={doc.slug}>
                <Link
                  to={`/legal/${doc.slug}`}
                  data-testid={`legal-card-${doc.slug}`}
                  className="group block h-full rounded-sm border border-white/10 bg-white/[0.02] p-6 transition-colors hover:border-[hsl(var(--gold))]/50 hover:bg-white/[0.04]"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="font-display text-xl leading-snug">
                        {doc.title}
                      </div>
                      <p className="text-white/50 text-sm mt-2 leading-relaxed">
                        {doc.summary}
                      </p>
                    </div>
                    <ArrowUpRight
                      className="h-5 w-5 shrink-0 text-white/40 transition-colors group-hover:text-[hsl(var(--gold))]"
                      strokeWidth={1.25}
                    />
                  </div>
                  <div className="label-kicker mt-5 text-white/30">{doc.docId}</div>
                </Link>
              </Reveal>
            ))}
          </div>
        </div>
      </section>
      <Footer />
    </div>
  );
}
