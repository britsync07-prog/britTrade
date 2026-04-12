import { useState } from 'react';
import { Activity, Mail, Lock, ArrowRight } from 'lucide-react';
import api from '../services/api';

interface LoginProps {
  onLogin: (user: any) => void;
}

export default function Login({ onLogin }: LoginProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignup, setIsSignup] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const endpoint = isSignup ? '/auth/signup' : '/auth/login';
      const res = await api.post(endpoint, { email, password });
      localStorage.setItem('token', res.data.token);
      onLogin(res.data.user);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container flex flex-col items-center justify-center min-h-[80vh]">
      <div className="glass-card w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          <div className="p-4 bg-primary/10 rounded-2xl mb-4">
            <Activity className="w-12 h-12 text-primary" />
          </div>
          <h1 className="text-3xl font-bold">{isSignup ? 'Create Account' : 'Welcome Back'}</h1>
          <p className="text-text-dim mt-2">{isSignup ? 'Start your automated trading journey' : 'Access your trading dashboard'}</p>
        </div>

        {error && <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl mb-6 text-sm text-center">{error}</div>}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-text-dim ml-1">Email Address</label>
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-text-dim w-5 h-5" />
              <input 
                type="email" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-bg-dark/50 border border-border-glass rounded-xl py-3 pl-12 pr-4 focus:border-primary outline-none transition-all"
                placeholder="name@example.com"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-text-dim ml-1">Password</label>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-text-dim w-5 h-5" />
              <input 
                type="password" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-bg-dark/50 border border-border-glass rounded-xl py-3 pl-12 pr-4 focus:border-primary outline-none transition-all"
                placeholder="••••••••"
                required
              />
            </div>
          </div>

          <button 
            type="submit" 
            disabled={loading}
            className="btn-primary w-full flex items-center justify-center gap-2 mt-4"
          >
            {loading ? 'Processing...' : (isSignup ? 'Sign Up' : 'Log In')}
            <ArrowRight size={18} />
          </button>
        </form>

        <div className="mt-8 text-center">
          <button 
            onClick={() => setIsSignup(!isSignup)}
            className="text-primary hover:text-white transition-colors text-sm font-medium"
          >
            {isSignup ? 'Already have an account? Log in' : "Don't have an account? Sign up"}
          </button>
        </div>
      </div>
    </div>
  );
}
