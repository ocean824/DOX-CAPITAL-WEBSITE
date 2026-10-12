import { Link } from "react-router-dom";
import { motion, useScroll, useTransform } from "framer-motion";
import { ArrowUpRight, Shield, FileCheck2, Building2, Check, Lock } from "lucide-react";
import { Button } from "../components/ui/button";
import NavBar from "../components/NavBar";
import Footer from "../components/Footer";
import HeroOrb from "../components/HeroOrb";
import Reveal from "../components/Reveal";
import ScrollProgress from "../components/ScrollProgress";

const heroContainer = {
  hidden: {},
  show: { transition: { staggerChildren: 0.12, delayChildren: 0.1 } },
};
const heroItem = {
  hidden: { opacity: 0, y: 24, filter: "blur(8px)" },
  show: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.8, ease: [0.22, 1, 0.36, 1] } },
};

const SERVICES = [
  {
    n: "01",
    title: "Quality Control",
    body:
      "We only work with businesses introduced by trusted partners — every file is filtered before it enters our pipeline so lender attention is never wasted.",
  },
  {
    n: "02",
    title: "Referrer Vetting",
    body:
      "Your referrer vouches for your potential before you even enter our system. The relationship is the first signal of underwriting quality.",
  },
  {
    n: "03",
    title: "Entity & Narrative Rebuild",
    body:
      "We don't just advise — we rebuild your entity, operations, and financial narrative to match the exact criteria of top-tier lenders.",
  },
  {
    n: "04",
    title: "White-Glove Closing",
    body:
      "Intensive, white-glove attention is the only mode we operate in. We sit at the table from term sheet to wire — institutional capital, delivered.",
  },
];

const PARTNERS = [
  "Private Credit Funds",
  "Family Offices",
  "Senior Lenders",
  "Mezzanine Desks",
  "SPV Counsel",
  "Audit Firms",
];

const FAQ = [
  {
    q: "Are you a lender?",
    a: "No. D.O.X Capital is an advisory and packaging firm. We restructure the borrower side so institutional capital can transact with confidence.",
  },
  {
    q: "What size of deal do you work on?",
    a: "We work on debt facilities of $50M+, with the structure built around the project itself — senior, mezzanine, or hybrid, backed by the operating business or the assets behind it.",
  },
  {
    q: "What does the discovery call cover?",
    a: "We diagnose capital readiness across four lenses: entity, books, narrative, and lender fit. You leave with a clear roadmap, even if we don't engage.",
  },
  {
    q: "How is my information protected?",
    a: "All exchanges are governed by a mutual NDA. Documents are stored encrypted in our portal and only shared with parties you explicitly authorize.",
  },
];

export default function LandingPage() {
  const { scrollY } = useScroll();
  const orbY = useTransform(scrollY, [0, 700], [0, -90]);
  const orbScale = useTransform(scrollY, [0, 700], [1, 1.08]);
  return (
    <div className="text-white grain min-h-screen">
      <ScrollProgress />
      <NavBar />

      {/* HERO */}
      <section className="hero-glow relative overflow-hidden min-h-screen flex flex-col justify-center">
        <motion.div style={{ y: orbY, scale: orbScale }} className="absolute inset-0 z-0 pointer-events-none">
          <HeroOrb fill />
        </motion.div>
        <div className="relative z-10 mx-auto max-w-5xl px-6 lg:px-12 flex flex-col items-center text-center py-28">
          <motion.div className="w-full" variants={heroContainer} initial="hidden" animate="show">
            <motion.h1 variants={heroItem} className="font-display text-5xl sm:text-6xl lg:text-7xl font-light tracking-tight leading-[1.02]">
              Capital doesn't flow to everyone.<br/>
              It flows to the{" "}
              <span className="italic" style={{ color: "hsl(var(--gold))" }}>structured</span>.
            </motion.h1>
            <motion.p variants={heroItem} className="text-white/70 text-lg max-w-2xl mx-auto mt-8 leading-relaxed">
              We engineer corporate structures for institutional funding. Most businesses
              have great ideas but fail the bank's structural audit — we rebuild your
              entity, operations, and financial narrative to match the exact criteria of
              top-tier lenders.
            </motion.p>
            <motion.div variants={heroItem} className="flex flex-wrap items-center justify-center gap-3 mt-10">
              <Link to="/book">
                <Button data-testid="hero-cta-book" className="rounded-none bg-white text-black hover:bg-white/90 px-7 h-12 btn-shimmer">
                  Book Discovery Call <ArrowUpRight className="ml-2 h-4 w-4" strokeWidth={1.25} />
                </Button>
              </Link>
              <Link to="/auth?as=client">
                <Button data-testid="hero-cta-portal" variant="outline" className="rounded-none border-white/25 hover:bg-white/10 px-7 h-12">
                  Client Sign In
                </Button>
              </Link>
            </motion.div>
          </motion.div>
        </div>

        {/* marquee */}
        <div className="relative z-10 mt-auto border-y border-white/10 overflow-hidden bg-black/40 backdrop-blur-sm">
          <div className="marquee-track flex gap-12 py-5 whitespace-nowrap">
            {[...PARTNERS, ...PARTNERS].map((p, i) => (
              <span key={`${p}-${i}`} className="label-kicker">{p} ·</span>
            ))}
          </div>
        </div>
      </section>

      {/* SERVICES */}
      <Reveal as="section" id="services" className="py-24 lg:py-32">
        <div className="mx-auto max-w-7xl px-6 lg:px-12">
          <div className="reveal grid lg:grid-cols-12 gap-8 mb-16">
            <div className="lg:col-span-5">
              <div className="label-kicker">Why You Can't Just 'Sign Up'</div>
              <h2 className="font-display text-4xl lg:text-5xl font-light mt-4 leading-tight">
                A high success rate is not an accident.
              </h2>
            </div>
            <p className="lg:col-span-6 lg:col-start-7 text-white/65 text-base leading-relaxed self-end">
              To maintain a high success rate with our lending partners, every sign-up is reviewed
              before access is granted. We do not accept cold applications — every client gets the
              intensive, white-glove attention required for large-scale financing.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-px bg-white/10 reveal">
            {SERVICES.map((s) => (
              <div key={s.n} className="bg-[#050505] p-10 group bordered hover:bg-[#0a0a0a] transition-colors">
                <div className="flex items-start justify-between">
                  <div className="font-mono text-xs text-white/40">{s.n}</div>
                  <ArrowUpRight className="h-4 w-4 text-white/30 group-hover:text-[hsl(var(--gold))] transition-colors" strokeWidth={1.25} />
                </div>
                <h3 className="font-display text-2xl mt-8">{s.title}</h3>
                <p className="text-white/60 text-sm mt-3 leading-relaxed">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </Reveal>

      {/* PROCESS / TIMELINE */}
      <Reveal as="section" className="py-24 lg:py-32 border-t border-white/10">
        <div className="mx-auto max-w-7xl px-6 lg:px-12">
          <div className="reveal">
            <div className="label-kicker">Your Path to Institutional Capital Starts Here</div>
            <h2 className="font-display text-4xl lg:text-5xl font-light mt-4 leading-tight max-w-3xl">
              Whether you arrive with a trusted referral or seek a direct introduction, your journey begins here.
            </h2>
          </div>
          <div className="mt-16 grid md:grid-cols-2 gap-px bg-white/10 reveal">
            <div className="bg-[#050505] p-10">
              <div className="label-kicker">Have a Referrer?</div>
              <div className="font-display text-2xl mt-6">Your spot is reserved.</div>
              <p className="text-white/60 text-sm mt-3 leading-relaxed">
                Create your profile now. Access remains <span className="text-white">locked</span> until your
                partner confirms your introduction — preserving the trust framework that makes our pipeline work.
              </p>
              <Link to="/auth?as=client" className="inline-flex items-center gap-2 text-sm mt-6 text-white hover:text-[hsl(var(--gold))]">
                Create profile <ArrowUpRight className="h-4 w-4" strokeWidth={1.25} />
              </Link>
            </div>
            <div className="bg-[#050505] p-10">
              <div className="label-kicker">No Referrer Yet?</div>
              <div className="font-display text-2xl mt-6">Schedule a priority consultation.</div>
              <p className="text-white/60 text-sm mt-3 leading-relaxed">
                Create your private profile. We'll personally review your business structure and determine
                if you qualify for a direct introduction to our network.
              </p>
              <Link to="/book" className="inline-flex items-center gap-2 text-sm mt-6 text-white hover:text-[hsl(var(--gold))]">
                Book a consultation <ArrowUpRight className="h-4 w-4" strokeWidth={1.25} />
              </Link>
            </div>
          </div>
          <p className="reveal text-center text-white/55 text-sm mt-10 max-w-2xl mx-auto">
            Don't wait for an invitation. Create your profile today and choose your path to activation.
          </p>
        </div>
      </Reveal>

      {/* COMPLIANCE */}
      <Reveal as="section" id="compliance" className="py-24 lg:py-32 border-t border-white/10">
        <div className="mx-auto max-w-7xl px-6 lg:px-12 grid lg:grid-cols-12 gap-12">
          <div className="reveal lg:col-span-5">
            <div className="label-kicker">Compliance</div>
            <h2 className="font-display text-4xl lg:text-5xl font-light mt-4 leading-tight">
              Designed for institutional scrutiny.
            </h2>
            <p className="text-white/60 mt-6">
              Every interaction with D.O.X Capital is governed by written agreements,
              KYC / AML protocol, and encrypted document handling. We meet the bar set by
              professional compliance teams — because that's the bar that closes the deal.
            </p>
          </div>
          <div className="reveal lg:col-span-7 grid sm:grid-cols-2 gap-px bg-white/10">
            {[
              { icon: Shield,     h: "NDA-governed",     b: "Mutual non-disclosure executed before any deal data exchange." },
              { icon: Lock,       h: "Encrypted Portal", b: "All uploads stored in object-level encrypted storage." },
              { icon: FileCheck2, h: "KYC / AML",        b: "Identity, source-of-funds, and ownership checks on every file." },
              { icon: Building2,  h: "Institutional Fit",b: "Process designed around senior credit and family-office norms." },
            ].map(({ icon: Icon, h, b }) => (
              <div key={h} className="bg-[#050505] p-8">
                <Icon className="h-5 w-5 text-[hsl(var(--gold))]" strokeWidth={1.25} />
                <div className="font-display text-xl mt-6">{h}</div>
                <p className="text-white/55 text-sm mt-2">{b}</p>
              </div>
            ))}
          </div>
        </div>
      </Reveal>

      {/* FAQ */}
      <Reveal as="section" className="py-24 lg:py-32 border-t border-white/10">
        <div className="mx-auto max-w-7xl px-6 lg:px-12 grid lg:grid-cols-12 gap-12">
          <div className="reveal lg:col-span-4">
            <div className="label-kicker">FAQ</div>
            <h2 className="font-display text-4xl lg:text-5xl font-light mt-4 leading-tight">Answers, first.</h2>
          </div>
          <div className="lg:col-span-8 reveal">
            <div className="divide-y divide-white/10 border-y border-white/10">
              {FAQ.map((f) => (
                <details key={f.q} className="group py-6 px-1">
                  <summary className="flex items-center justify-between cursor-pointer list-none">
                    <span className="font-display text-xl">{f.q}</span>
                    <span className="font-mono text-xl text-white/40 group-open:rotate-45 transition-transform">+</span>
                  </summary>
                  <p className="text-white/60 text-sm mt-3 max-w-2xl leading-relaxed">{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </div>
      </Reveal>

      {/* CTA */}
      <Reveal as="section" className="py-24 lg:py-32 border-t border-white/10 hero-glow">
        <div className="mx-auto max-w-5xl px-6 lg:px-12 text-center reveal">
          <div className="label-kicker">Next Step</div>
          <h2 className="font-display text-5xl lg:text-6xl font-light mt-6 leading-[1.05]">
            Stop being rejected<br/>
            for <span className="italic" style={{ color: "hsl(var(--gold))" }}>'technicalities'</span>.
          </h2>
          <p className="text-white/60 text-base mt-6 max-w-2xl mx-auto">
            We engineer corporate structures for institutional funding. Bring us your hardest file —
            we'll show you how it closes.
          </p>
          <div className="flex items-center justify-center gap-3 mt-10">
            <Link to="/book">
              <Button data-testid="cta-book" className="rounded-none bg-white text-black hover:bg-white/90 px-8 h-12 btn-shimmer">
                Book Discovery Call <ArrowUpRight className="ml-2 h-4 w-4" strokeWidth={1.25} />
              </Button>
            </Link>
            <Link to="/auth?as=client">
              <Button data-testid="cta-portal" variant="outline" className="rounded-none border-white/25 px-8 h-12 hover:bg-white/10">
                Create Your Profile
              </Button>
            </Link>
          </div>
          <div className="mt-8 flex flex-wrap justify-center gap-x-6 gap-y-2 text-xs text-white/40">
            <span className="inline-flex items-center gap-2"><Check className="h-3 w-3" /> Mutual NDA</span>
            <span className="inline-flex items-center gap-2"><Check className="h-3 w-3" /> 24h response</span>
            <span className="inline-flex items-center gap-2"><Check className="h-3 w-3" /> Confidential environment</span>
          </div>
        </div>
      </Reveal>

      <Footer />
    </div>
  );
}
