import { Link } from "react-router-dom";
import { LEGAL_DOCS } from "../legal/legalContent";

export default function Footer() {
  return (
    <footer data-testid="site-footer" className="border-t border-white/10 mt-32">
      <div className="mx-auto max-w-7xl px-6 lg:px-12 py-16 grid md:grid-cols-12 gap-10">
        <div className="md:col-span-4">
          <div className="font-display text-3xl">D.O.X Capital</div>
          <p className="text-white/60 text-sm mt-3 max-w-sm">
            We engineer corporate structures for institutional funding. Business funding
            consulting for operators serious about closing.
          </p>
          <div className="label-kicker mt-8">Contact</div>
          <a
            href="mailto:deptofx@proton.me"
            data-testid="footer-email"
            className="text-white hover:text-[hsl(var(--gold))] text-sm mt-2 inline-block"
          >
            deptofx@proton.me
          </a>
        </div>
        <div className="md:col-span-2">
          <div className="label-kicker">Firm</div>
          <ul className="mt-4 space-y-2 text-sm text-white/70">
            <li><a href="/#services" className="hover:text-white">Services</a></li>
            <li><a href="/#compliance" className="hover:text-white">Compliance</a></li>
          </ul>
        </div>
        <div className="md:col-span-2">
          <div className="label-kicker">Engage</div>
          <ul className="mt-4 space-y-2 text-sm text-white/70">
            <li><Link to="/book" className="hover:text-white">Book a Discovery Call</Link></li>
            <li><Link to="/auth?as=partner" className="hover:text-white">Partner Sign In</Link></li>
            <li><Link to="/auth?as=client" className="hover:text-white">Client Sign In</Link></li>
          </ul>
        </div>
        <div className="md:col-span-2">
          <div className="label-kicker">Legal</div>
          <ul className="mt-4 space-y-2 text-sm text-white/70">
            <li><Link to="/legal/terms-of-service" className="hover:text-white">Terms of Service</Link></li>
            <li><Link to="/legal/privacy-policy" className="hover:text-white">Privacy Policy</Link></li>
            <li><Link to="/legal/refund-cancellation-policy" className="hover:text-white">Refund Policy</Link></li>
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
          <div className="label-kicker">Disclosure</div>
          <p className="text-xs text-white/40 mt-4 leading-relaxed">
            D.O.X Capital is an advisory and packaging firm. We are not a lender,
            broker-dealer, or registered investment adviser. All engagements are
            governed by a written agreement and applicable confidentiality terms.
          </p>
        </div>
      </div>
      <div className="border-t border-white/10 py-6 text-center text-xs text-white/40">
        © {new Date().getFullYear()} D.O.X Capital — All rights reserved.
      </div>
    </footer>
  );
}
