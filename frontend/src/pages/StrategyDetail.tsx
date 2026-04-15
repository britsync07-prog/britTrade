import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ChevronLeft, TrendingUp, TrendingDown, Clock, Target, Activity, Zap } from 'lucide-react';
import api from '../services/api';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { motion } from 'framer-motion';

export default function StrategyDetail() {
  const { id } = useParams();
  const [strategy, setStrategy] = useState<any>(null);
  const [subInfo, setSubInfo] = useState<any>(null);
  const [trades, setTrades] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [marketPrices, setMarketPrices] = useState<Record<string, number>>({});
  const [showSubModal, setShowSubModal] = useState(false);
  const [subType, setSubType] = useState<'signals' | 'both'>('both');
  const [capital, setCapital] = useState('1000');
  const [submitting, setSubmitting] = useState(false);
  const [signalsData, setSignalsData] = useState<any>({ signals: [] });
  const [signalsData, setSignalsData] = useState<any>({ signals: [] });

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [stratRes, subRes, userRes, signalsRes] = await Promise.all([
          api.get(`/strategies`),
          api.get('/strategies/subscribed'),
          api.get('/auth/me'),
          api.get(`/strategies/${id}/signals`)
        ]);
        
        const s = stratRes.data.find((x: any) => x.id === Number(id));
        const sub = subRes.data.find((x: any) => x.id === Number(id));

        setStrategy(s);
        setSubInfo(sub);
        setSignalsData(signalsRes.data);

        // Security Check: Verify purchase
        const planToStrat: Record<string, number[]> = {
          'low_risk': [1],
          'medium_risk': [2],
          'high_risk': [3],
          'bundle': [1, 2, 3]
        };
        const hasAccess = userRes.data?.purchasedPlans?.some((p: string) => planToStrat[p]?.includes(Number(id)));
        if (!hasAccess) {
          window.location.href = '/dashboard';
          return;
        }

        setError(null);
      } catch (e: any) {
        console.error('Terminal Data Fetch Error:', e);
        setError(e.response?.data?.message || e.message || 'Connection failed');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, [id]);

  const handleSubscribe = async () => {
    setSubmitting(true);
    try {
      await api.post('/strategies/subscribe', {
        strategyId: Number(id),
        useSignal: true,
        useVirtualBalance: false,
        allocatedBalance: 0
      });
      setShowSubModal(false);
      window.location.reload(); 
    } catch (e) {
      console.error('Subscription failed', e);
      alert('Subscription failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUnsubscribe = async () => {
    if (!confirm('Are you sure you want to stop receiving signals from this terminal?')) return;
    try {
      await api.post('/strategies/unsubscribe', { strategyId: Number(id) });
      window.location.reload();
    } catch (e) {
      console.error(e);
    }
  };

  if (loading) return (
    <div className="min-h-screen bg-[#020617] flex items-center justify-center">
      <Activity className="w-12 h-12 text-cyan-400 animate-pulse" />
    </div>
  );

  if (error || !strategy) return (
    <div className="min-h-screen bg-[#020617] flex flex-col items-center justify-center p-8 text-center">
      <div className="p-4 bg-rose-500/10 rounded-full mb-6">
        <Activity className="w-12 h-12 text-rose-400" />
      </div>
      <h2 className="text-2xl font-bold mb-2">Terminal Offline</h2>
      <p className="text-slate-400 max-w-md mb-8">{error || 'Strategy node not found or connection lost.'}</p>
      <Link to="/dashboard">
        <Button variant="outline">Back to Market</Button>
      </Link>
    </div>
  );

  const sigs = Array.isArray(signalsData) ? signalsData : (signalsData.signals || []);
  const closedSigs = sigs.filter((s:any) => s.status !== 'active');
  const winSigs = closedSigs.filter((s:any) => s.status === 'tp_hit');
  const lossSigs = closedSigs.filter((s:any) => s.status === 'sl_hit');

  return (
    <div className="min-h-screen bg-[#020617] text-slate-200 pb-20 relative overflow-hidden">
      {/* Interactive Subscription Modal */}
      {showSubModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="glass-card w-full max-w-md p-8 relative overflow-hidden shadow-2xl border-white/10">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-cyan-500 to-purple-500" />
            <h2 className="text-2xl font-bold mb-2 text-white">Enable Signals</h2>
            <p className="text-slate-400 text-sm mb-6">Start receiving premium real-time signals for {strategy.name}.</p>
            
            <div className="space-y-4 mb-8">
              <div className="w-full p-4 rounded-xl border border-cyan-500 bg-cyan-500/10 text-cyan-400 shadow-lg shadow-cyan-500/5">
                <div className="font-bold flex items-center gap-2">
                  <Zap size={16} /> Premium Signals
                </div>
                <div className="text-xs opacity-60 mt-1">Receive entry, take-profit, and stop-loss alerts via Telegram and this dashboard.</div>
              </div>
            </div>

            <div className="flex gap-3">
              <Button variant="outline" className="flex-1 rounded-xl h-11" onClick={() => setShowSubModal(false)}>Cancel</Button>
              <Button 
                onClick={handleSubscribe} 
                disabled={submitting}
                className="flex-1 bg-white text-black hover:bg-white/90 rounded-xl h-11 font-bold"
              >
                {submitting ? 'Connecting...' : 'Deploy Now'}
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 md:px-8 pt-12 space-y-8 relative z-10">
        <Link to="/dashboard" className="inline-flex items-center gap-2 text-slate-500 hover:text-white transition-colors group mb-4">
          <ChevronLeft size={20} className="group-hover:-translate-x-1 transition-transform" /> 
          <span className="text-sm font-medium">Market Overview</span>
        </Link>

        <header className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-8">
          <div>
            <h1 className="text-4xl md:text-5xl font-bold tracking-tighter mb-2 group leading-tight">
              <span className="bg-gradient-to-r from-cyan-400 via-white to-purple-400 bg-clip-text text-transparent">{strategy.name}</span>
            </h1>
            <div className="flex items-center gap-3">
              <Badge variant="outline" className="bg-cyan-500/10 text-cyan-400 border-cyan-400/20 px-3 py-0.5 rounded-lg text-[10px] font-bold">
                {strategy.type.toUpperCase()}
              </Badge>
              <div className="flex items-center gap-1.5 text-slate-500 text-xs font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Live Signal Mining Enabled
              </div>
            </div>
            <p className="text-slate-400 max-w-2xl mt-6 leading-relaxed text-sm">
              {strategy?.description || "High-performance automated trading strategy utilizing advanced deep learning models for predictive market analysis."}
            </p>
          </div>

          <div className="flex flex-wrap gap-4 w-full lg:w-auto">
            {!subInfo ? (
              <Button 
                onClick={() => setShowSubModal(true)}
                className="bg-white text-black hover:bg-white/90 rounded-2xl px-8 h-12 font-bold group/btn flex-grow lg:flex-grow-0 shadow-lg shadow-white/5"
              >
                Initialize Signal Node
                <Zap className="ml-2 w-4 h-4 fill-current group-hover/btn:scale-110 transition-transform" />
              </Button>
            ) : (
              <div className="flex flex-wrap items-center gap-4 w-full lg:w-auto">
                <div className="grid grid-cols-2 gap-3 flex-grow lg:flex-grow-0">
                  <div className="bg-emerald-500/5 border border-emerald-500/10 rounded-2xl p-4 text-center min-w-[120px] backdrop-blur-md">
                    <div className="text-[10px] uppercase font-bold text-slate-500 tracking-widest mb-1.5">Hit Profit</div>
                    <div className="text-2xl font-black text-emerald-400">{winSigs.length}</div>
                    <div className="text-[9px] text-slate-500 font-bold uppercase tracking-tighter">Wins</div>
                  </div>
                  <div className="bg-rose-500/5 border border-rose-500/10 rounded-2xl p-4 text-center min-w-[120px] backdrop-blur-md">
                    <div className="text-[10px] uppercase font-bold text-slate-500 tracking-widest mb-1.5">Hit Loss</div>
                    <div className="text-2xl font-black text-rose-400">{lossSigs.length}</div>
                    <div className="text-[9px] text-slate-500 font-bold uppercase tracking-tighter">Loss</div>
                  </div>
                </div>
                <Button 
                  variant="outline" 
                  onClick={handleUnsubscribe}
                  className="border-white/10 hover:bg-rose-500/10 hover:text-rose-400 hover:border-rose-500/20 rounded-2xl h-14 px-6 transition-all"
                >
                  Disconnect Node
                </Button>
              </div>
            )}
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 mb-12">
          <Card className="lg:col-span-3 bg-slate-900/40 border-white/5 backdrop-blur-sm p-0 rounded-3xl overflow-hidden shadow-2xl relative">
            <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/5 via-transparent to-purple-500/5 pointer-events-none" />
            <div className="p-6 border-b border-white/5 flex flex-row items-center justify-between relative z-10">
               <h3 className="text-lg font-bold flex items-center gap-2 text-white">
                 <Activity className="text-cyan-400" size={20} />
                 Market Flow Analysis
               </h3>
               <div className="flex items-center gap-2">
                 <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                 <span className="text-[10px] text-slate-400 uppercase font-black tracking-widest">Real-time Stream</span>
               </div>
            </div>
            <div className="h-[400px] p-0 relative">
               <div className="absolute inset-0 flex items-center justify-center bg-slate-900/40 backdrop-blur-[2px] z-10">
                  <div className="text-center group">
                    <div className="p-4 bg-cyan-500/10 rounded-full mb-4 group-hover:scale-110 transition-transform inline-block">
                      <Zap className="text-cyan-400 animate-pulse" size={32} />
                    </div>
                    <p className="text-slate-400 text-sm font-medium">Synchronizing market signals...</p>
                  </div>
               </div>
            </div>
          </Card>

          <div className="space-y-6">
            <Card className="bg-slate-900/40 border-white/5 backdrop-blur-sm rounded-3xl p-6">
              <div className="text-[11px] text-slate-500 uppercase font-bold tracking-widest mb-4">Node Health</div>
              <div className="space-y-4">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-400">Latency</span>
                  <span className="text-emerald-400 font-mono font-bold">14ms</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-400">Signal Sync</span>
                  <span className="text-emerald-400 font-mono font-bold">100%</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-400">Uptime</span>
                  <span className="text-cyan-400 font-bold text-[10px] uppercase">99.9%</span>
                </div>
              </div>
            </Card>

            <Card className="bg-slate-900/40 border-white/5 backdrop-blur-sm rounded-3xl p-6 relative overflow-hidden group min-h-[160px] flex flex-col justify-center">
              <div className="absolute -right-4 -bottom-4 opacity-5 group-hover:scale-110 transition-transform duration-700">
                <TrendingUp size={120} />
              </div>
              <div className="text-[11px] text-slate-500 uppercase font-bold tracking-widest mb-4">Total Signals</div>
              <div className="text-4xl font-black tracking-tighter text-white">
                {sigs.length}
              </div>
              <p className="text-[10px] text-slate-500 mt-2">Historical and active alerts.</p>
            </Card>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-8">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <Card className="bg-slate-900/40 border-white/5 overflow-hidden shadow-2xl relative">
              <div className="p-6 border-b border-white/5 flex flex-row justify-between items-center bg-white/[0.02]">
                <h3 className="text-xl font-bold flex items-center gap-3 text-white">
                  <Target size={20} className="text-cyan-400" /> Signal Terminal
                </h3>
              </div>
              <div className="p-6">
                {signalsData.locked ? (
                  <div className="p-12 text-center rounded-2xl bg-white/[0.02] border border-white/5 space-y-4">
                     <div className="inline-flex items-center justify-center p-4 bg-purple-500/10 rounded-full mb-2">
                       <Zap className="text-purple-400" size={32} />
                     </div>
                     <h4 className="text-xl font-bold">Premium Signals Locked</h4>
                     <p className="text-slate-400 text-sm max-w-sm mx-auto">Update your plan to unlock detailed entry, take profit, and stop loss signals for this node.</p>
                     <Link to="/">
                       <Button className="mt-4 bg-purple-600 hover:bg-purple-700">Upgrade Access</Button>
                     </Link>
                  </div>
                ) : (
                  <div className="space-y-6">
                     {/* Performance Stats */}
                     <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-2">
                        <div className="p-4 bg-white/[0.03] border border-white/5 rounded-2xl">
                          <div className="text-[9px] text-slate-500 uppercase font-black tracking-widest mb-1">Signal Win Rate</div>
                          <div className="text-xl font-bold text-emerald-400">
                            {closedSigs.length > 0 ? `${((winSigs.length / closedSigs.length) * 100).toFixed(0)}%` : '0%'}
                          </div>
                        </div>
                        <div className="p-4 bg-white/[0.03] border border-white/5 rounded-2xl">
                          <div className="text-[9px] text-slate-500 uppercase font-black tracking-widest mb-1">Total Signals</div>
                          <div className="text-xl font-bold text-white">{sigs.length}</div>
                        </div>
                        <div className="p-4 bg-white/[0.03] border border-white/5 rounded-2xl">
                          <div className="text-[9px] text-slate-500 uppercase font-black tracking-widest mb-1">Avg Signal PnL</div>
                          <div className="text-xl font-bold text-purple-400">
                            {(() => {
                              const avg = closedSigs.length > 0 ? closedSigs.reduce((acc:number, s:any) => acc + s.pnl, 0) / closedSigs.length : 0;
                              return `+${avg.toFixed(2)}%`;
                            })()}
                          </div>
                        </div>
                        <div className="p-4 bg-white/[0.03] border border-white/5 rounded-2xl">
                          <div className="text-[9px] text-slate-500 uppercase font-black tracking-widest mb-1">Active Signals</div>
                          <div className="text-xl font-bold text-cyan-400">{sigs.filter((s:any) => s.status === 'active').length}</div>
                        </div>
                     </div>

                     {/* Signal List */}
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {sigs.map((s: any) => (
                          <div key={s.id} className={`p-5 rounded-2xl border transition-all ${s.status === 'active' ? 'bg-white/[0.03] border-white/10 hover:border-purple-500/50' : 'bg-black/20 border-white/5 opacity-80'}`}>
                             <div className="flex justify-between items-start mb-4">
                                <div>
                                   <div className="text-xs font-mono text-slate-500 mb-1">{new Date(s.timestamp).toLocaleString()}</div>
                                   <div className="flex items-center gap-2">
                                      <span className="text-lg font-black text-white">{s.symbol}</span>
                                      <Badge className={`text-[9px] ${s.side === 'buy' || s.side === 'long' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
                                        {s.side.toUpperCase()}
                                      </Badge>
                                   </div>
                                </div>
                                <div className="text-right">
                                   <div className={`text-[10px] font-bold uppercase tracking-widest mb-1 ${s.status === 'tp_hit' ? 'text-emerald-400' : s.status === 'sl_hit' ? 'text-rose-400' : 'text-cyan-400 animate-pulse'}`}>
                                      {s.status.replace('_', ' ')}
                                   </div>
                                   <div className="text-xs font-mono font-bold text-white">${s.price.toFixed(4)}</div>
                                </div>
                             </div>

                             <div className="grid grid-cols-3 gap-2 py-3 border-y border-white/5 mb-3 bg-white/[0.01]">
                                <div className="text-center">
                                   <div className="text-[8px] text-slate-500 uppercase font-bold mb-1">Target TP</div>
                                   <div className="text-xs font-mono text-emerald-400 font-bold">${s.tp?.toFixed(4) || '---'}</div>
                                </div>
                                <div className="text-center border-x border-white/5">
                                   <div className="text-[8px] text-slate-500 uppercase font-bold mb-1">Stop Loss</div>
                                   <div className="text-xs font-mono text-rose-400 font-bold">${s.sl?.toFixed(4) || '---'}</div>
                                </div>
                                <div className="text-center">
                                   <div className="text-[8px] text-slate-500 uppercase font-bold mb-1">Signal PnL</div>
                                   <div className={`text-xs font-mono font-bold ${s.pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                      {s.pnl >= 0 ? '+' : ''}{s.pnl.toFixed(2)}%
                                   </div>
                                </div>
                             </div>
                             
                             <div className="flex items-center justify-between gap-2">
                                <div className="text-[10px] text-slate-500 italic">Recommended Stake: ${s.stakeAmount || 100}</div>
                                {s.status === 'active' && (
                                  <Badge className="bg-purple-500/20 text-purple-400 border-none px-2 py-0.5 text-[9px]">ACTIONABLE NOW</Badge>
                                )}
                             </div>
                          </div>
                        ))}
                        {sigs.length === 0 && (
                          <div className="col-span-2 py-12 text-center text-slate-500 text-sm italic">Scanning markets for high-probability signals...</div>
                        )}
                     </div>
                  </div>
                )}
              </div>
            </Card>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
