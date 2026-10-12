import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import ComingSoon from "./ComingSoon";

export default function SiteGate({ children }) {
  const { user } = useAuth();
  const [locked, setLocked] = useState(null);

  useEffect(() => {
    api.get("/site/status")
      .then(({ data }) => setLocked(Boolean(data?.locked)))
      .catch(() => setLocked(true));
  }, [user]);

  if (locked === null || user === null) {
    return <div data-testid="site-gate-loading" className="min-h-screen bg-[#050505]" />;
  }
  if (locked && !(user && user.role === "admin")) return <ComingSoon />;
  return children;
}
