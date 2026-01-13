import { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import RegistryView from './pages/RegistryView';
import Ledger from './pages/Ledger';
import Sidebar from './components/Sidebar';
import { Toaster } from 'sonner';

// Protected Route Component
const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const token = localStorage.getItem('token'); // or use your auth context/state
  const navigate = useNavigate();

  useEffect(() => {
    if (!token) {
      navigate('/login');
    }
  }, [token, navigate]);

  return token ? <>{children}</> : null;
};

// Handle Google Auth Callback
const AuthCallback = () => {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const token = params.get('token');

    if (token) {
      localStorage.setItem('token', token);
      navigate('/', { replace: true }); // replace history to avoid back-button issues
    } else {
      navigate('/login');
    }
  }, [location, navigate]);

  return <div className="flex items-center justify-center h-screen bg-[#f0f4f9] text-[#2D384A] font-bold">Loading...</div>;
};

// Layout wrapper to conditionally show Sidebar
const AppLayout = ({ children }: { children: React.ReactNode }) => {
  const location = useLocation();
  const isLoginPage = location.pathname === '/login';
  const isAuthCallbackPage = location.pathname === '/auth/callback';
  const showSidebar = !isLoginPage && !isAuthCallbackPage;

  return (
    <div className={`flex bg-[#f0f4f9] ${showSidebar ? 'flex-row' : ''}`}>
      {showSidebar && <Sidebar />}
      <main className={`flex-1 ${showSidebar ? 'ml-[88px] p-6 mx-auto w-full' : ''}`}>
        {children}
      </main>
      <Toaster position="top-right" />
    </div>
  );
};

function App() {
  return (
    <Router>
      <AppLayout>
        <div className="font-sans text-[#2D384A]">
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/auth/callback" element={<AuthCallback />} />

            {/* Protected routes */}
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <Dashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/registry/:id"
              element={
                <ProtectedRoute>
                  <RegistryView />
                </ProtectedRoute>
              }
            />
            <Route
              path="/ledger"
              element={
                <ProtectedRoute>
                  <Ledger />
                </ProtectedRoute>
              }
            />
            <Route
              path="/settings"
              element={
                <ProtectedRoute>
                  <div className="p-12 text-center text-slate-400 font-bold uppercase tracking-widest">Settings Module Not Implemented</div>
                </ProtectedRoute>
              }
            />
          </Routes>
        </div>
      </AppLayout>
    </Router>
  );
}

export default App;