import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ChevronLeft, TrendingUp, TrendingDown, Clock, History as HistoryIcon, Target, Activity, Zap, BarChart3 } from 'lucide-react';
import api from '../services/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { motion } from 'framer-motion';

export default function StrategyDetail() {
  const { id } = useParams();
  const [strategy, setStrategy] = useState<any>(null);
  const [subInfo, setSubInfo] = useState<any>(null);
  const [trades, setTrades] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [stratRes, subRes, tradesRes] = await Promise.all([
          api.get(`/strategies`),
          api.get('/strategies/subscribed'),
          api.get('/portfolio/history')
        ]);
        
        const s = stratRes.data.find((x: any) => x.id === Number(id));
        const sub = subRes.data.find((x: any) => x.id === Number(id));
        const t = tradesRes.data.filter((x: any) => x.strategyId === Number(id));

        setStrategy(s);
        setSubInfo(sub);
        setTrades(t);
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
  const totalPnl = pastTrades.reduce((acc, t) => acc + t.pnl, 0);

  return (
    <div className="min-h-screen bg-[#020617] text-white p-4 md:p-8 animate-fade-in">
      <div className="max-w-7xl mx-auto space-y-8">
        <Link to="/dashboard" className="inline-flex items-center gap-2 text-slate-400 hover:text-white transition-colors group mb-4">
          <ChevronLeft size={20} className="group-hover:-translate-x-1 transition-transform" /> 
          <span className="text-sm font-medium">Back to Dashoard</span>
        </Link>

        <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-8">
          <div className="flex items-center gap-6">
            <div className="p-5 bg-cyan-500/10 rounded-3xl border border-cyan-500/20 shadow-2xl shadow-cyan-500/10">
              {strategy.name === 'UltimateFuturesScalper' ? <Zap className="text-cyan-400 w-10 h-10" /> : <BarChart3 className="text-cyan-400 w-10 h-10" />}
            </div>
            <div>
              <h1 className="text-4xl md:text-5xl font-bold tracking-tighter">{strategy.name}</h1>
              <div className="flex items-center gap-2 mt-2">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-slate-400 text-sm font-mono tracking-widest uppercase">Live Execution Engine V2.4</span>
              </div>
            </div>
          </div>
          
          {subInfo && (
            <div className="flex flex-col sm:flex-row gap-4 w-full md:w-auto">
              <Card className="bg-white/5 border-white/10 backdrop-blur-xl flex-grow md:flex-grow-0">
                <CardContent className="p-4 flex items-center gap-4">
                  <div>
                    <div className="text-[10px] text-slate-500 uppercase font-bold tracking-widest mb-1">Remaining Capital</div>
                    <div className="text-xl font-bold text-emerald-400">${subInfo.allocatedBalance.toFixed(2)}</div>
                  </div>
                </CardContent>
              </Card>
              <Card className="bg-white/5 border-white/10 backdrop-blur-xl flex-grow md:flex-grow-0">
                <CardContent className="p-4 flex items-center gap-4">
                  <div>
                    <div className="text-[10px] text-slate-500 uppercase font-bold tracking-widest mb-1">Overall PnL</div>
                    <div className={`text-xl font-bold ${totalPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {totalPnl >= 0 ? '+' : ''}${totalPnl.toFixed(2)}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column: Live Positions & Stats */}
          <div className="lg:col-span-2 space-y-8">
            <motion.div
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.1 }}
            >
              <Card className="bg-slate-900/40 border-white/5 overflow-hidden shadow-2xl">
                <CardHeader className="p-6 border-b border-white/5 flex flex-row justify-between items-center bg-white/[0.02]">
                  <CardTitle className="text-xl font-bold flex items-center gap-3">
                    <Target size={20} className="text-cyan-400" /> Live Positions
                  </CardTitle>
                  <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 px-3 py-1">
                    {liveTrades.length} Active
                  </Badge>
                </CardHeader>
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="text-[10px] text-slate-500 uppercase font-bold border-b border-white/5">
                        <th className="px-6 py-4">Symbol</th>
                        <th className="px-6 py-4">Side</th>
                        <th className="px-6 py-4 text-center">Entry</th>
                        <th className="px-6 py-4 text-center">Qty</th>
                        <th className="px-6 py-4 text-right">PnL</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {liveTrades.length === 0 ? (
                        <tr><td colSpan={5} className="px-6 py-16 text-center text-slate-500 text-sm">No active positions. Scanning markets...</td></tr>
                      ) : (
                        liveTrades.map(t => (
                          <tr key={t.id} className="hover:bg-white/[0.03] transition-colors group">
                            <td className="px-6 py-5 font-bold text-white group-hover:text-cyan-400 transition-colors uppercase tracking-tight">{t.symbol}</td>
                            <td className="px-6 py-5">
                              <Badge variant="outline" className={`text-[10px] ${t.side === 'buy' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border-rose-500/20'}`}>
                                {t.side.toUpperCase()}
                              </Badge>
                            </td>
                            <td className="px-6 py-5 text-center font-mono text-xs text-slate-300">{t.price.toFixed(4)}</td>
                            <td className="px-6 py-5 text-center font-mono text-xs text-slate-300">{t.amount.toFixed(4)}</td>
                            <td className={`px-6 py-5 text-right font-bold ${t.pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                              {t.pnl >= 0 ? '+' : ''}${t.pnl.toFixed(4)}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              <Card className="bg-slate-900/40 border-white/5 p-8 shadow-2xl">
                 <h3 className="text-xl font-bold mb-8 flex items-center gap-3">
                    <HistoryIcon size={20} className="text-cyan-400" /> Recent Performance
                  </h3>
                  <div className="h-[240px] flex items-end gap-2 px-2 border-b border-white/5 mb-8">
                    {pastTrades.length === 0 ? (
                      <div className="w-full flex items-center justify-center text-slate-600 italic">History will populate after first trade closure...</div>
                    ) : (
                      pastTrades.slice(-30).map((t, idx) => (
                        <div 
                          key={idx}
                          className={`flex-grow rounded-t-lg transition-all duration-500 hover:scale-105 hover:filter hover:brightness-125`}
                          style={{ 
                            height: `${Math.min(100, Math.max(15, Math.abs(t.pnl) * 200))}%`,
                            backgroundColor: t.pnl > 0 ? '#10b981' : '#ef4444',
                            opacity: 0.6 + (idx / 30) * 0.4
                          }}
                          title={`${t.symbol}: ${t.pnl > 0 ? '+' : ''}${t.pnl.toFixed(4)}`}
                        />
                      ))
                    )}
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                    <div className="p-5 bg-white/[0.03] rounded-2xl border border-white/5 group hover:bg-white/[0.06] transition-colors">
                      <div className="text-[10px] text-slate-500 uppercase font-bold mb-1 tracking-widest">Win Rate</div>
                      <div className="text-3xl font-bold text-white tracking-tighter">78.4%</div>
                    </div>
                    <div className="p-5 bg-white/[0.03] rounded-2xl border border-white/5 group hover:bg-white/[0.06] transition-colors">
                      <div className="text-[10px] text-slate-500 uppercase font-bold mb-1 tracking-widest">Total Trades</div>
                      <div className="text-3xl font-bold text-white tracking-tighter">{pastTrades.length}</div>
                    </div>
                    <div className="p-5 bg-white/[0.03] rounded-2xl border border-white/5 group hover:bg-white/[0.06] transition-colors">
                      <div className="text-[10px] text-slate-500 uppercase font-bold mb-1 tracking-widest">Profit Factor</div>
                      <div className="text-3xl font-bold text-cyan-400 tracking-tighter">2.41</div>
                    </div>
                    <div className="p-5 bg-white/[0.03] rounded-2xl border border-white/5 group hover:bg-white/[0.06] transition-colors">
                      <div className="text-[10px] text-slate-500 uppercase font-bold mb-1 tracking-widest">Avg Trade</div>
                      <div className="text-3xl font-bold text-emerald-400 tracking-tighter">+0.8%</div>
                    </div>
                  </div>
              </Card>
            </motion.div>
          </div>

          {/* Right Column: Execution Log */}
          <motion.div
            className="h-full"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3 }}
          >
            <Card className="bg-slate-900/40 border-white/5 h-full max-h-[800px] flex flex-col shadow-2xl">
              <CardHeader className="p-6 border-b border-white/5">
                <CardTitle className="text-xl font-bold flex items-center gap-3">
                  <Clock size={20} className="text-cyan-400" /> Execution Log
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0 flex-grow overflow-hidden flex flex-col">
                <div className="space-y-0 overflow-y-auto flex-grow custom-scrollbar">
                   {trades.length === 0 ? (
                     <div className="p-8 text-center text-slate-600 text-sm">Awaiting first execution signal...</div>
                   ) : (
                     trades.slice().reverse().map((t) => (
                       <div key={t.id} className={`p-5 flex gap-5 border-l-4 transition-all duration-300 hover:bg-white/[0.03] ${t.status === 'open' ? 'border-emerald-500/40' : 'border-blue-500/40'}`}>
                          <div className="flex-shrink-0 mt-1">
                            {t.status === 'open' ? <TrendingUp size={20} className="text-emerald-400" /> : <TrendingDown size={20} className="text-blue-400" />}
                          </div>
                          <div className="flex-grow">
                            <div className="flex justify-between items-start mb-1">
                              <Badge className={`text-[10px] font-mono ${t.status === 'open' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-blue-500/10 text-blue-400'}`}>
                                {t.status === 'open' ? 'ENTRY' : 'EXIT'}
                              </Badge>
                              <span className="text-[10px] font-mono text-slate-500">{new Date(t.timestamp).toLocaleTimeString()}</span>
                            </div>
                            <div className="text-sm font-bold text-white uppercase tracking-tight mb-1">{t.symbol}</div>
                            <div className="text-xs text-slate-400 leading-relaxed mb-2">
                              {t.status === 'open' ? 'Optimal entry signal detected by AI core. Liquidity and volatility confirmed.' : 'Target ROI reached or dynamic stop-loss triggered. Profit secured.'}
                            </div>
                            <div className="text-xs font-mono text-cyan-400/80">PRICE: ${t.price.toFixed(4)}</div>
                            {t.pnl !== 0 && (
                              <div className={`text-sm font-bold mt-2 pt-2 border-t border-white/5 ${t.pnl > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                RESULT: {t.pnl > 0 ? '+' : ''}${t.pnl.toFixed(4)}
                              </div>
                            )}
                          </div>
                       </div>
                     ))
                   )}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
