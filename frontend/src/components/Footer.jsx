import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { LEGAL_DOCS } from "../legal/legalContent";
import MatrixRain from "./MatrixRain";

function AnimatedLetter({ char, to, testid, label, tilt = -6, onClick }) {
  return (
    <Link to={to} data-testid={testid} onClick={onClick} className="inline-block" aria-label={label}>
      <motion.span
        className="font-display text-3xl leading-none inline-block"
        style={{ color: "hsl(var(--gold))" }}
        animate={{
          y: [0, -3, 0],
          textShadow: [
            "0 0 4px rgba(255,207,77,0.3)",
            "0 0 16px rgba(255,207,77,0.85)",
            "0 0 4px rgba(255,207,77,0.3)",
          ],
        }}
        transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
        whileHover={{ scale: 1.35, rotate: tilt, color: "#ffffff" }}
      >
        {char}
      </motion.span>
    </Link>
  );
}

export default function Footer() {
  return (
    <footer data-testid="site-footer" className="relative overflow-hidden border-t border-white/10 mt-32">
      <MatrixRain className="absolute inset-0 w-full h-full opacity-25 pointer-events-none" />
      <div className="relative z-10 mx-auto max-w-7xl px-6 lg:px-12 py-16 grid md:grid-cols-12 gap-10">
        <div className="md:col-span-4">
          <div className="font-display text-3xl">D.O.X Capital</div>
          <p className="text-white/60 text-sm mt-3 max-w-sm">
            We engineer corporate structures for institutional funding. Business funding
            consulting for operators serious about closing.
          </p>
          <div className="label-kicker mt-8">Contact</div>
          <a
            href="mailto:admin@thedoxs.com"
            data-testid="footer-email"
            className="text-white hover:text-[hsl(var(--gold))] text-sm mt-2 inline-block"
          >
            admin@thedoxs.com
          </a>
        </div>
        <div className="md:col-span-3">
          <div className="label-kicker">Legal</div>
          <ul className="mt-4 space-y-2 text-sm text-white/70">
            <li><Link to="/legal/terms" className="hover:text-white">Terms of Service</Link></li>
            <li><Link to="/legal/privacy" className="hover:text-white">Privacy Policy</Link></li>
            <li><Link to="/legal/refunds-cancellation-fulfillment" className="hover:text-white">Refunds &amp; Cancellation</Link></li>
            <li><Link to="/legal/accessibility" className="hover:text-white">Accessibility</Link></li>
            <li>
              <Link
                to="/legal"
                data-testid="footer-legal-all"
                className="hover:text-white text-[hsl(var(--gold))]"
              >
                All policies ({LEGAL_DOCS.length})
              </Link>
            </li>
          </ul>
        </div>
        <div className="md:col-span-2">
          <div className="label-kicker" aria-hidden="true">&nbsp;</div>
          <ul className="mt-4 flex flex-col items-start gap-3 text-sm text-white/70">
            <li><AnimatedLetter char="D" to="/auth?as=admin" testid="footer-admin-signin" label="Admin" tilt={-6} /></li>
            <li><AnimatedLetter char="O" to="/auth?as=underwriter" testid="footer-underwriter-signin" label="Underwriter" tilt={6} /></li>
            <li><AnimatedLetter char="X" to="/" testid="footer-home-top" label="Back to top" tilt={-6} onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} /></li>
          </ul>
        </div>
        <div className="md:col-span-2">
          <div className="label-kicker">Disclosure</div>
          <p className="text-xs text-white/40 mt-4 leading-relaxed">
            D.O.X Capital is an advisory and packaging firm. We are not a lender,
            broker-dealer, or registered investment adviser. All engagements are
            governed by a written agreement and applicable confidentiality terms.
          </p>
        </div>
      </div>
      <div className="relative z-10 border-t border-white/10 py-6 text-center text-xs text-white/40">
        © {new Date().getFullYear()} D.O.X Capital — All rights reserved.
        <span className="mx-2 text-white/20">·</span>
        <span data-testid="powered-by">Powered by ZAVREX OS</span>
      </div>
    </footer>
  );
}
