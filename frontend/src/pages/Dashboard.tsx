import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Activity, Zap, TrendingUp, BarChart, LogOut, ShieldAlert, Send, ArrowRight } from 'lucide-react';
import api from '../services/api';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';

import { useAuth } from '../context/AuthContext';


export default function Dashboard() {
  const { logout } = useAuth();
  const [strategies, setStrategies] = useState<any[]>([]);
  const [subscribed, setSubscribed] = useState<any[]>([]);
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
      } catch (e: any) {
        console.error('Error fetching dashboard data:', e);
        setError(e.message || 'Failed to connect to server');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

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

  return (
    <div className="min-h-screen bg-cyber-dark text-slate-200 pb-20 relative overflow-hidden">
      {/* Background Ambience */}
      <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-cyan-500/5 rounded-full blur-[120px] -z-10" />
      <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-purple-500/5 rounded-full blur-[120px] -z-10" />

      <div className="max-w-7xl mx-auto px-6 pt-12 space-y-12 relative z-10">
        <header className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-8">
          <div className="space-y-2">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse shadow-[0_0_10px_rgba(34,211,238,0.5)]" />
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-400/80">Systems Operational</span>
            </div>
            <h1 className="text-5xl lg:text-6xl font-black tracking-tighter text-white">
              Signal <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-purple-400">Terminals</span>
            </h1>
            <p className="text-slate-400 text-lg font-medium max-w-xl">Monitor and deploy advanced AI mining strategies across global crypto markets.</p>
          </div>

          <div className="flex flex-wrap gap-4">
             <div className="glass-card px-6 py-4 flex items-center gap-4 hover:border-cyan-500/30 transition-all cursor-pointer group" onClick={() => window.open('https://t.me/BritSyncAI_bot', '_blank')}>
                <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 flex items-center justify-center group-hover:bg-cyan-500/20 transition-colors">
                  <Send className="text-cyan-400 w-6 h-6" />
                </div>
                <div>
                   <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Live Alerts</div>
                   <div className="text-lg font-bold text-white">Telegram Bot</div>
                </div>
             </div>

             {user?.role === 'admin' && (
               <div className="glass-card px-6 py-4 flex items-center gap-4 border-red-500/20 hover:border-red-500/40 transition-all cursor-pointer group" onClick={() => window.location.href = '/admin'}>
                  <div className="w-12 h-12 rounded-2xl bg-red-500/10 flex items-center justify-center group-hover:bg-red-500/20 transition-colors">
                    <ShieldAlert className="text-red-500 w-6 h-6" />
                  </div>
                  <div>
                     <div className="text-[10px] font-black uppercase tracking-widest text-red-500/50">Admin Only</div>
                     <div className="text-lg font-bold text-white">Command</div>
                  </div>
               </div>
             )}

             <div className="glass-card p-4 hover:bg-rose-500/5 hover:border-rose-500/20 transition-all cursor-pointer" onClick={() => logout()}>
                <LogOut className="text-slate-500 hover:text-rose-400 w-6 h-6 transition-colors" />
             </div>
          </div>
        </header>

        {/* Global Stats Overview */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
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
                <div className="glass-card p-8 h-full flex flex-col hover:border-white/20 transition-all duration-500">
                  <div className="flex justify-between items-start mb-8">
                    <div className="p-4 bg-white/5 rounded-2xl group-hover:bg-cyan-500/10 transition-colors group-hover:scale-110 duration-500">
                      <Icon className="text-slate-400 group-hover:text-cyan-400 w-8 h-8" />
                    </div>
                    {isSubscribed && (
                      <div className="flex items-center gap-2 px-3 py-1 bg-emerald-500/10 rounded-full border border-emerald-500/20">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        <span className="text-[10px] font-black uppercase tracking-widest text-emerald-400">Deployed</span>
                      </div>
                    )}
                  </div>

                  <div className="flex-grow">
                     <h3 className="text-2xl font-black tracking-tighter text-white mb-3 group-hover:text-cyan-400 transition-colors">{strat.name}</h3>
                     <p className="text-slate-400 text-sm leading-relaxed mb-8">
                        {strat.description || "Sophisticated AI mining node observing recursive market patterns to generate high-probability entry targets."}
                     </p>

                     <div className="grid grid-cols-3 gap-4 py-6 border-y border-white/5 mb-6">
                        <div>
                           <div className="text-[8px] font-black uppercase tracking-widest text-slate-500 mb-1">Risk Tier</div>
                           <div className={`text-xs font-bold ${strat.risk === 'High' ? 'text-red-400' : 'text-cyan-400'}`}>{strat.risk || 'Medium'}</div>
                        </div>
                        <div className="border-x border-white/5 px-2">
                           <div className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">24H RETURN</div>
                           <div className={`text-xs font-bold ${Number(strat.pnl24h || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                              {Number(strat.pnl24h || 0) >= 0 ? '+' : ''}{Number(strat.pnl24h || 0).toFixed(2)}%
                           </div>
                        </div>
                        <div className="text-right">
                           <div className="text-[8px] font-black uppercase tracking-widest text-slate-500 mb-1">Pairs</div>
                           <div className="text-xs font-bold text-slate-300">{Number(strat.pairCount || 0)} Scanned</div>
                        </div>
                     </div>

                     <div className="mb-8 p-4 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between group-hover:border-white/20 transition-all">
                        <div>
                           <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Return from Daily $100</div>
                           <div className="text-xs text-slate-500 font-medium">Based on 24h simulated paper trades</div>
                        </div>
                        <div className={`text-xl font-black tracking-tighter ${Number(strat.prof24h || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
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
                        <div className="flex gap-2">
                          <Link to={`/strategy/${strat.id}`} className="block flex-1">
                            <button className="w-full h-14 glass-card bg-white text-black hover:bg-slate-200 transition-all font-black text-xs uppercase tracking-[0.2em] flex items-center justify-center gap-2">
                               Terminal <ArrowRight size={16} />
                            </button>
                          </Link>
                          <Link to={`/strategy/${strat.id}?tab=history`} className="block flex-1">
                            <button className="w-full h-14 glass-card hover:bg-white/5 transition-all text-slate-300 font-black text-xs uppercase tracking-[0.2em] flex items-center justify-center gap-2 rounded-xl">
                               History
                            </button>
                          </Link>
                        </div>
                      );
                    } else {
                      return (
                        <div className="flex gap-2">
                          <div className="block flex-1">
                            <button 
                              onClick={() => handlePurchase(strat.id)}
                              className="w-full h-14 bg-cyan-500 hover:bg-cyan-600 text-white transition-all rounded-xl font-black text-xs uppercase tracking-[0.2em] flex items-center justify-center gap-2 shadow-lg shadow-cyan-500/20"
                            >
                               Purchase <Zap size={16} />
                            </button>
                          </div>
                          <Link to={`/strategy/${strat.id}?preview=true`} className="block flex-1">
                            <button className="w-full h-14 glass-card hover:bg-white/5 transition-all text-slate-300 font-black text-xs uppercase tracking-[0.2em] flex items-center justify-center gap-2 rounded-xl border-white/10">
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
    </div>
  </div>
 );
}

function QuickStat({ title, value, icon: Icon, color }: any) {
  return (
    <div className="glass-card p-6 group hover:border-white/20 transition-all relative overflow-hidden">
      <div className="absolute -right-4 -bottom-4 opacity-5 group-hover:opacity-10 group-hover:scale-110 transition-all duration-500">
        <Icon size={80} />
      </div>
      <div className="relative z-10">
        <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-1">{title}</div>
        <div className={`text-3xl font-black tracking-tighter ${color}`}>{value}</div>
      </div>
    </div>
  );
}
