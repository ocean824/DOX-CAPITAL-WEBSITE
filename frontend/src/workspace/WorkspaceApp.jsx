import { Routes, Route, Navigate, Link } from 'react-router-dom';
import { ArrowRight, ShieldAlert } from 'lucide-react';
import { AuthProvider, useAuth } from './lib/auth';
import { Shell } from './components/Shell';
import Dashboard from './pages/Dashboard';
import Transactions from './pages/Transactions';
import TransactionDetail from './pages/TransactionDetail';
import Contacts from './pages/Contacts';
import Tasks from './pages/Tasks';
import Reviews from './pages/Reviews';
import Messages from './pages/Messages';
import Inbox from './pages/Inbox';
import Assistant from './pages/Assistant';
import Settings from './pages/Settings';
import Integrations from './pages/Integrations';
import Knowledge from './pages/Knowledge';
import Calendar from './pages/Calendar';
import './workspace.css';

const Gate = ({ title, body, cta, to }) => (
  <div className="workspace ws-gate" data-testid="workspace-gate">
    <ShieldAlert size={30} strokeWidth={1.3} />
    <span className="brand-serif">D.O.X</span>
    <h1>{title}</h1>
    <p>{body}</p>
    <Link className="btn" to={to} data-testid="workspace-gate-cta">{cta}<ArrowRight size={15} /></Link>
  </div>
);

function Protected() {
  const { user, loading, denied } = useAuth();
  if (loading) return <div className="workspace boot" data-testid="workspace-loading"><span className="brand-serif">D.O.X</span><span className="loading-line" /></div>;
  if (denied) return <Gate title="Workspace access pending" body={denied} cta="Back to your portal" to="/dashboard" />;
  if (!user) return <Gate title="Sign in to continue" body="The D.O.X Workspace uses your thedoxs.com account." cta="Sign in" to="/auth?next=/workspace" />;
  if (user.role === 'CLIENT') return <Navigate to="/dashboard" replace />;
  return <Shell />;
}

const Staff = ({ children }) => {
  const { user } = useAuth();
  return user.role === 'CLIENT' ? <Navigate to="/workspace" replace /> : children;
};
const Owner = ({ children }) => {
  const { user } = useAuth();
  return user.role === 'OWNER' ? children : <Navigate to="/workspace" replace />;
};

export default function WorkspaceApp() {
  return (
    <AuthProvider>
      <Routes>
        <Route element={<Protected />}>
          <Route index element={<Dashboard />} />
          <Route path="transactions" element={<Transactions />} />
          <Route path="transactions/:id" element={<TransactionDetail />} />
          <Route path="contacts" element={<Staff><Contacts /></Staff>} />
          <Route path="tasks" element={<Staff><Tasks /></Staff>} />
          <Route path="reviews" element={<Staff><Reviews /></Staff>} />
          <Route path="messages" element={<Messages />} />
          <Route path="inbox" element={<Staff><Inbox /></Staff>} />
          <Route path="assistant" element={<Staff><Assistant /></Staff>} />
          <Route path="knowledge" element={<Staff><Knowledge /></Staff>} />
          <Route path="calendar" element={<Calendar />} />
          <Route path="settings" element={<Settings />} />
          <Route path="integrations" element={<Owner><Integrations /></Owner>} />
        </Route>
        <Route path="*" element={<Navigate to="/workspace" replace />} />
      </Routes>
    </AuthProvider>
  );
}
