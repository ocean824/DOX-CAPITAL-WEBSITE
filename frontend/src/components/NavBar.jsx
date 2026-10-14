import { Link, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { Button } from "./ui/button";

export default function NavBar() {
  const { user, logout } = useAuth();
  const nav = useNavigate();

  const linkCls = ({ isActive }) =>
    `text-sm tracking-tight transition-colors ${isActive ? "text-white" : "text-white/60 hover:text-white"}`;

  return (
    <header
      data-testid="site-header"
      className="fixed top-0 inset-x-0 z-50 border-b border-white/10 backdrop-blur-xl bg-black/60"
    >
      <div className="mx-auto max-w-7xl px-6 lg:px-12 h-16 flex items-center justify-between">
        <Link to="/" data-testid="brand-logo" className="flex items-center gap-2">
          <span className="font-display text-xl tracking-tight">D.O.X</span>
          <span className="label-kicker hidden sm:inline">Capital</span>
        </Link>
        <nav className="hidden lg:flex items-center gap-8"></nav>
        <div className="flex items-center gap-2">
          {!(user && user !== false) && (
            <Link to="/book">
              <Button data-testid="nav-book-call" variant="outline" className="rounded-none border-white/20 hover:bg-white hover:text-black">
                Book Discovery Call
              </Button>
            </Link>
          )}
          {user && user !== false ? (
            <>
              <Link to={user.role === "admin" || user.account_type === "underwriter" || user.account_type === "partner" ? "/workspace" : "/dashboard"}>
                <Button data-testid="nav-dashboard" className="rounded-none bg-white text-black hover:bg-white/90">
                  {user.role === "admin" || user.account_type === "underwriter" || user.account_type === "partner" ? "Workspace" : "Portal"}
                </Button>
              </Link>
              <Button
                data-testid="nav-logout"
                variant="ghost"
                className="rounded-none text-white/60 hover:text-white"
                onClick={async () => { await logout(); nav("/"); }}
              >
                Sign out
              </Button>
            </>
          ) : (
            <>
              <Link to="/auth?as=client">
                <Button data-testid="nav-client-signin" className="rounded-none bg-white text-black hover:bg-white/90">
                  Client
                </Button>
              </Link>
              <Link to="/auth?as=partner">
                <Button data-testid="nav-partner-signin" variant="outline" className="rounded-none border-[hsl(var(--gold))]/40 text-[hsl(var(--gold))] hover:bg-[hsl(var(--gold))] hover:text-black">
                  Partner
                </Button>
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
