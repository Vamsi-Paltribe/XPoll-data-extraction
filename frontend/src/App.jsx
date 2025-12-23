import { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import RegistryView from './pages/RegistryView';
import Ledger from './pages/Ledger';
import Layout from './components/Layout';

// Protected Route Component
const ProtectedRoute = ({ children }) => {
  const token = localStorage.getItem('token'); // or use your auth context/state
  const navigate = useNavigate();

  useEffect(() => {
    if (!token) {
      navigate('/login');
    }
  }, [token, navigate]);

  return token ? children : null;
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

  return <div className="flex items-center justify-center h-screen">Loading...</div>;
};

function App() {
  return (
    <Router>
      <div className="min-h-screen bg-background text-slate-900 font-sans">
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/auth/callback" element={<AuthCallback />} />

          {/* Protected routes */}
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Layout>
                  <Dashboard />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/registry/:id"
            element={
              <ProtectedRoute>
                <Layout>
                  <RegistryView />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/ledger"
            element={
              <ProtectedRoute>
                <Layout>
                  <Ledger />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/settings"
            element={
              <ProtectedRoute>
                <Layout>
                  <div className="p-8">Settings (Not Implemented)</div>
                </Layout>
              </ProtectedRoute>
            }
          />
        </Routes>
      </div>
    </Router>
  );
}

export default App;