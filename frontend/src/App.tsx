import { BrowserRouter as Router, Routes, Route, Navigate, Link } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { Activity, LayoutDashboard, LogOut } from 'lucide-react';
import api from './services/api';

import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import StrategyDetail from './pages/StrategyDetail';

function App() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const hydrateUser = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) throw new Error('No token');
      const res = await api.get('/auth/me');
      setUser(res.data);
    } catch (e) {
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    hydrateUser();
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('token');
    setUser(null);
  };

  if (loading) return <div className="loading-screen">
    <Activity className="w-12 h-12 text-primary animate-pulse" />
    <span>Initializing BRITTRADE Terminal...</span>
  </div>;

  return (
    <Router>
      <div className="min-h-screen bg-bg-dark text-text-main overflow-x-hidden">
        {user && (
          <nav>
            <div className="nav-logo flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Activity className="text-primary w-6 h-6" />
              </div>
              <span className="text-xl font-bold tracking-tight">BRIT<span className="text-gradient">TRADE</span></span>
            </div>
            <div className="nav-links flex gap-8 items-center font-medium">
              <Link to="/" className="flex items-center gap-2 hover:text-primary transition-all text-sm uppercase tracking-widest">
                <LayoutDashboard size={18} /> Dashboard
              </Link>
              <button onClick={handleLogout} className="flex items-center gap-2 text-text-dim hover:text-red-400 transition-all text-sm uppercase tracking-widest">
                <LogOut size={18} /> Logout
              </button>
            </div>
          </nav>
        )}

        <main className="container">
          <Routes>
            <Route path="/login" element={!user ? <Login onLogin={setUser} /> : <Navigate to="/" />} />
            <Route path="/" element={user ? <Dashboard /> : <Navigate to="/login" />} />
            <Route path="/strategy/:id" element={user ? <StrategyDetail /> : <Navigate to="/login" />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;
