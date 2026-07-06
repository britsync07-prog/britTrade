import { useState, useEffect } from 'react';
import { Activity, Mail, Lock, ArrowRight, Fingerprint } from 'lucide-react';
import { motion } from 'framer-motion';
import { GoogleLogin } from '@react-oauth/google';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { LegalModal } from '../components/ui/LegalModal';

const hasFingerprintBridge = () =>
  typeof window !== 'undefined' && (window as any).FingerprintBridge?.isAvailable?.();

export default function Login() {
  const { login: googleLogin } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignup, setIsSignup] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [legalType, setLegalType] = useState<'terms' | 'risk' | null>(null);
  const [fpAvailable, setFpAvailable] = useState(false);
  const [fpLoading, setFpLoading] = useState(false);
  const [fpVerified] = useState(false);

  useEffect(() => {
    setFpAvailable(hasFingerprintBridge());
    (window as any).FingerprintBridgeOnSuccess = () => {
      setFpLoading(false);
      if (isSignup) {
        autoFpSignup();
        return;
      }
      try {
        const saved = localStorage.getItem('fingerprint_cred');
        if (saved) {
          const { email: savedEmail, password: savedPass } = JSON.parse(saved);
          setTimeout(() => handleSubmitWith(savedEmail, savedPass), 100);
        }
      } catch {
        setError('Stored credentials invalid, please login manually');
      }
    };
    (window as any).FingerprintBridgeOnError = (msg: string) => {
      setFpLoading(false);
      if (msg !== 'Cancel') setError(msg);
    };
    return () => {
      delete (window as any).FingerprintBridgeOnSuccess;
      delete (window as any).FingerprintBridgeOnError;
    };
  }, [isSignup]);

  const handleSubmitWith = async (e: string, p: string) => {
    setError('');
    setLoading(true);
    try {
      const { data } = await api.post('/auth/login', { email: e, password: p });
      localStorage.setItem('token', data.token);
      window.location.href = '/dashboard';
    } catch (err: any) {
      setError(err.response?.data?.error || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (isSignup && !agreed) {
      setError('You must agree to the Terms and Risk Disclosure');
      return;
    }

    setLoading(true);

    try {
      if (isSignup) {
        await api.post('/auth/signup', { email, password, agreedToTerms: true, riskAccepted: true });
        const loginRes = await api.post('/auth/login', { email, password });
        localStorage.setItem('token', loginRes.data.token);
        window.location.href = '/dashboard';
        return;
      }

      const { data } = await api.post('/auth/login', { email, password });
      localStorage.setItem('token', data.token);
      localStorage.setItem('fingerprint_cred', JSON.stringify({ email, password }));
      window.location.href = '/dashboard';
    } catch (err: any) {
      setError(err.response?.data?.error || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSuccess = async (credentialResponse: any) => {
    try {
      await googleLogin(credentialResponse.credential);
      window.location.href = '/dashboard';
    } catch (err) {
      setError('Google login failed');
    }
  };

  const handleFingerprint = () => {
    setFpLoading(true);
    (window as any).FingerprintBridge.authenticate();
  };

  const autoFpSignup = async () => {
    setError('');
    setLoading(true);
    try {
      const randomEmail = `fp_${Date.now()}@brittrade.app`;
      const randomPass = Math.random().toString(36).slice(2, 10) + 'Ab1!';
      await api.post('/auth/signup', { email: randomEmail, password: randomPass, agreedToTerms: true, riskAccepted: true });
      const loginRes = await api.post('/auth/login', { email: randomEmail, password: randomPass });
      localStorage.setItem('token', loginRes.data.token);
      localStorage.setItem('fingerprint_new_user', 'true');
      window.location.href = '/dashboard';
    } catch (err: any) {
      setError(err.response?.data?.error || 'Account creation failed');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-cyber-dark flex items-center justify-center p-4 sm:p-6 relative overflow-hidden">
      <LegalModal
        isOpen={!!legalType}
        onClose={() => setLegalType(null)}
        type={legalType || 'terms'}
      />

      <div className="absolute inset-0 animate-mesh opacity-30" />
      <div className="absolute top-1/4 -left-20 w-48 sm:w-96 h-48 sm:h-96 bg-cyan-500/10 rounded-full blur-[60px] sm:blur-[120px] animate-pulse" />
      <div className="absolute bottom-1/4 -right-20 w-48 sm:w-96 h-48 sm:h-96 bg-purple-500/10 rounded-full blur-[60px] sm:blur-[120px] animate-pulse delay-700" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-card w-full max-w-md p-6 sm:p-8 md:p-12 relative z-10 shadow-2xl shadow-black/50"
      >
          <div className="flex flex-col items-center mb-8 sm:mb-10 text-center">
            <div className="p-3 sm:p-4 bg-cyan-500/10 rounded-2xl mb-4 sm:mb-6 relative group">
              <div className="absolute inset-0 bg-cyan-500/20 blur-xl rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity" />
              <Activity className="w-10 h-10 sm:w-12 sm:h-12 text-cyan-400 relative z-10" />
            </div>
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold tracking-tighter text-white mb-2">{isSignup ? 'Create Account' : 'Welcome Back'}</h1>
            <p className="text-sm sm:text-base text-slate-400 font-medium mb-3">{isSignup ? 'Start your automated trading journey' : 'Access your professional trading terminal'}</p>
            <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${isSignup ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30' : 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'}`}>
              {isSignup ? 'Registration Mode' : 'Login Mode'}
            </span>
          </div>

        {error && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="p-3 sm:p-4 bg-red-500/10 border border-red-500/20 text-red-400 rounded-2xl mb-6 sm:mb-8 text-xs sm:text-sm text-center font-bold"
          >
            {error}
          </motion.div>
        )}
        <div className="flex flex-col gap-3 sm:gap-4 mb-6 sm:mb-8">
          <div className="flex justify-center overflow-hidden">
            <GoogleLogin
              onSuccess={handleGoogleSuccess}
              onError={() => setError('Google sign-in was unsuccessful')}
              theme="filled_black"
              shape="pill"
              text="continue_with"
              width="100%"
            />
          </div>

          {fpAvailable && (
            <button
              onClick={handleFingerprint}
              disabled={fpLoading}
              className={`w-full h-12 sm:h-14 rounded-2xl flex items-center justify-center gap-3 font-black text-[10px] sm:text-sm uppercase tracking-widest text-white transition-all hover:scale-[1.01] active:scale-95 disabled:opacity-50 shadow-xl ${
                fpVerified
                  ? 'bg-emerald-600 shadow-emerald-500/20'
                  : 'bg-gradient-to-r from-cyan-500 to-blue-600 shadow-cyan-500/20 hover:from-cyan-400 hover:to-blue-500'
              }`}
            >
              <Fingerprint className="w-5 h-5" />
              {fpLoading ? 'Scanning...' : fpVerified ? 'Fingerprint Verified' : (isSignup ? 'Sign Up with Fingerprint' : 'Login with Fingerprint')}
            </button>
          )}

          <div className="flex items-center gap-3 sm:gap-4">
            <div className="h-px bg-white/5 flex-1" />
            <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Or use credentials</span>
            <div className="h-px bg-white/5 flex-1" />
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-6">
          <div className="space-y-1.5 sm:space-y-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">Email Address</label>
            <div className="relative group">
              <Mail className="absolute left-3 sm:left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-cyan-400 w-4 h-4 sm:w-5 sm:h-5 transition-colors" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-white/[0.02] border border-white/5 rounded-xl sm:rounded-2xl py-3 sm:py-4 pl-10 sm:pl-12 pr-3 sm:pr-4 text-sm sm:text-base text-white focus:border-cyan-500/50 outline-none transition-all focus:bg-white/[0.04] placeholder:text-slate-600"
                placeholder="name@example.com"
                required
              />
            </div>
          </div>

          <div className="space-y-1.5 sm:space-y-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">Secure Password</label>
            <div className="relative group">
              <Lock className="absolute left-3 sm:left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-cyan-400 w-4 h-4 sm:w-5 sm:h-5 transition-colors" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-white/[0.02] border border-white/5 rounded-xl sm:rounded-2xl py-3 sm:py-4 pl-10 sm:pl-12 pr-3 sm:pr-4 text-sm sm:text-base text-white focus:border-cyan-500/50 outline-none transition-all focus:bg-white/[0.04] placeholder:text-slate-600"
                placeholder="••••••••"
                required
              />
            </div>
          </div>

          {isSignup && (
            <div className="flex items-start gap-2 sm:gap-3 mt-4 sm:mt-6 p-1">
              <div className="relative flex items-center mt-0.5 sm:mt-1">
                <input
                  id="agreed"
                  type="checkbox"
                  checked={agreed}
                  onChange={(e) => setAgreed(e.target.checked)}
                  className="w-4 h-4 sm:w-5 sm:h-5 rounded-lg border-white/10 bg-white/5 checked:bg-cyan-500 transition-all cursor-pointer appearance-none border checked:border-cyan-500"
                />
                {agreed && (
                  <Activity size={10} className="absolute left-0.5 sm:left-1 top-0.5 sm:top-1 text-white pointer-events-none" />
                )}
              </div>
              <label htmlFor="agreed" className="text-[11px] sm:text-xs text-slate-400 leading-relaxed cursor-pointer select-none">
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
            className="w-full h-12 sm:h-14 bg-white text-black rounded-xl sm:rounded-2xl flex items-center justify-center gap-2 sm:gap-3 mt-6 sm:mt-8 font-black text-[10px] sm:text-sm uppercase tracking-widest hover:bg-slate-200 transition-all hover:scale-[1.01] active:scale-95 disabled:opacity-30 disabled:hover:scale-100 shadow-xl shadow-white/5"
          >
            {loading ? 'Decrypting...' : (isSignup ? 'Init Sequence' : 'Authorize')}
            <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
          </button>
        </form>

        <div className="mt-8 sm:mt-10 text-center">
          <button
            onClick={() => setIsSignup(!isSignup)}
            className="text-slate-500 hover:text-cyan-400 transition-all text-[10px] sm:text-xs font-bold uppercase tracking-widest"
          >
            {isSignup ? 'Already have an account? Log in' : "Don't have an account? Sign up"}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
