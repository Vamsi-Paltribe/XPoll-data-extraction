import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Ledger from './pages/Ledger';
import UserDetail from './pages/UserDetail';
import ManageData from './pages/ManageData';
import AdminLayout from './components/AdminLayout';
import CreateAdmin from './pages/CreateAdmin';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function App() {
  const isAuthenticated = !!window.localStorage.getItem('token');

  return (
    <QueryClientProvider client={queryClient}>
      <Router>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/"
            element={isAuthenticated ? <AdminLayout><Dashboard /></AdminLayout> : <Navigate to="/login" />}
          />
          <Route
            path="/user/:id"
            element={isAuthenticated ? <AdminLayout><UserDetail /></AdminLayout> : <Navigate to="/login" />}
          />
          <Route
            path="/ledger"
            element={isAuthenticated ? <AdminLayout><Ledger /></AdminLayout> : <Navigate to="/login" />}
          />
          <Route
            path="/manage"
            element={isAuthenticated ? <AdminLayout><ManageData /></AdminLayout> : <Navigate to="/login" />}
          />
          <Route
            path="/create-admin"
            element={isAuthenticated ? <AdminLayout><CreateAdmin /></AdminLayout> : <Navigate to="/login" />}
          />
        </Routes>
      </Router>
    </QueryClientProvider>
  );
}

export default App;

