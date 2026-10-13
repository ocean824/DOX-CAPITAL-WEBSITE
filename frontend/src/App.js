import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "sonner";
import "@/App.css";

import { AuthProvider } from "@/lib/auth";
import BackgroundFX from "@/components/BackgroundFX";
import ThemeController from "@/components/ThemeController";
import LandingPage from "@/pages/LandingPage";
import BookPage from "@/pages/BookPage";
import AuthPage from "@/pages/AuthPage";
import DashboardPage from "@/pages/DashboardPage";
import AdminPage from "@/pages/AdminPage";
import UnderwriterPage from "@/pages/UnderwriterPage";
import PartnerPage from "@/pages/PartnerPage";
import WorkspaceApp from "@/workspace/WorkspaceApp";
import SiteGate from "@/components/SiteGate";
import ScrollToTop from "@/components/ScrollToTop";
import LegalPage from "@/pages/LegalPage";
import LegalDocPage from "@/pages/LegalDocPage";

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
          <ScrollToTop />
          <ThemeController />
          <BackgroundFX />
          <div style={{ position: "relative", zIndex: 1 }}>
          <SiteGate>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/book" element={<BookPage />} />
            <Route path="/auth" element={<AuthPage />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/admin" element={<AdminPage />} />
            <Route path="/underwriter" element={<UnderwriterPage />} />
            <Route path="/partner" element={<PartnerPage />} />
            <Route path="/legal" element={<LegalPage />} />
            <Route path="/legal/:slug" element={<LegalDocPage />} />
            <Route path="/workspace/*" element={<WorkspaceApp />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          </SiteGate>
          </div>
        </BrowserRouter>
        <Toaster theme="dark" position="bottom-right" toastOptions={TOAST_OPTIONS} />
      </AuthProvider>
    </div>
  );
}

export default App;
