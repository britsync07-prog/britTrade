import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ChevronLeft, TrendingUp, TrendingDown, Clock, History as HistoryIcon, Target, Activity } from 'lucide-react';
import api from '../services/api';

export default function StrategyDetail() {
  const { id } = useParams();
  const [strategy, setStrategy] = useState<any>(null);
  const [subInfo, setSubInfo] = useState<any>(null);
  const [trades, setTrades] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

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
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, [id]);

  if (loading || !strategy) return <div className="p-8 text-center text-text-dim">Loading Terminal...</div>;

  const liveTrades = trades.filter(t => t.status === 'open');
  const pastTrades = trades.filter(t => t.status === 'closed');
  const totalPnl = pastTrades.reduce((acc, t) => acc + t.pnl, 0);

  return (
    <div className="space-y-8 pb-12">
      <Link to="/" className="flex items-center gap-2 text-text-dim hover:text-white transition-colors mb-4">
        <ChevronLeft size={20} /> Back to Market
      </Link>

      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div className="flex items-center gap-4">
          <div className="p-4 bg-primary/10 rounded-2xl">
            <Activity className="text-primary w-8 h-8" />
          </div>
          <div>
            <h1 className="text-3xl font-bold">{strategy.name}</h1>
            <p className="text-text-dim">Live Execution Engine V2.4</p>
          </div>
        </div>
        
        {subInfo && (
          <div className="flex gap-4">
            <div className="glass-card py-3 px-6 rounded-2xl">
              <div className="text-xs text-text-dim uppercase font-bold tracking-wider">Remaining Capital</div>
              <div className="text-xl font-bold text-green-400">${subInfo.allocatedBalance.toFixed(2)}</div>
            </div>
            <div className="glass-card py-3 px-6 rounded-2xl">
              <div className="text-xs text-text-dim uppercase font-bold tracking-wider">Overall PnL</div>
              <div className={`text-xl font-bold ${totalPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {totalPnl >= 0 ? '+' : ''}${totalPnl.toFixed(2)}
              </div>
            </div>
          </div>
        )}
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Live Positions & Stats */}
        <div className="lg:col-span-2 space-y-8">
          <section className="glass-card p-0 overflow-hidden">
            <div className="p-6 border-b border-border-glass flex justify-between items-center bg-white/5">
              <h3 className="font-bold flex items-center gap-2">
                <Target size={18} className="text-primary" /> Live Positions
              </h3>
              <span className="badge badge-success">{liveTrades.length} Active</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="text-xs text-text-dim uppercase font-bold border-b border-border-glass">
                    <th className="px-6 py-4">Symbol</th>
                    <th className="px-6 py-4">Side</th>
                    <th className="px-6 py-4">Entry</th>
                    <th className="px-6 py-4">Qty</th>
                    <th className="px-6 py-4 text-right">PnL</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-glass">
                  {liveTrades.length === 0 ? (
                    <tr><td colSpan={5} className="px-6 py-12 text-center text-text-dim">No active positions. Scanning markets...</td></tr>
                  ) : (
                    liveTrades.map(t => (
                      <tr key={t.id} className="hover:bg-white/5 transition-colors">
                        <td className="px-6 py-4 font-bold">{t.symbol}</td>
                        <td className="px-6 py-4 text-xs font-bold uppercase">
                          <span className={t.side === 'buy' ? 'text-green-400' : 'text-red-400'}>{t.side}</span>
                        </td>
                        <td className="px-6 py-4 font-mono text-xs">{t.price.toFixed(4)}</td>
                        <td className="px-6 py-4 font-mono text-xs">{t.amount.toFixed(4)}</td>
                        <td className={`px-6 py-4 text-right font-bold ${t.pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {t.pnl >= 0 ? '+' : ''}${t.pnl.toFixed(4)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="glass-card">
             <h3 className="font-bold mb-6 flex items-center gap-2">
                <HistoryIcon size={18} className="text-primary" /> Recent Performance
              </h3>
              <div className="h-[200px] flex items-end gap-2 px-2">
                {pastTrades.slice(-20).map((t, idx) => (
                  <div 
                    key={idx}
                    className={`flex-grow rounded-t-sm transition-all hover:opacity-80`}
                    style={{ 
                      height: `${Math.min(100, Math.max(10, Math.abs(t.pnl) * 500))}%`,
                      backgroundColor: t.pnl > 0 ? '#4ade80' : '#f87171'
                    }}
                    title={`${t.symbol}: ${t.pnl > 0 ? '+' : ''}${t.pnl.toFixed(4)}`}
                  />
                ))}
              </div>
              <div className="grid grid-cols-2 gap-4 mt-8">
                <div className="p-4 bg-white/5 rounded-xl border border-border-glass">
                  <div className="text-xs text-text-dim uppercase font-bold mb-1">Win Rate</div>
                  <div className="text-2xl font-bold">78.4%</div>
                </div>
                <div className="p-4 bg-white/5 rounded-xl border border-border-glass">
                  <div className="text-xs text-text-dim uppercase font-bold mb-1">Total Trades</div>
                  <div className="text-2xl font-bold">{pastTrades.length}</div>
                </div>
              </div>
          </section>
        </div>

        {/* Right Column: Signal Log */}
        <div className="space-y-6">
          <section className="glass-card h-full max-h-[700px] flex flex-col">
            <h3 className="font-bold mb-6 flex items-center gap-2">
              <Clock size={18} className="text-primary" /> Real-time Execution Log
            </h3>
            <div className="space-y-4 overflow-y-auto flex-grow custom-scrollbar">
               {trades.slice().reverse().map((t) => (
                 <div key={t.id} className="flex gap-4 p-3 hover:bg-white/5 rounded-xl transition-colors border-l-2 border-primary/20">
                    <div className="flex-shrink-0 mt-1">
                      {t.status === 'open' ? <TrendingUp size={16} className="text-green-400" /> : <TrendingDown size={16} className="text-blue-400" />}
                    </div>
                    <div>
                      <div className="text-xs font-bold uppercase tracking-wider">
                        {t.status === 'open' ? 'Entry' : 'Exit'} <span className="text-text-dim ml-2 font-mono">{new Date(t.timestamp).toLocaleTimeString()}</span>
                      </div>
                      <div className="text-sm">
                        <span className="font-bold">{t.symbol}</span> {t.status === 'open' ? 'Position opened' : 'Trade closed'}. 
                        Price: <span className="font-mono text-primary">${t.price.toFixed(4)}</span>
                      </div>
                      {t.pnl !== 0 && (
                        <div className={`text-xs font-bold mt-1 ${t.pnl > 0 ? 'text-green-400' : 'text-red-400'}`}>
                          RESULT: {t.pnl > 0 ? '+' : ''}${t.pnl.toFixed(4)}
                        </div>
                      )}
                    </div>
                 </div>
               ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
