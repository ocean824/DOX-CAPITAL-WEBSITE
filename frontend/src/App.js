import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "sonner";
import "@/App.css";

import { AuthProvider } from "@/lib/auth";
import LandingPage from "@/pages/LandingPage";
import BookPage from "@/pages/BookPage";
import AuthPage from "@/pages/AuthPage";
import DashboardPage from "@/pages/DashboardPage";
import AdminPage from "@/pages/AdminPage";
import WorkspaceApp from "@/workspace/WorkspaceApp";
import SiteGate from "@/components/SiteGate";

const TOAST_OPTIONS = {
  style: {
    background: "#0a0a0a",
    color: "#fff",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 0,
    fontFamily: "IBM Plex Sans, sans-serif",
  },
};

function App() {
  return (
    <div className="App">
      <AuthProvider>
        <BrowserRouter>
          <SiteGate>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/book" element={<BookPage />} />
            <Route path="/auth" element={<AuthPage />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/admin" element={<AdminPage />} />
            <Route path="/workspace/*" element={<WorkspaceApp />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          </SiteGate>
        </BrowserRouter>
        <Toaster theme="dark" position="bottom-right" toastOptions={TOAST_OPTIONS} />
      </AuthProvider>
    </div>
  );
}

export default App;
