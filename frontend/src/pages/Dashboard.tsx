import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Activity, Zap, TrendingUp, BarChart, LogOut, ShieldAlert, Send, ArrowRight, Power, PowerOff, Fingerprint, Lock, Mail, X } from 'lucide-react';
import api from '../services/api';
import { Button } from '@/components/ui/button';
import { motion, AnimatePresence } from 'framer-motion';

import { useAuth } from '../context/AuthContext';

const hasFingerprintBridge = () =>
  typeof window !== 'undefined' && (window as any).FingerprintBridge?.isAvailable?.();

export default function Dashboard() {
  const { logout } = useAuth();
  const [strategies, setStrategies] = useState<any[]>([]);
  const [subscribed, setSubscribed] = useState<any[]>([]);
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [liveStatus, setLiveStatus] = useState<{ configured: boolean; enabled: boolean; testnet: boolean; apiKeyMasked?: string | null } | null>(null);
  const [liveBusy, setLiveBusy] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [testnetMode, setTestnetMode] = useState(true);
  const [showFpPopup, setShowFpPopup] = useState(false);
  const [showFpSettings, setShowFpSettings] = useState(false);
  const [fpEmail, setFpEmail] = useState('');
  const [fpPassword, setFpPassword] = useState('');
  const [fpBusy, setFpBusy] = useState(false);
  const [fpDismissed, setFpDismissed] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        console.log('[Dashboard] Fetching stats...');
        const [stratsRes, subRes, userRes] = await Promise.all([
          api.get('/strategies').catch(err => { console.error('Strats fetch failed', err); throw err; }),
          api.get('/strategies/subscribed').catch(err => { console.error('Subscribed fetch failed', err); throw err; }),
          api.get('/auth/me').catch(err => { console.error('User fetch failed', err); throw err; })
        ]);
        
        console.log('[Dashboard] Strats:', stratsRes.data);
        console.log('[Dashboard] Subscribed:', subRes.data);
        
        setStrategies(Array.isArray(stratsRes.data) ? stratsRes.data : []);
        setSubscribed(Array.isArray(subRes.data) ? subRes.data : []);
        setUser(userRes.data);
        const liveRes = await api.get('/live-trading/status');
        setLiveStatus(liveRes.data);
      } catch (e: any) {
        console.error('Error fetching dashboard data:', e);
        setError(e.message || 'Failed to connect to server');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  useEffect(() => {
    if (!loading && user && hasFingerprintBridge() && localStorage.getItem('fingerprint_new_user') === 'true' && !fpDismissed) {
      const timer = setTimeout(() => setShowFpPopup(true), 2000);
      return () => clearTimeout(timer);
    }
  }, [loading, user, fpDismissed]);

  useEffect(() => {
    if (user?.email && !fpEmail) setFpEmail(user.email);
  }, [user]);

  const handleFpSave = async () => {
    if (!fpEmail || !fpPassword) return;
    setFpBusy(true);
    localStorage.setItem('fingerprint_cred', JSON.stringify({ email: fpEmail, password: fpPassword }));
    try {
      await api.post('/auth/signup', { email: fpEmail, password: fpPassword, agreedToTerms: true, riskAccepted: true });
      const { data } = await api.post('/auth/login', { email: fpEmail, password: fpPassword });
      localStorage.setItem('token', data.token);
    } catch {
      try { await api.post('/auth/credentials', { email: fpEmail, password: fpPassword }); } catch {}
    }
    localStorage.removeItem('fingerprint_new_user');
    setShowFpPopup(false);
    setShowFpSettings(false);
    setFpBusy(false);
  };

  if (loading) return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4">
      <Activity className="w-12 h-12 text-cyan-400 animate-pulse" />
      <div className="text-slate-400 animate-pulse">Establishing Secure Connection...</div>
    </div>
  );

  if (error) return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center gap-6 px-4">
      <div className="p-6 bg-red-500/10 border border-red-500/20 rounded-3xl text-center max-w-md">
        <h2 className="text-xl font-bold text-red-500 mb-2">Connection Offline</h2>
        <p className="text-slate-400 mb-6">{error}</p>
        <Button onClick={() => window.location.reload()} variant="outline" className="border-red-500/20 text-red-400 hover:bg-red-500/10">
          Retry Connection
        </Button>
      </div>
    </div>
  );

  const totalSignals = strategies.reduce((sum, strat) => sum + Number(strat.signalCount || 0), 0);
  const totalClosedSignals = strategies.reduce((sum, strat) => sum + Number(strat.closedSignalCount || 0), 0);
  const weightedWins = strategies.reduce((sum, strat) => {
    const closed = Number(strat.closedSignalCount || 0);
    const winRate = Number(strat.winRate || 0);
    return sum + ((winRate / 100) * closed);
  }, 0);
  const dashboardWinRate = totalClosedSignals > 0 ? `${((weightedWins / totalClosedSignals) * 100).toFixed(1)}%` : '0.0%';

  const handleLiveToggle = async () => {
    if (!liveStatus || !liveStatus.configured || liveBusy) return;
    setLiveBusy(true);
    try {
      const res = await api.post('/live-trading/toggle', { enabled: !liveStatus.enabled });
      setLiveStatus({ ...liveStatus, enabled: !!res.data?.enabled });
    } catch (e: any) {
      alert(e?.response?.data?.error || 'Failed to toggle live trading');
    } finally {
      setLiveBusy(false);
    }
  };

  const handleSaveLiveConfig = async () => {
    if (!apiKey || !apiSecret) {
      alert('Please provide Binance API key and secret');
      return;
    }
    setLiveBusy(true);
    try {
      await api.post('/live-trading/config', { apiKey, apiSecret, testnet: testnetMode });
      const liveRes = await api.get('/live-trading/status');
      setLiveStatus(liveRes.data);
      setApiKey('');
      setApiSecret('');
    } catch (e: any) {
      alert(e?.response?.data?.error || 'Failed to save Binance credentials');
    } finally {
      setLiveBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-cyber-dark text-slate-200 pb-16 sm:pb-20 relative overflow-hidden">
      {/* Background Ambience */}
      <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-cyan-500/5 rounded-full blur-[120px] -z-10" />
      <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-purple-500/5 rounded-full blur-[120px] -z-10" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-8 sm:pt-12 space-y-8 sm:space-y-12 relative z-10">
        <header className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 sm:gap-8">
          <div className="space-y-1 sm:space-y-2">
            <div className="flex items-center gap-2 sm:gap-3 mb-1 sm:mb-2">
              <div className="w-1.5 sm:w-2 h-1.5 sm:h-2 rounded-full bg-cyan-400 animate-pulse shadow-[0_0_10px_rgba(34,211,238,0.5)]" />
              <span className="text-[8px] sm:text-[10px] font-black uppercase tracking-[0.2em] text-cyan-400/80">Systems Operational</span>
            </div>
            <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-black tracking-tighter text-white">
              Signal <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-purple-400">Terminals</span>
            </h1>
            <p className="text-sm sm:text-base lg:text-lg text-slate-400 font-medium max-w-xl">Monitor and deploy advanced AI mining strategies across global crypto markets.</p>
          </div>

          <div className="flex flex-wrap gap-2 sm:gap-4 w-full sm:w-auto">
             <div className="glass-card px-3 sm:px-6 py-3 sm:py-4 flex items-center gap-2 sm:gap-4 hover:border-cyan-500/30 transition-all cursor-pointer group" onClick={() => window.open('https://t.me/BritSyncAI_bot', '_blank')}>
                <div className="w-8 sm:w-12 h-8 sm:h-12 rounded-xl sm:rounded-2xl bg-cyan-500/10 flex items-center justify-center group-hover:bg-cyan-500/20 transition-colors">
                  <Send className="text-cyan-400 w-4 h-4 sm:w-6 sm:h-6" />
                </div>
                <div className="hidden sm:block">
                   <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Live Alerts</div>
                   <div className="text-lg font-bold text-white">Telegram Bot</div>
                </div>
             </div>

             <Link to="/live-trading" className="glass-card px-3 sm:px-6 py-3 sm:py-4 flex items-center gap-2 sm:gap-4 border-emerald-500/20 hover:border-emerald-500/40 transition-all cursor-pointer group">
                <div className="w-8 sm:w-12 h-8 sm:h-12 rounded-xl sm:rounded-2xl bg-emerald-500/10 flex items-center justify-center group-hover:bg-emerald-500/20 transition-colors">
                  <Power className="text-emerald-400 w-4 h-4 sm:w-6 sm:h-6" />
                </div>
                <div className="hidden sm:block">
                   <div className="text-[10px] font-black uppercase tracking-widest text-emerald-500/70">User Panel</div>
                   <div className="text-lg font-bold text-white">Live Trading</div>
                </div>
             </Link>

             {user?.role === 'admin' && (
               <div className="glass-card px-3 sm:px-6 py-3 sm:py-4 flex items-center gap-2 sm:gap-4 border-red-500/20 hover:border-red-500/40 transition-all cursor-pointer group" onClick={() => window.location.href = '/admin'}>
                  <div className="w-8 sm:w-12 h-8 sm:h-12 rounded-xl sm:rounded-2xl bg-red-500/10 flex items-center justify-center group-hover:bg-red-500/20 transition-colors">
                    <ShieldAlert className="text-red-500 w-4 h-4 sm:w-6 sm:h-6" />
                  </div>
                  <div className="hidden sm:block">
                     <div className="text-[10px] font-black uppercase tracking-widest text-red-500/50">Admin Only</div>
                     <div className="text-lg font-bold text-white">Command</div>
                  </div>
               </div>
             )}

             {hasFingerprintBridge() && (localStorage.getItem('fingerprint_cred') || localStorage.getItem('fingerprint_new_user') === 'true') && (
                <div className="glass-card p-2 sm:p-4 hover:bg-cyan-500/5 hover:border-cyan-500/20 transition-all cursor-pointer relative group" onClick={() => {
                  (window as any).FingerprintBridgeOnSuccess = () => setShowFpSettings(true);
                  (window as any).FingerprintBridgeOnError = (msg: string) => { if (msg !== 'Cancel') alert(msg); };
                  (window as any).FingerprintBridge.authenticate();
                }}>
                  <Fingerprint className="text-cyan-400 w-4 h-4 sm:w-6 sm:h-6 transition-colors" />
                   <span className="absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-1 bg-slate-800 text-[8px] font-black uppercase tracking-widest text-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap shadow-xl">
                     {localStorage.getItem('fingerprint_cred') ? 'Fingerprint Settings' : 'Set Up Fingerprint'}
                   </span>
                </div>
              )}
             <div className="glass-card p-2 sm:p-4 hover:bg-rose-500/5 hover:border-rose-500/20 transition-all cursor-pointer" onClick={() => logout()}>
                <LogOut className="text-slate-500 hover:text-rose-400 w-4 h-4 sm:w-6 sm:h-6 transition-colors" />
             </div>
          </div>
        </header>

        {liveStatus && (
          <div className="glass-card px-4 sm:px-6 py-4 sm:py-5 space-y-3 sm:space-y-4 border-white/10">
            <div className="flex flex-wrap items-center justify-between gap-3 sm:gap-4">
              <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              <span className={`w-1.5 sm:w-2 h-1.5 sm:h-2 rounded-full ${liveStatus.enabled ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`} />
              <div className="text-xs sm:text-sm font-bold text-white">
                Live Trading: {liveStatus.enabled ? 'ON' : 'OFF'}
              </div>
              {liveStatus.testnet && (
                <span className="text-[8px] sm:text-[10px] font-black uppercase tracking-widest px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-full bg-yellow-500/10 border border-yellow-500/20 text-yellow-400">Testnet</span>
              )}
              {liveStatus.configured && liveStatus.apiKeyMasked && (
                <span className="text-[9px] sm:text-[11px] text-slate-400 truncate max-w-[100px] sm:max-w-none">Key: {liveStatus.apiKeyMasked}</span>
              )}
            </div>
            <button
              onClick={handleLiveToggle}
              disabled={!liveStatus.configured || liveBusy}
              className={`px-3 sm:px-5 h-9 sm:h-11 rounded-xl text-[8px] sm:text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-1 sm:gap-2 border ${
                liveStatus.enabled
                  ? 'bg-red-500/10 text-red-400 border-red-500/20 hover:bg-red-500/20'
                  : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20'
              } disabled:opacity-50`}
            >
              {liveStatus.enabled ? <><PowerOff size={12} className="sm:w-[14px] sm:h-[14px]" /> Disable</> : <><Power size={12} className="sm:w-[14px] sm:h-[14px]" /> Enable</>}
            </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Your Binance API Key"
                className="lg:col-span-1 bg-white/5 border border-white/10 rounded-xl px-4 h-11 text-white text-sm placeholder:text-slate-500"
              />
              <input
                type="password"
                value={apiSecret}
                onChange={(e) => setApiSecret(e.target.value)}
                placeholder="Your Binance API Secret"
                className="lg:col-span-1 bg-white/5 border border-white/10 rounded-xl px-4 h-11 text-white text-sm placeholder:text-slate-500"
              />
              <button
                type="button"
                onClick={() => setTestnetMode(v => !v)}
                className={`lg:col-span-1 h-11 rounded-xl text-xs font-black uppercase tracking-widest border ${testnetMode ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'}`}
              >
                {testnetMode ? 'Testnet' : 'Live (Real Money)'}
              </button>
              <button
                type="button"
                onClick={handleSaveLiveConfig}
                disabled={liveBusy}
                className="lg:col-span-1 h-11 rounded-xl text-xs font-black uppercase tracking-widest border bg-cyan-500/20 text-cyan-300 border-cyan-500/30 disabled:opacity-50"
              >
                Save API Keys
              </button>
            </div>
            <div className="pt-1">
              <Link to="/live-trading" className="inline-flex items-center gap-2 text-cyan-300 hover:text-cyan-200 text-xs font-black uppercase tracking-widest">
                Open Full Live Trading Dashboard <ArrowRight size={14} />
              </Link>
            </div>
          </div>
        )}

        {/* Global Stats Overview */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <QuickStat title="Active Nodes" value={strategies.length} icon={Activity} color="text-cyan-400" />
          <QuickStat title="Signal Win Rate" value={dashboardWinRate} icon={Zap} color="text-yellow-400" />
          <QuickStat title="Total Signals" value={totalSignals.toLocaleString()} icon={TrendingUp} color="text-emerald-400" />
          <QuickStat title="User Status" value={user?.role?.toUpperCase() || 'PRO'} icon={ShieldAlert} color="text-purple-400" />
        </div>

      {strategies.length === 0 ? (
        <div className="py-20 text-center border border-dashed border-white/10 rounded-3xl">
          <div className="text-xl text-slate-500">No active strategies found in database.</div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-8">
          {strategies.map((strat, idx) => {
            const isSubscribed = Array.isArray(subscribed) && subscribed.some(s => s.id === strat.id);
            const Icon = strat.name.includes('Futures') ? Zap : (strat.name.includes('Grid') ? BarChart : TrendingUp);
            
            return (
              <motion.div
                key={strat.id}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: idx * 0.1 }}
                className="group relative"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/10 to-purple-500/10 opacity-0 group-hover:opacity-100 blur-2xl transition-opacity -z-10" />
                <div className="glass-card p-5 sm:p-8 h-full flex flex-col hover:border-white/20 transition-all duration-500">
                  <div className="flex justify-between items-start mb-5 sm:mb-8">
                    <div className="p-3 sm:p-4 bg-white/5 rounded-xl sm:rounded-2xl group-hover:bg-cyan-500/10 transition-colors group-hover:scale-110 duration-500">
                      <Icon className="text-slate-400 group-hover:text-cyan-400 w-6 h-6 sm:w-8 sm:h-8" />
                    </div>
                    {isSubscribed && (
                      <div className="flex items-center gap-1 sm:gap-2 px-2 sm:px-3 py-0.5 sm:py-1 bg-emerald-500/10 rounded-full border border-emerald-500/20">
                        <div className="w-1 sm:w-1.5 h-1 sm:h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        <span className="text-[8px] sm:text-[10px] font-black uppercase tracking-widest text-emerald-400">Deployed</span>
                      </div>
                    )}
                  </div>

                  <div className="flex-grow">
                     <h3 className="text-xl sm:text-2xl font-black tracking-tighter text-white mb-2 sm:mb-3 group-hover:text-cyan-400 transition-colors">{strat.name}</h3>
                     <p className="text-xs sm:text-sm text-slate-400 leading-relaxed mb-5 sm:mb-8">
                        {strat.description || "Sophisticated AI mining node observing recursive market patterns to generate high-probability entry targets."}
                     </p>

                     <div className="grid grid-cols-3 gap-2 sm:gap-4 py-4 sm:py-6 border-y border-white/5 mb-4 sm:mb-6">
                        <div>
                           <div className="text-[7px] sm:text-[8px] font-black uppercase tracking-widest text-slate-500 mb-0.5 sm:mb-1">Risk Tier</div>
                           <div className={`text-[10px] sm:text-xs font-bold ${strat.risk === 'High' ? 'text-red-400' : 'text-cyan-400'}`}>{strat.risk || 'Medium'}</div>
                        </div>
                        <div className="border-x border-white/5 px-1 sm:px-2">
                           <div className="text-[8px] sm:text-[10px] text-gray-500 uppercase tracking-wider font-semibold">24H RETURN</div>
                           <div className={`text-[10px] sm:text-xs font-bold ${Number(strat.pnl24h || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                              {Number(strat.pnl24h || 0) >= 0 ? '+' : ''}{Number(strat.pnl24h || 0).toFixed(2)}%
                           </div>
                        </div>
                        <div className="text-right">
                           <div className="text-[7px] sm:text-[8px] font-black uppercase tracking-widest text-slate-500 mb-0.5 sm:mb-1">Pairs</div>
                           <div className="text-[10px] sm:text-xs font-bold text-slate-300">{Number(strat.pairCount || 0)} Scanned</div>
                        </div>
                     </div>

                     <div className="mb-5 sm:mb-8 p-3 sm:p-4 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between group-hover:border-white/20 transition-all">
                        <div className="pr-2">
                           <div className="text-[8px] sm:text-[10px] font-black uppercase tracking-widest text-slate-400 mb-0.5 sm:mb-1">Return from Daily $100</div>
                           <div className="text-[9px] sm:text-xs text-slate-500 font-medium">Based on 24h simulated paper trades</div>
                        </div>
                        <div className={`text-base sm:text-xl font-black tracking-tighter whitespace-nowrap ${Number(strat.prof24h || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                           {Number(strat.prof24h || 0) >= 0 ? '+$' : '-$'}{Math.abs(Number(strat.prof24h || 0)).toFixed(2)}
                        </div>
                     </div>
                  </div>

                  {(() => {
                    const planToStrat: Record<string, number[]> = {
                      'low_risk': [1],
                      'medium_risk': [2],
                      'high_risk': [3],
                      'bundle': [1, 2, 3]
                    };
                    const hasAccess = user?.purchasedPlans?.some((p: string) => planToStrat[p]?.includes(strat.id));
                    
                    const handlePurchase = async (stratId: number) => {
                      try {
                        const stratToPlan: Record<number, string> = {
                          1: 'low_risk',
                          2: 'medium_risk',
                          3: 'high_risk'
                        };
                        const planId = stratToPlan[stratId];
                        if (!planId) return;

                        const { data } = await api.post('/payments/create-session', { planId });
                        if (data.url) {
                          window.location.href = data.url;
                        }
                      } catch (e: any) {
                        console.error('Purchase failed', e);
                        alert(e.response?.data?.error || 'Failed to initiate purchase');
                      }
                    };

                    if (hasAccess) {
                      return (
                        <div className="flex gap-1 sm:gap-2">
                          <Link to={`/strategy/${strat.id}`} className="block flex-1">
                            <button className="w-full h-10 sm:h-14 glass-card bg-white text-black hover:bg-slate-200 transition-all font-black text-[8px] sm:text-xs uppercase tracking-[0.2em] flex items-center justify-center gap-1 sm:gap-2 rounded-xl sm:rounded-2xl">
                               Terminal <ArrowRight size={12} className="sm:w-4 sm:h-4" />
                            </button>
                          </Link>
                          <Link to={`/strategy/${strat.id}?tab=history`} className="block flex-1">
                            <button className="w-full h-10 sm:h-14 glass-card hover:bg-white/5 transition-all text-slate-300 font-black text-[8px] sm:text-xs uppercase tracking-[0.2em] flex items-center justify-center gap-1 sm:gap-2 rounded-xl sm:rounded-2xl">
                               History
                            </button>
                          </Link>
                        </div>
                      );
                    } else {
                      return (
                        <div className="flex gap-1 sm:gap-2">
                          <div className="block flex-1">
                            <button 
                              onClick={() => handlePurchase(strat.id)}
                              className="w-full h-10 sm:h-14 bg-cyan-500 hover:bg-cyan-600 text-white transition-all rounded-xl font-black text-[8px] sm:text-xs uppercase tracking-[0.2em] flex items-center justify-center gap-1 sm:gap-2 shadow-lg shadow-cyan-500/20"
                            >
                               Purchase <Zap size={12} className="sm:w-4 sm:h-4" />
                            </button>
                          </div>
                          <Link to={`/strategy/${strat.id}?preview=true`} className="block flex-1">
                            <button className="w-full h-10 sm:h-14 glass-card hover:bg-white/5 transition-all text-slate-300 font-black text-[8px] sm:text-xs uppercase tracking-[0.2em] flex items-center justify-center gap-1 sm:gap-2 rounded-xl border-white/10">
                               History
                            </button>
                          </Link>
                        </div>
                      );
                    }
                  })()}
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Fingerprint Setup Popup */}
      <AnimatePresence>
        {showFpPopup && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100]"
              onClick={() => {}}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[90%] max-w-md z-[101]"
            >
              <div className="glass-card p-8 border border-cyan-500/30 shadow-2xl shadow-cyan-500/10">
                <div className="flex items-center gap-3 mb-6">
                  <Fingerprint className="w-6 h-6 text-cyan-400" />
                  <h2 className="text-xl font-bold tracking-tight text-white">Set Up Fingerprint Login</h2>
                </div>
                <p className="text-sm text-slate-400 mb-6">Save your credentials for quick fingerprint login next time.</p>
                <div className="space-y-4">
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 w-4 h-4" />
                    <input
                      type="email"
                      value={fpEmail}
                      onChange={(e) => setFpEmail(e.target.value)}
                      placeholder="Email"
                      className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-sm text-white placeholder:text-slate-600 focus:border-cyan-500/50 outline-none"
                    />
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 w-4 h-4" />
                    <input
                      type="password"
                      value={fpPassword}
                      onChange={(e) => setFpPassword(e.target.value)}
                      placeholder="Password"
                      className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-sm text-white placeholder:text-slate-600 focus:border-cyan-500/50 outline-none"
                    />
                  </div>
                </div>
                <div className="flex gap-3 mt-6">
                  <button
                    onClick={handleFpSave}
                    disabled={fpBusy || !fpEmail || !fpPassword}
                    className="flex-1 h-12 bg-gradient-to-r from-cyan-500 to-blue-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:from-cyan-400 hover:to-blue-500 transition-all disabled:opacity-50 shadow-xl shadow-cyan-500/20"
                  >
                    {fpBusy ? 'Saving...' : 'Save'}
                  </button>
                  <button
                    onClick={() => { localStorage.removeItem('fingerprint_new_user'); setShowFpPopup(false); setFpDismissed(true); }}
                    className="px-6 h-12 glass-card text-slate-400 rounded-2xl font-black text-xs uppercase tracking-widest hover:text-white transition-all"
                  >
                    Later
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Fingerprint Settings Modal */}
      <AnimatePresence>
        {showFpSettings && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100]"
              onClick={() => setShowFpSettings(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[90%] max-w-md z-[101]"
            >
              <div className="glass-card p-8 border border-cyan-500/30 shadow-2xl shadow-cyan-500/10">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <Fingerprint className="w-6 h-6 text-cyan-400" />
                    <h2 className="text-xl font-bold tracking-tight text-white">Security Settings</h2>
                  </div>
                  <button onClick={() => setShowFpSettings(false)} className="p-2 hover:bg-white/5 rounded-full transition-colors text-slate-400 hover:text-white">
                    <X size={20} />
                  </button>
                </div>
                <p className="text-sm text-slate-400 mb-6">Update your fingerprint saved credentials.</p>
                <div className="space-y-4">
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 w-4 h-4" />
                    <input
                      type="email"
                      value={fpEmail}
                      onChange={(e) => setFpEmail(e.target.value)}
                      placeholder="Email"
                      className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-sm text-white placeholder:text-slate-600 focus:border-cyan-500/50 outline-none"
                    />
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 w-4 h-4" />
                    <input
                      type="password"
                      value={fpPassword}
                      onChange={(e) => setFpPassword(e.target.value)}
                      placeholder="Password"
                      className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-sm text-white placeholder:text-slate-600 focus:border-cyan-500/50 outline-none"
                    />
                  </div>
                </div>
                <button
                  onClick={handleFpSave}
                  disabled={fpBusy || !fpEmail || !fpPassword}
                  className="w-full h-12 bg-gradient-to-r from-cyan-500 to-blue-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:from-cyan-400 hover:to-blue-500 transition-all mt-6 disabled:opacity-50 shadow-xl shadow-cyan-500/20"
                >
                  {fpBusy ? 'Saving...' : 'Update Credentials'}
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  </div>
 );
}

function QuickStat({ title, value, icon: Icon, color }: any) {
  return (
    <div className="glass-card p-4 sm:p-6 group hover:border-white/20 transition-all relative overflow-hidden">
      <div className="absolute -right-4 -bottom-4 opacity-5 group-hover:opacity-10 group-hover:scale-110 transition-all duration-500">
        <Icon size={60} className="sm:w-[80px] sm:h-[80px]" />
      </div>
      <div className="relative z-10">
        <div className="text-[8px] sm:text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-0.5 sm:mb-1">{title}</div>
        <div className={`text-xl sm:text-3xl font-black tracking-tighter ${color}`}>{value}</div>
      </div>
    </div>
  );
}
