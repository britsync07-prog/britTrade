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
  const [activeTab, setActiveTab] = useState<'trades' | 'signals'>('trades');

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [stratRes, subRes, tradesRes, userRes, signalsRes] = await Promise.all([
          api.get(`/strategies`),
          api.get('/strategies/subscribed'),
          api.get('/portfolio/history'),
          api.get('/auth/me'),
          api.get(`/strategies/${id}/signals`)
        ]);
        
        const s = stratRes.data.find((x: any) => x.id === Number(id));
        const sub = subRes.data.find((x: any) => x.id === Number(id));
        const t = tradesRes.data.filter((x: any) => x.strategyId === Number(id));

        setStrategy(s);
        setSubInfo(sub);
        setTrades(t);
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

        // Fetch market prices for live positions
        try {
          const marketRes = await api.get('/market/summary');
          const prices: Record<string, number> = {};
          marketRes.data.forEach((m: any) => {
            prices[m.symbol] = m.price;
          });
          setMarketPrices(prices);
        } catch (me) {
          console.warn('Market summary fetch failed', me);
        }
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
        useVirtualBalance: subType === 'both',
        allocatedBalance: subType === 'both' ? Number(capital) : 0
      });
      setShowSubModal(false);
      window.location.reload(); // Refresh to update subInfo
    } catch (e) {
      console.error('Subscription failed', e);
      alert('Subscription failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUnsubscribe = async () => {
    if (!confirm('Are you sure you want to stop this terminal? All open positions will be closed in simulation.')) return;
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

  const liveTrades = trades.filter(t => t.status === 'open');
  const pastTrades = trades.filter(t => t.status === 'closed');
  const winTrades = pastTrades.filter(t => t.pnl > 0);
  const lossTrades = pastTrades.filter(t => t.pnl <= 0);
  const totalPnl = pastTrades.reduce((acc, t) => acc + t.pnl, 0);

  return (
    <div className="min-h-screen bg-[#020617] text-slate-200 pb-20 relative overflow-hidden">
      {/* Interactive Subscription Modal */}
      {showSubModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="glass-card w-full max-w-md p-8 relative overflow-hidden shadow-2xl border-white/10">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-cyan-500 to-purple-500" />
            <h2 className="text-2xl font-bold mb-2 text-white">Connect Terminal</h2>
            <p className="text-slate-400 text-sm mb-6">Select your operational mode for {strategy.name}.</p>
            
            <div className="space-y-4 mb-8">
              <button 
                onClick={() => setSubType('signals')}
                className={`w-full p-4 rounded-xl border transition-all text-left ${subType === 'signals' ? 'bg-cyan-500/10 border-cyan-500 text-cyan-400 shadow-lg shadow-cyan-500/5' : 'bg-white/5 border-white/10 hover:border-white/20'}`}
              >
                <div className="font-bold flex items-center gap-2">
                  <Zap size={16} /> Signals Only
                </div>
                <div className="text-xs opacity-60 mt-1">Receive Telegram alerts only. No simulated trading.</div>
              </button>
              
              <button 
                onClick={() => setSubType('both')}
                className={`w-full p-4 rounded-xl border transition-all text-left ${subType === 'both' ? 'bg-purple-500/10 border-purple-500 text-purple-400 shadow-lg shadow-purple-500/5' : 'bg-white/5 border-white/10 hover:border-white/20'}`}
              >
                <div className="font-bold flex items-center gap-2">
                  <Activity size={16} /> Paper Trading + Signals
                </div>
                <div className="text-xs opacity-60 mt-1">Full simulation with initial capital tracking.</div>
              </button>

              {subType === 'both' && (
                <div className="animate-in slide-in-from-top-2 duration-300">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-500 ml-1">Initial Capital (USDT)</label>
                  <input 
                    type="number"
                    value={capital}
                    onChange={(e) => setCapital(e.target.value)}
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 mt-1 outline-none focus:border-purple-500 transition-colors font-mono font-bold text-white text-center"
                    placeholder="e.g. 1000"
                  />
                </div>
              )}
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
                Live Market Node Sync Enabled
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
                Initialize Terminal
                <Zap className="ml-2 w-4 h-4 fill-current group-hover/btn:scale-110 transition-transform" />
              </Button>
            ) : (
              <div className="flex flex-wrap items-center gap-4 w-full lg:w-auto">
                <div className="grid grid-cols-3 gap-3 flex-grow lg:flex-grow-0">
                  <div className="bg-white/5 border border-white/10 rounded-2xl p-4 text-center min-w-[120px] backdrop-blur-md">
                    <div className="text-[10px] uppercase font-bold text-slate-500 tracking-widest mb-1.5">Live Positions</div>
                    <div className="text-2xl font-black text-white">{liveTrades.length}</div>
                    <div className="text-[9px] text-cyan-400 font-bold uppercase tracking-tighter">Open</div>
                  </div>
                  <div className="bg-emerald-500/5 border border-emerald-500/10 rounded-2xl p-4 text-center min-w-[120px] backdrop-blur-md">
                    <div className="text-[10px] uppercase font-bold text-slate-500 tracking-widest mb-1.5">Hit Profit</div>
                    <div className="text-2xl font-black text-emerald-400">{winTrades.length}</div>
                    <div className="text-[9px] text-slate-500 font-bold uppercase tracking-tighter">Wins</div>
                  </div>
                  <div className="bg-rose-500/5 border border-rose-500/10 rounded-2xl p-4 text-center min-w-[120px] backdrop-blur-md">
                    <div className="text-[10px] uppercase font-bold text-slate-500 tracking-widest mb-1.5">Hit Loss</div>
                    <div className="text-2xl font-black text-rose-400">{lossTrades.length}</div>
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
                 Terminal Execution Flow
               </h3>
               {subInfo && (
                 <div className="flex items-center gap-6">
                    <div className="text-right">
                      <div className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">Available</div>
                      <div className="text-base font-bold text-emerald-400 font-mono">${subInfo.allocatedBalance.toFixed(2)}</div>
                    </div>
                    <div className="h-8 w-px bg-white/10" />
                    <div className="text-right">
                      <div className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">Initial Cap</div>
                      <div className="text-base font-bold text-slate-300 font-mono">
                        ${subInfo.initialAllocation?.toFixed(2) || subInfo.allocatedBalance.toFixed(2)}
                      </div>
                    </div>
                 </div>
               )}
            </div>
            <div className="h-[400px] p-0 relative">
               <div className="absolute inset-0 flex items-center justify-center bg-slate-900/40 backdrop-blur-[2px] z-10">
                  <div className="text-center group">
                    <div className="p-4 bg-cyan-500/10 rounded-full mb-4 group-hover:scale-110 transition-transform inline-block">
                      <Zap className="text-cyan-400 animate-pulse" size={32} />
                    </div>
                    <p className="text-slate-400 text-sm font-medium">Synchronizing live market flow...</p>
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
                  <span className="text-slate-400">Node Sync</span>
                  <span className="text-emerald-400 font-mono font-bold">100%</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-400">Mode</span>
                  <span className="text-cyan-400 font-bold text-[10px] uppercase">{subInfo?.useVirtualBalance ? 'Paper' : 'Live'}</span>
                </div>
              </div>
            </Card>

            <Card className="bg-slate-900/40 border-white/5 backdrop-blur-sm rounded-3xl p-6 relative overflow-hidden group min-h-[160px] flex flex-col justify-center">
              <div className="absolute -right-4 -bottom-4 opacity-5 group-hover:scale-110 transition-transform duration-700">
                <TrendingUp size={120} />
              </div>
              <div className="text-[11px] text-slate-500 uppercase font-bold tracking-widest mb-4">Realized Profit</div>
              <div className={`text-4xl font-black tracking-tighter ${totalPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {totalPnl >= 0 ? '+' : ''}${totalPnl.toFixed(2)}
              </div>
              <p className="text-[10px] text-slate-500 mt-2">Cumulative realized performance.</p>
            </Card>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-8">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
              <Card className="bg-slate-900/40 border-white/5 overflow-hidden shadow-2xl relative">
                <div className="p-6 border-b border-white/5 flex flex-row justify-between items-center bg-white/[0.02]">
                  <h3 className="text-xl font-bold flex items-center gap-3 text-white">
                    <Target size={20} className="text-cyan-400" /> Active Operations
                  </h3>
                  <div className="flex bg-white/5 p-1 rounded-xl border border-white/5">
                    <button 
                      onClick={() => setActiveTab('trades')}
                      className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${activeTab === 'trades' ? 'bg-cyan-500 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
                    >
                      Trade History
                    </button>
                    <button 
                      onClick={() => setActiveTab('signals')}
                      className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${activeTab === 'signals' ? 'bg-purple-500 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
                    >
                      Live Signals
                    </button>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  {activeTab === 'trades' ? (
                    <table className="w-full text-left">
                      <thead>
                        <tr className="text-[10px] text-slate-500 uppercase font-bold border-b border-white/5">
                          <th className="px-6 py-4">Symbol</th>
                          <th className="px-6 py-4">Side</th>
                          <th className="px-6 py-4 text-center">Entry / Live</th>
                          <th className="px-6 py-4 text-center">Qty</th>
                          <th className="px-6 py-4 text-right">PnL (%)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {trades.length === 0 ? (
                          <tr><td colSpan={5} className="px-6 py-16 text-center text-slate-500 text-sm italic">No operation history. Scanning markets...</td></tr>
                        ) : (
                          trades.slice().reverse().map(t => (
                            <tr key={t.id} className="hover:bg-white/[0.03] transition-colors group">
                              <td className="px-6 py-5 font-bold text-white group-hover:text-cyan-400 transition-colors uppercase tracking-tight">
                                {t.symbol}
                                {t.status === 'closed' && <span className="ml-2 text-[8px] opacity-40 uppercase font-black tracking-tighter">History</span>}
                              </td>
                              <td className="px-6 py-5">
                                <div className="flex flex-col gap-1">
                                  <Badge variant="outline" className={`text-[10px] w-fit border-none ${t.side === 'buy' || t.side === 'long' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
                                    {t.side.toUpperCase()}
                                  </Badge>
                                  <Badge variant="outline" className={`text-[8px] w-fit border-none ${t.status === 'open' ? 'bg-cyan-500/10 text-cyan-400' : 'bg-slate-500/10 text-slate-400'}`}>
                                    {t.status.toUpperCase()}
                                  </Badge>
                                </div>
                              </td>
                              <td className="px-6 py-5 text-center">
                                <div className="font-mono text-xs text-slate-300">{t.price.toFixed(4)}</div>
                                {t.status === 'open' && (
                                  <div className="font-mono text-[10px] text-cyan-400/60 mt-0.5">${marketPrices[t.symbol]?.toFixed(4) || '---'}</div>
                                )}
                              </td>
                              <td className="px-6 py-5 text-center font-mono text-xs text-slate-300">{t.amount.toFixed(4)}</td>
                              <td className="px-6 py-5 text-right">
                                {(() => {
                                  if (t.status === 'closed') {
                                    return (
                                      <div className={`font-bold ${t.pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                        <div className="text-sm font-mono">{t.pnl >= 0 ? '+' : ''}${t.pnl.toFixed(4)}</div>
                                        <div className="text-[10px] opacity-70 font-mono">Realized</div>
                                      </div>
                                    );
                                  }
                                  
                                  const currentPrice = marketPrices[t.symbol] || t.price;
                                  const isLong = t.side === 'buy' || t.side === 'long';
                                  const pnlVal = isLong ? (currentPrice - t.price) * t.amount : (t.price - currentPrice) * t.amount;
                                  const pnlPct = ((currentPrice - t.price) / t.price) * 100 * (isLong ? 1 : -1);
                                  
                                  return (
                                    <div className={`font-bold ${pnlVal >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                      <div className="text-sm font-mono">{pnlVal >= 0 ? '+' : ''}${pnlVal.toFixed(4)}</div>
                                      <div className="text-[10px] opacity-70 font-mono">{pnlVal >= 0 ? '+' : ''}{pnlPct.toFixed(2)}%</div>
                                    </div>
                                  );
                                })()}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  ) : (
                    <div className="p-6">
                      {signalsData.locked ? (
                        <div className="p-12 text-center rounded-2xl bg-white/[0.02] border border-white/5 space-y-4">
                           <div className="inline-flex items-center justify-center p-4 bg-purple-500/10 rounded-full mb-2">
                             <Zap className="text-purple-400" size={32} />
                           </div>
                           <h4 className="text-xl font-bold">Premium Signals Locked</h4>
                           <p className="text-slate-400 text-sm max-w-sm mx-auto">Subscribe to the {strategy.risk} Risk plan to unlock detailed entry, take profit, and stop loss signals for this node.</p>
                           <Link to="/">
                             <Button className="mt-4 bg-purple-600 hover:bg-purple-700">Upgrade Access</Button>
                           </Link>
                        </div>
                      ) : (
                        <div className="space-y-6">
                           {/* Performance Stats */}
                           <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-2">
                              <div className="p-4 bg-white/[0.03] border border-white/5 rounded-2xl">
                                <div className="text-[9px] text-slate-500 uppercase font-black tracking-widest mb-1">Signal Wins</div>
                                <div className="text-xl font-bold text-emerald-400">
                                  {(() => {
                                    const sigs = Array.isArray(signalsData) ? signalsData : (signalsData.signals || []);
                                    const closed = sigs.filter((s:any) => s.status !== 'active');
                                    const wins = closed.filter((s:any) => s.status === 'tp_hit');
                                    return closed.length > 0 ? `${((wins.length / closed.length) * 100).toFixed(0)}%` : '0%';
                                  })()}
                                </div>
                              </div>
                              <div className="p-4 bg-white/[0.03] border border-white/5 rounded-2xl">
                                <div className="text-[9px] text-slate-500 uppercase font-black tracking-widest mb-1">Total Signals</div>
                                <div className="text-xl font-bold text-white">{(Array.isArray(signalsData) ? signalsData : (signalsData.signals || [])).length}</div>
                              </div>
                              <div className="p-4 bg-white/[0.03] border border-white/5 rounded-2xl">
                                <div className="text-[9px] text-slate-500 uppercase font-black tracking-widest mb-1">Avg Signal PnL</div>
                                <div className="text-xl font-bold text-purple-400">
                                  {(() => {
                                    const sigs = Array.isArray(signalsData) ? signalsData : (signalsData.signals || []);
                                    const closed = sigs.filter((s:any) => s.status !== 'active');
                                    const avg = closed.length > 0 ? closed.reduce((acc:number, s:any) => acc + s.pnl, 0) / closed.length : 0;
                                    return `+${avg.toFixed(2)}%`;
                                  })()}
                                </div>
                              </div>
                              <div className="p-4 bg-white/[0.03] border border-white/5 rounded-2xl">
                                <div className="text-[9px] text-slate-500 uppercase font-black tracking-widest mb-1">Live Signals</div>
                                <div className="text-xl font-bold text-cyan-400">{(Array.isArray(signalsData) ? signalsData : (signalsData.signals || [])).filter((s:any) => s.status === 'active').length}</div>
                              </div>
                           </div>

                           {/* Signal List */}
                           <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              {(Array.isArray(signalsData) ? signalsData : (signalsData.signals || [])).map((s: any) => (
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
                              {(Array.isArray(signalsData) ? signalsData : (signalsData.signals || [])).length === 0 && (
                                <div className="col-span-2 py-12 text-center text-slate-500 text-sm italic">Scanning markets for high-probability signals...</div>
                              )}
                           </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </Card>
            </motion.div>
          </div>

          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
            <Card className="bg-slate-900/40 border-white/5 h-full max-h-[600px] flex flex-col shadow-2xl">
              <div className="p-6 border-b border-white/5">
                <h3 className="text-xl font-bold flex items-center gap-3 text-white">
                  <Clock size={20} className="text-cyan-400" /> Execution Log
                </h3>
              </div>
              <div className="space-y-0 overflow-y-auto flex-grow custom-scrollbar">
                 {trades.length === 0 ? (
                   <div className="p-12 text-center text-slate-600 text-sm italic">Listening for AI execution events...</div>
                 ) : (
                   trades.slice().reverse().map((t) => (
                     <div key={t.id} className={`p-5 flex gap-5 border-l-4 transition-all duration-300 hover:bg-white/[0.03] ${t.status === 'open' ? 'border-emerald-500/40' : 'border-blue-500/40'}`}>
                        <div className="flex-shrink-0 mt-1">
                          {t.status === 'open' ? <TrendingUp size={20} className="text-emerald-400" /> : <TrendingDown size={20} className="text-blue-400" />}
                        </div>
                        <div className="flex-grow">
                          <div className="flex justify-between items-start mb-1">
                            <Badge className={`text-[10px] font-mono border-none ${t.status === 'open' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-blue-500/10 text-blue-400'}`}>
                              {t.status === 'open' ? 'ENTRY' : 'EXIT'}
                            </Badge>
                            <span className="text-[10px] font-mono text-slate-500">{new Date(t.timestamp).toLocaleTimeString()}</span>
                          </div>
                          <div className="text-sm font-bold text-white uppercase tracking-tight mb-1">{t.symbol}</div>
                          <div className="text-xs font-mono text-cyan-400/80">PRICE: ${t.price.toFixed(4)}</div>
                          {t.pnl !== 0 && (
                            <div className={`text-xs font-bold mt-2 pt-2 border-t border-white/5 ${t.pnl > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                              PnL: {t.pnl > 0 ? '+' : ''}${t.pnl.toFixed(4)}
                            </div>
                          )}
                        </div>
                     </div>
                   ))
                 )}
              </div>
            </Card>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
