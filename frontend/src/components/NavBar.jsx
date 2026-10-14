import { Link, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { Button } from "./ui/button";
import { CalendarPlus, User, Handshake, LayoutDashboard, LogOut } from "lucide-react";

export default function NavBar() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const isStaff = user && (user.role === "admin" || user.account_type === "underwriter" || user.account_type === "partner");

  return (
    <header
      data-testid="site-header"
      className="fixed top-0 inset-x-0 z-50 border-b border-white/10 backdrop-blur-xl bg-black/60"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-12 h-16 flex items-center justify-between">
        <Link to="/" data-testid="brand-logo" className="flex items-center gap-2">
          <span className="font-display text-xl tracking-tight">D.O.X</span>
          <span className="label-kicker hidden sm:inline">Capital</span>
        </Link>
        <div className="flex items-center gap-2 sm:gap-2">
          {!(user && user !== false) && (
            <Link to="/book">
              <Button data-testid="nav-book-call" variant="outline" aria-label="Book Discovery Call"
                className="rounded-none border-white/20 hover:bg-white hover:text-black h-10 w-10 sm:w-auto px-0 sm:px-4 gap-2">
                <CalendarPlus className="h-4 w-4" strokeWidth={1.5} />
                <span className="hidden sm:inline">Book Discovery Call</span>
              </Button>
            </Link>
          )}
          {user && user !== false ? (
            <>
              <Link to={isStaff ? "/workspace" : "/dashboard"}>
                <Button data-testid="nav-dashboard" aria-label={isStaff ? "Workspace" : "Portal"}
                  className="rounded-none bg-white text-black hover:bg-white/90 h-10 w-10 sm:w-auto px-0 sm:px-4 gap-2">
                  <LayoutDashboard className="h-4 w-4" strokeWidth={1.5} />
                  <span className="hidden sm:inline">{isStaff ? "Workspace" : "Portal"}</span>
                </Button>
              </Link>
              <Button
                data-testid="nav-logout"
                variant="ghost"
                aria-label="Sign out"
                className="rounded-none text-white/60 hover:text-white h-10 w-10 sm:w-auto px-0 sm:px-4 gap-2"
                onClick={async () => { await logout(); nav("/"); }}
              >
                <LogOut className="h-4 w-4" strokeWidth={1.5} />
                <span className="hidden sm:inline">Sign out</span>
              </Button>
            </>
          ) : (
            <>
              <Link to="/auth?as=client">
                <Button data-testid="nav-client-signin" aria-label="Client sign in"
                  className="rounded-none bg-white text-black hover:bg-white/90 h-10 w-10 sm:w-auto px-0 sm:px-4 gap-2">
                  <User className="h-4 w-4" strokeWidth={1.5} />
                  <span className="hidden sm:inline">Client</span>
                </Button>
              </Link>
              <Link to="/auth?as=partner">
                <Button data-testid="nav-partner-signin" variant="outline" aria-label="Partner sign in"
                  className="rounded-none border-[hsl(var(--gold))]/40 text-[hsl(var(--gold))] hover:bg-[hsl(var(--gold))] hover:text-black h-10 w-10 sm:w-auto px-0 sm:px-4 gap-2">
                  <Handshake className="h-4 w-4" strokeWidth={1.5} />
                  <span className="hidden sm:inline">Partner</span>
                </Button>
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
