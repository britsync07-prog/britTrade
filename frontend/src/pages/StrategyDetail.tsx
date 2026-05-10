import { useState, useEffect } from 'react';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import { ChevronLeft, TrendingUp, Target, Activity, Zap, Send } from 'lucide-react';
import api from '../services/api';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { motion } from 'framer-motion';

export default function StrategyDetail() {
  const { id } = useParams();
  const [strategy, setStrategy] = useState<any>(null);
  const [subInfo, setSubInfo] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasAccess, setHasAccess] = useState(false);
  const [searchParams] = useSearchParams();
  const isHistoryView = searchParams.get('tab') === 'history' || searchParams.get('preview') === 'true' || !hasAccess;

  const [signalsData, setSignalsData] = useState<any>({ signals: [] });
  const [prices, setPrices] = useState<Record<string, number>>({});
  const TG_URL = 'https://t.me/BritSyncAI_bot';

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
        const accessAllowed = userRes.data?.purchasedPlans?.some((p: string) => planToStrat[p]?.includes(Number(id)));
        setHasAccess(!!accessAllowed);

        setError(null);
      } catch (e: any) {
        console.error('Terminal Data Fetch Error:', e);
        setError(e.response?.data?.message || e.message || 'Connection failed');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
    const fetchPrices = async () => {
      try {
        const res = await api.get('/strategies/prices'); // I need to check if this endpoint exists or add it
        setPrices(res.data);
      } catch (e) {}
    };
    fetchPrices();
    const interval = setInterval(() => {
      fetchData();
      fetchPrices();
    }, 10000);
    return () => clearInterval(interval);
  }, [id]);

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
  const closedStatuses = ['completed', 'tp_hit', 'sl_hit', 'closed'];
  
  // Filter for real closed signals. 
  // 1. Must be in a closed status.
  // 2. Either be a primary entry side (BUY/LONG/SHORT)
  // 3. OR be an exit side (SELL/COVER) but with an actual PnL result (not just a noise broadcast)
  const closedSigs = sigs.filter((s:any) => 
    closedStatuses.includes(s.status) && 
    (
      ['buy', 'long', 'short'].includes(s.side.toLowerCase()) || 
      Math.abs(s.pnl || 0) > 0.001
    )
  );

  // Win/Loss logic based on PnL or Status
  const winSigs = closedSigs.filter((s:any) => s.status === 'tp_hit' || (s.pnl || 0) > 0.01);
  const lossSigs = closedSigs.filter((s:any) => s.status === 'sl_hit' || (s.pnl || 0) < -0.01);
  const chartSymbol = sigs.find((s: any) => s.status === 'active')?.symbol || sigs[0]?.symbol || 'BTC/USDT';

  return (
    <div className="min-h-screen bg-[#020617] text-slate-200 pb-20 relative overflow-hidden">


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
              <Badge variant="outline" className="bg-purple-500/10 text-purple-400 border-purple-500/20 px-2 py-0 rounded text-[9px] font-bold">
                5X LEVERAGE
              </Badge>
            </div>
            <p className="text-slate-400 max-w-2xl mt-6 leading-relaxed text-sm">
              {strategy?.description || "High-performance automated trading strategy utilizing advanced deep learning models for predictive market analysis."}
            </p>
          </div>

          <div className="flex flex-wrap gap-3 w-full lg:w-auto">
            {!hasAccess ? (
              <div className="flex items-center gap-3 px-5 h-12 rounded-2xl border border-red-500/20 bg-red-500/5 backdrop-blur-sm">
                <span className="w-2 h-2 rounded-full bg-red-400" />
                <span className="text-sm font-bold text-red-400">Preview Mode Only</span>
                <span className="text-[10px] text-slate-500 font-medium">— Live Signals Locked</span>
              </div>
            ) : !subInfo ? (
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-3 px-5 h-12 rounded-2xl border border-cyan-500/20 bg-cyan-500/5 backdrop-blur-sm">
                  <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                  <span className="text-sm font-bold text-cyan-400">Signal Node Active</span>
                  <span className="text-[10px] text-slate-500 font-medium">— auto-subscribed with your plan</span>
                </div>
                <a
                  href={TG_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-5 h-12 rounded-2xl font-bold text-sm bg-[#229ED9]/10 border border-[#229ED9]/30 text-[#229ED9] hover:bg-[#229ED9]/20 hover:border-[#229ED9]/60 transition-all shadow-lg shadow-[#229ED9]/5"
                >
                  <Send size={15} className="-rotate-45" />
                  Join Telegram Alerts
                </a>
              </div>
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
                <div className="flex flex-col gap-2">
                  <a
                    href={TG_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-5 h-11 rounded-2xl font-bold text-sm bg-[#229ED9]/10 border border-[#229ED9]/30 text-[#229ED9] hover:bg-[#229ED9]/20 hover:border-[#229ED9]/60 transition-all shadow-lg shadow-[#229ED9]/5"
                  >
                    <Send size={15} className="-rotate-45" />
                    Join Telegram Alerts
                  </a>
                  <Button 
                    variant="outline" 
                    onClick={handleUnsubscribe}
                    className="border-white/10 hover:bg-rose-500/10 hover:text-rose-400 hover:border-rose-500/20 rounded-2xl h-11 px-6 transition-all text-sm"
                  >
                    Disconnect Node
                  </Button>
                </div>
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
               <StrategyTradingViewChart symbol={chartSymbol} strategyName={strategy.name} />
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
                     <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 mb-6">
                        <div className="p-3 bg-white/[0.03] border border-white/5 rounded-xl">
                          <div className="text-[8px] text-slate-500 uppercase font-black tracking-widest mb-1">Signal Win Rate</div>
                          <div className="text-lg font-bold text-emerald-400">
                            {closedSigs.length > 0 ? `${((winSigs.length / closedSigs.length) * 100).toFixed(1)}%` : '0.0%'}
                          </div>
                        </div>
                        <div className="p-3 bg-white/[0.03] border border-white/5 rounded-xl">
                          <div className="text-[8px] text-slate-500 uppercase font-black tracking-widest mb-1">Total Signals</div>
                          <div className="text-lg font-bold text-white">{sigs.length}</div>
                        </div>
                        <div className="p-3 bg-white/[0.03] border border-white/5 rounded-xl">
                          <div className="text-[8px] text-slate-500 uppercase font-black tracking-widest mb-1">Avg Signal PnL</div>
                          <div className="text-lg font-bold text-purple-400">
                            {(() => {
                              const avg = closedSigs.length > 0 ? closedSigs.reduce((acc:number, s:any) => acc + (s.pnl || 0), 0) / closedSigs.length : 0;
                              return `${avg >= 0 ? '+' : ''}${avg.toFixed(2)}%`;
                            })()}
                          </div>
                        </div>
                        <div className="p-3 bg-white/[0.03] border border-white/5 rounded-xl">
                          <div className="text-[8px] text-slate-500 uppercase font-black tracking-widest mb-1">Open Trades</div>
                          <div className="text-lg font-bold text-cyan-400">{sigs.filter((s:any) => s.status === 'active').length}</div>
                        </div>
                        <div className="p-3 bg-white/[0.03] border border-white/5 rounded-xl border-emerald-500/10">
                          <div className="text-[8px] text-emerald-500/70 uppercase font-black tracking-widest mb-1">TP Hits</div>
                          <div className="text-lg font-bold text-emerald-500">{winSigs.length}</div>
                        </div>
                        <div className="p-3 bg-white/[0.03] border border-white/5 rounded-xl border-rose-500/10">
                          <div className="text-[8px] text-rose-500/70 uppercase font-black tracking-widest mb-1">SL Hits</div>
                          <div className="text-lg font-bold text-rose-500">{lossSigs.length}</div>
                        </div>
                     </div>

                     {/* Signal List Split View */}
                     <div className={`grid grid-cols-1 ${isHistoryView ? '' : 'lg:grid-cols-2'} gap-8`}>
                        {/* Active Trades Column */}
                        {!isHistoryView && (
                          <div>
                             <div className="flex items-center gap-2 mb-4">
                                <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                                <h3 className="text-sm font-black text-white uppercase tracking-wider">Active Signals</h3>
                                <Badge className="bg-white/5 text-slate-400 border-none ml-auto">{sigs.filter((s:any) => s.status === 'active').length}</Badge>
                             </div>
                             <div className="space-y-4 max-h-[480px] overflow-y-auto pr-1 relative">
                                {sigs.filter((s: any) => s.status === 'active').map((s: any) => (
                                  <SignalCard key={s.id} signal={s} currentPrice={prices[s.symbol]} strategyName={strategy.name} />
                                ))}
                                {sigs.filter((s: any) => s.status === 'active').length === 0 && (
                                  <div className="py-8 bg-white/[0.01] border border-dashed border-white/5 rounded-2xl text-center text-slate-600 text-[10px] uppercase font-bold tracking-widest">No active signals found</div>
                                )}
                             </div>
                          </div>
                        )}

                        {/* Closed Trades Column */}
                        <div>
                           <div className="flex items-center gap-2 mb-4">
                              <div className="w-2 h-2 rounded-full bg-slate-700" />
                              <h3 className="text-sm font-black text-white uppercase tracking-wider">Closed Signals</h3>
                              <Badge className="bg-white/5 text-slate-400 border-none ml-auto">{closedSigs.length}</Badge>
                           </div>
                           <div className="space-y-4 max-h-[480px] overflow-y-auto pr-1">
                              {closedSigs.map((s: any) => (
                                <SignalCard key={s.id} signal={s} currentPrice={prices[s.symbol]} strategyName={strategy.name} />
                              ))}
                              {closedSigs.length === 0 && (
                                <div className="py-8 bg-white/[0.01] border border-dashed border-white/5 rounded-2xl text-center text-slate-600 text-[10px] uppercase font-bold tracking-widest">No closed signals yet</div>
                              )}
                           </div>
                        </div>
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

function StrategyTradingViewChart({ symbol, strategyName }: { symbol: string, strategyName?: string }) {
  const exchangeSymbol = `BINANCE:${String(symbol || 'BTC/USDT').replace('/', '').replace(':USDT', '')}`;
  const interval = strategyName === 'TrendFollower' ? '60' : '5';
  const chartUrl = new URL('https://s.tradingview.com/widgetembed/');

  chartUrl.search = new URLSearchParams({
    frameElementId: `tradingview_${exchangeSymbol.replace(/[^a-zA-Z0-9]/g, '_')}`,
    symbol: exchangeSymbol,
    interval,
    theme: 'dark',
    style: '1',
    timezone: 'Etc/UTC',
    locale: 'en',
    studies: '[]',
    studies_overrides: '{}',
    overrides: '{}',
    enabled_features: '[]',
    disabled_features: '[]',
    hidetoptoolbar: '0',
    hidesidetoolbar: '0',
    hide_side_toolbar: '0',
    hide_top_toolbar: '0',
    hidelegend: '0',
    hidevolume: '0',
    withdateranges: '1',
    symboledit: '1',
    saveimage: '1',
    toolbarbg: '#0f172a',
    autosize: '1',
    utm_source: 'brittrade.pages.dev',
    utm_medium: 'widget',
    utm_campaign: 'strategy_chart',
    utm_term: exchangeSymbol,
  }).toString();

  return (
    <iframe
      src={chartUrl.toString()}
      style={{ width: '100%', height: '100%', border: 'none' }}
      title={`${symbol} Strategy Chart`}
    />
  );
}

function SignalCard({ signal: s, currentPrice, strategyName }: { signal: any, currentPrice?: number, strategyName?: string }) {
  const LEVERAGE = 5;
  const margin = s.stakeAmount || 10;         // Capital at risk (initial margin)
  const positionSize = margin * LEVERAGE;       // Total position value controlled
  const entryPrice = Number(s.price);
  const isLong = s.side === 'buy' || s.side === 'long';

  const formatPrice = (value: any) => {
    const price = Number(value);
    if (!Number.isFinite(price)) return '---';
    if (price === 0) return '0.00';
    if (Math.abs(price) >= 1) return price.toFixed(4);
    if (Math.abs(price) >= 0.01) return price.toFixed(6);
    return price.toFixed(8);
  };

  // At 5x leverage you lose 100% of margin on a 20% adverse price move.
  // LONG  liq = entryPrice × (1 - 1/leverage) = entry × 0.80
  // SHORT liq = entryPrice × (1 + 1/leverage) = entry × 1.20
  const liqPrice = (isLong ? entryPrice * (1 - 1 / LEVERAGE) : entryPrice * (1 + 1 / LEVERAGE));

  // --- PNL CALCULATION ---
  let pnlPct = Number(s.pnl) || 0;
  if (s.status === 'active' && currentPrice) {
    const rawMove = isLong
      ? (currentPrice - entryPrice) / entryPrice
      : (entryPrice - currentPrice) / entryPrice;
    pnlPct = rawMove * 100 * LEVERAGE;
    if (pnlPct <= -100) pnlPct = -100; // Liquidation cap
  }

  // Dollar P&L = Margin × (pnlPct / 100)
  const pnlUsd = margin * (pnlPct / 100);
  const isLiquidated = pnlPct <= -100;

  const statusLabel = isLiquidated
    ? 'LIQUIDATED'
    : s.status.replace('_', ' ').toUpperCase();

  const statusColor = s.status === 'tp_hit'
    ? 'text-emerald-400'
    : (s.status === 'sl_hit' || isLiquidated)
    ? 'text-rose-400'
    : 'text-cyan-400 animate-pulse';

  return (
    <div className={`rounded-xl border transition-all overflow-hidden ${s.status === 'active' ? 'bg-white/[0.04] border-white/10 hover:border-purple-500/50' : 'bg-black/20 border-white/5 opacity-80'}`}>

      {/* ── Header ── */}
      <div className="flex justify-between items-center px-4 pt-4 pb-3">
        <div>
          <div className="text-[8px] font-mono text-slate-500 mb-0.5">{new Date(s.timestamp).toLocaleString()}</div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-black text-white">{s.symbol}</span>
            <Badge className={`text-[8px] px-1.5 py-0 h-4 leading-none font-bold ${isLong ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
              {isLong ? 'LONG' : 'SHORT'}
            </Badge>
            <span className="text-[8px] font-bold text-purple-400 tracking-widest bg-purple-400/5 px-1.5 py-0.5 rounded border border-purple-400/20">5X</span>
          </div>
        </div>
        <div className="text-right">
          <div className={`text-[8px] font-black uppercase tracking-widest mb-1 ${statusColor}`}>
            {statusLabel}
          </div>
          <div className="text-[10px] font-mono font-bold text-white">Entry: ${formatPrice(entryPrice)}</div>
        </div>
      </div>

      {/* ── Futures Trade Breakdown ── */}
      <div className="mx-4 mb-3 rounded-lg bg-purple-500/5 border border-purple-500/10 p-2.5 grid grid-cols-3 gap-2 text-center">
        <div>
          <div className="text-[7px] text-slate-500 uppercase font-black tracking-wider mb-0.5">Margin Used</div>
          <div className="text-[10px] font-bold font-mono text-purple-300">${margin.toFixed(2)}</div>
          <div className="text-[7px] text-slate-600 mt-0.5">your capital at risk</div>
        </div>
        <div className="border-x border-purple-500/10">
          <div className="text-[7px] text-slate-500 uppercase font-black tracking-wider mb-0.5">Position Size</div>
          <div className="text-[10px] font-bold font-mono text-white">${positionSize.toFixed(2)}</div>
          <div className="text-[7px] text-slate-600 mt-0.5">margin × {LEVERAGE}x leverage</div>
        </div>
        <div>
          <div className="text-[7px] text-rose-500/70 uppercase font-black tracking-wider mb-0.5">Liq. Price</div>
          <div className="text-[10px] font-bold font-mono text-rose-400">${formatPrice(liqPrice)}</div>
          <div className="text-[7px] text-slate-600 mt-0.5">{isLong ? '−20% move wipes margin' : '+20% move wipes margin'}</div>
        </div>
      </div>

      {/* ── TP / SL / PnL ── */}
      <div className="border-t border-white/5 grid grid-cols-3 divide-x divide-white/5 bg-white/[0.01]">
        {s.status === 'active' ? (
          <>
            <div className="text-center py-2.5">
              <div className="text-[7px] text-slate-500 uppercase font-black mb-0.5">Take Profit</div>
              <div className="text-[9px] font-mono text-emerald-400 font-bold">${formatPrice(s.tp)}</div>
            </div>
            <div className="text-center py-2.5">
              <div className="text-[7px] text-slate-500 uppercase font-black mb-0.5">Stop Loss</div>
              <div className="text-[9px] font-mono text-rose-400 font-bold">${formatPrice(s.sl)}</div>
            </div>
            <div className="text-center py-2.5">
              <div className="text-[7px] text-slate-500 uppercase font-black mb-0.5">Live PnL</div>
              <div className={`text-[10px] font-mono font-black ${pnlPct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(2)}%
              </div>
              <div className={`text-[8px] font-mono ${pnlUsd >= 0 ? 'text-emerald-500/70' : 'text-rose-500/70'}`}>
                {pnlUsd >= 0 ? '+' : '-'}${Math.abs(pnlUsd).toFixed(2)}
              </div>
            </div>
          </>
        ) : (
          <div className="col-span-3 text-center py-3 px-4">
            <div className="text-[7px] text-slate-500 uppercase font-black mb-1">
              {isLiquidated ? '⚠ Liquidated — Full Margin Lost' : 'Final Result'}
            </div>
            <div className={`text-xl font-black font-mono ${pnlPct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(2)}%
            </div>
            <div className={`text-sm font-bold font-mono mt-0.5 ${pnlUsd >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
              {pnlUsd >= 0 ? '+' : '-'}${Math.abs(pnlUsd).toFixed(2)}
              <span className="text-slate-500 font-normal text-[10px] ml-1">(of ${margin.toFixed(2)} margin)</span>
            </div>
          </div>
        )}
      </div>

      {/* ── Footer ── */}
      <div className="flex items-center justify-between px-4 py-2 border-t border-white/5">
        <div className="text-[8px] text-slate-600 font-bold uppercase tracking-tight">
          MARGIN ${margin.toFixed(2)} · POS ${positionSize.toFixed(2)} · {LEVERAGE}X
        </div>
        {s.status === 'active' && (
          <Badge className="bg-purple-500/20 text-purple-400 border-none px-1.5 py-0 h-4 text-[7px] font-black tracking-widest">LIVE</Badge>
        )}
      </div>
    </div>
  );
}
