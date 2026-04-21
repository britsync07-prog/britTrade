import { useState } from 'react';
import { Activity, Mail, Lock, ArrowRight } from 'lucide-react';
import { motion } from 'framer-motion';
import api from '../services/api';
import { LegalModal } from '../components/ui/LegalModal';

interface LoginProps {
  onLogin: (user: any) => void;
}

export default function Login({ onLogin }: LoginProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignup, setIsSignup] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [legalType, setLegalType] = useState<'terms' | 'risk' | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    if (isSignup && !agreed) {
      setError('You must agree to the Terms and Risk Disclosure');
      return;
    }

    setLoading(true);

    try {
      const endpoint = isSignup ? '/auth/signup' : '/auth/login';
      const payload = isSignup 
        ? { email, password, agreedToTerms: true, riskAccepted: true } 
        : { email, password };
        
      const res = await api.post(endpoint, payload);
      localStorage.setItem('token', res.data.token);
      onLogin(res.data.user);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-cyber-dark flex items-center justify-center p-6 relative overflow-hidden">
      <LegalModal 
        isOpen={!!legalType} 
        onClose={() => setLegalType(null)} 
        type={legalType || 'terms'} 
      />

      {/* Premium Background Elements */}
      <div className="absolute inset-0 animate-mesh opacity-30" />
      <div className="absolute top-1/4 -left-20 w-96 h-96 bg-cyan-500/10 rounded-full blur-[120px] animate-pulse" />
      <div className="absolute bottom-1/4 -right-20 w-96 h-96 bg-purple-500/10 rounded-full blur-[120px] animate-pulse delay-700" />
      
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-card w-full max-w-md p-8 md:p-12 relative z-10 shadow-2xl shadow-black/50"
      >
        <div className="flex flex-col items-center mb-10 text-center">
          <div className="p-4 bg-cyan-500/10 rounded-2xl mb-6 relative group">
            <div className="absolute inset-0 bg-cyan-500/20 blur-xl rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity" />
            <Activity className="w-12 h-12 text-cyan-400 relative z-10" />
          </div>
          <h1 className="text-4xl font-bold tracking-tighter text-white mb-2">{isSignup ? 'Create Account' : 'Welcome Back'}</h1>
          <p className="text-slate-400 font-medium">{isSignup ? 'Start your automated trading journey' : 'Access your professional trading terminal'}</p>
        </div>

        {error && (
          <motion.div 
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="p-4 bg-red-500/10 border border-red-500/20 text-red-400 rounded-2xl mb-8 text-sm text-center font-bold"
          >
            {error}
          </motion.div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">Email Address</label>
            <div className="relative group">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-cyan-400 w-5 h-5 transition-colors" />
              <input 
                type="email" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-white/[0.02] border border-white/5 rounded-2xl py-4 pl-12 pr-4 text-white focus:border-cyan-500/50 outline-none transition-all focus:bg-white/[0.04] placeholder:text-slate-600"
                placeholder="name@example.com"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">Secure Password</label>
            <div className="relative group">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-cyan-400 w-5 h-5 transition-colors" />
              <input 
                type="password" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-white/[0.02] border border-white/5 rounded-2xl py-4 pl-12 pr-4 text-white focus:border-cyan-500/50 outline-none transition-all focus:bg-white/[0.04] placeholder:text-slate-600"
                placeholder="••••••••"
                required
              />
            </div>
          </div>

          {isSignup && (
            <div className="flex items-start gap-3 mt-6 p-1">
              <div className="relative flex items-center mt-1">
                <input
                  id="agreed"
                  type="checkbox"
                  checked={agreed}
                  onChange={(e) => setAgreed(e.target.checked)}
                  className="w-5 h-5 rounded-lg border-white/10 bg-white/5 checked:bg-cyan-500 transition-all cursor-pointer appearance-none border checked:border-cyan-500"
                />
                {agreed && (
                  <Activity size={12} className="absolute left-1 top-1 text-white pointer-events-none" />
                )}
              </div>
              <label htmlFor="agreed" className="text-xs text-slate-400 leading-relaxed cursor-pointer select-none">
                I agree to the{' '}
                <button 
                  type="button"
                  onClick={() => setLegalType('terms')}
                  className="text-cyan-400 hover:text-cyan-300 font-bold underline-offset-4 hover:underline"
                >
                  Terms & Conditions
                </button>
                {' '}and{' '}
                <button 
                  type="button"
                  onClick={() => setLegalType('risk')}
                  className="text-red-400 hover:text-red-300 font-bold underline-offset-4 hover:underline"
                >
                  Risk Disclosure
                </button>
              </label>
            </div>
          )}

          <button 
            type="submit" 
            disabled={loading || (isSignup && !agreed)}
            className="w-full h-14 bg-white text-black rounded-2xl flex items-center justify-center gap-3 mt-8 font-black text-sm uppercase tracking-widest hover:bg-slate-200 transition-all hover:scale-[1.01] active:scale-95 disabled:opacity-30 disabled:hover:scale-100 shadow-xl shadow-white/5"
          >
            {loading ? 'Decrypting...' : (isSignup ? 'Init Sequence' : 'Authorize')}
            <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
          </button>
        </form>

        <div className="mt-10 text-center">
          <button 
            onClick={() => setIsSignup(!isSignup)}
            className="text-slate-500 hover:text-cyan-400 transition-all text-xs font-bold uppercase tracking-widest"
          >
            {isSignup ? 'Already have an account? Log in' : "Don't have an account? Sign up"}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

