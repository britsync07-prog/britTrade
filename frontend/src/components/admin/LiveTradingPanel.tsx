import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Wallet, TrendingUp, TrendingDown, Activity, Power, PowerOff,
  RefreshCw, AlertTriangle, CheckCircle, XCircle, ChevronUp, ChevronDown,
  Zap, DollarSign, BarChart2, ShieldOff
} from 'lucide-react';
import api from '../../services/api';

interface DashboardData {
  status: { configured: boolean; enabled: boolean; testnet: boolean; executorReady: boolean };
  balance: { spot: number | null; futures: number | null; error: string | null };
  strategyConfigs: Array<{ strategy_id: number; enabled: number; trade_amount_usdt: number; leverage: number; order_type: string }>;
  orders: Array<{
    id: number; strategy_id: number; symbol: string; side: string; amount: number;
    price: number; avg_fill_price: number | null; status: string; testnet: number;
    created_at: string; livePnlUSDT: number | null; livePnlPct: number | null; currentPrice?: number;
    error_msg?: string;
  }>;
  summary: { openCount: number; closedCount: number; totalOrders: number; totalLivePnlUSDT: number };
}

const STRATEGY_NAMES: Record<number, string> = { 1: 'GridMeanReversion', 2: 'TrendFollower', 3: 'FuturesScalper' };
const STRATEGY_COLORS: Record<number, string> = { 1: 'text-cyan-400', 2: 'text-purple-400', 3: 'text-orange-400' };

export default function LiveTradingPanel() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [testnet, setTestnet] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [killMsg, setKillMsg] = useState('');
  const [showConfig, setShowConfig] = useState(false);

  const fetchDashboard = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    else setRefreshing(true);
    try {
      const res = await api.get('/admin/live-trading/dashboard');
      setData(res.data);
    } catch (e) {
      console.error('Failed to load live trading dashboard', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboard();
    const iv = setInterval(() => fetchDashboard(true), 30000);
    return () => clearInterval(iv);
  }, [fetchDashboard]);

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setTestResult(null);
    try {
      await api.post('/admin/live-trading/config', { apiKey, apiSecret, testnet });
      setApiKey(''); setApiSecret('');
      setShowConfig(false);
      fetchDashboard(true);
    } catch (err: any) {
      setTestResult({ ok: false, msg: err.response?.data?.error || 'Save failed' });
    } finally { setSaving(false); }
  };

  const handleTest = async () => {
    setTesting(true); setTestResult(null);
    try {
      const res = await api.post('/admin/live-trading/config/test');
      setTestResult({ ok: true, msg: `✅ Connected! Spot: $${res.data.balance.spotUSDT?.toFixed(2)} | Futures: $${res.data.balance.futuresUSDT?.toFixed(2)}` });
    } catch (err: any) {
      setTestResult({ ok: false, msg: err.response?.data?.error || 'Connection failed' });
    } finally { setTesting(false); }
  };

  const handleToggle = async () => {
    if (!data) return;
    try {
      await api.post('/admin/live-trading/toggle', { enabled: !data.status.enabled });
      fetchDashboard(true);
    } catch (err: any) { alert(err.response?.data?.error || 'Toggle failed'); }
  };

  const handleKillSwitch = async () => {
    if (!confirm('🚨 KILL SWITCH: Cancel all open orders and disable live trading?')) return;
    try {
      const res = await api.post('/admin/live-trading/kill-switch');
      setKillMsg(res.data.message);
      fetchDashboard(true);
      setTimeout(() => setKillMsg(''), 5000);
    } catch (err: any) { alert(err.response?.data?.error || 'Kill switch failed'); }
  };

  const handleStrategyToggle = async (stratId: number, current: number) => {
    try {
      await api.put(`/admin/live-trading/strategies/${stratId}`, { enabled: current === 0 });
      fetchDashboard(true);
    } catch (err: any) { alert(err.response?.data?.error || 'Update failed'); }
  };

  if (loading) return (
    <div className="flex items-center justify-center py-24">
      <Activity className="w-8 h-8 text-emerald-400 animate-pulse" />
    </div>
  );

  const { status, balance, summary, orders, strategyConfigs } = data!;
  const openOrders = orders.filter(o => o.status === 'open');
  const recentClosed = orders.filter(o => o.status !== 'open').slice(0, 20);

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">

      {/* Kill switch banner */}
      <AnimatePresence>
        {killMsg && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="bg-red-500/10 border border-red-500/30 rounded-2xl px-6 py-4 text-red-400 text-sm font-bold flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 flex-shrink-0" />{killMsg}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Status bar */}
      <div className="glass-card p-6 flex flex-wrap items-center justify-between gap-4 border-white/5">
        <div className="flex items-center gap-4 flex-wrap">
          {/* Live badge */}
          <div className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-black uppercase tracking-widest border ${
            status.enabled ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-white/5 border-white/10 text-slate-500'
          }`}>
            <span className={`w-2 h-2 rounded-full ${status.enabled ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`} />
            {status.enabled ? 'LIVE' : 'INACTIVE'}
          </div>
          {status.testnet && (
            <span className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-yellow-500/10 border border-yellow-500/20 text-yellow-400">Testnet</span>
          )}
          {!status.configured && (
            <span className="text-slate-500 text-xs font-medium">⚠️ No API keys configured</span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {status.configured && (
            <button onClick={handleKillSwitch}
              className="px-4 py-2 bg-red-500/10 hover:bg-red-500 text-red-400 hover:text-white border border-red-500/20 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2">
              <ShieldOff className="w-4 h-4" /> Kill Switch
            </button>
          )}
          <button onClick={handleToggle} disabled={!status.configured}
            className={`px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${
              status.enabled
                ? 'bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20'
                : 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20'
            } disabled:opacity-30`}>
            {status.enabled ? <><PowerOff className="w-4 h-4" /> Disable</> : <><Power className="w-4 h-4" /> Enable</>}
          </button>
          <button onClick={() => fetchDashboard(true)} disabled={refreshing}
            className="p-2 hover:bg-white/5 rounded-xl transition-all text-slate-400">
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
        <StatCard icon={Wallet} label="Spot Balance" color="text-cyan-400"
          value={balance.spot !== null ? `$${balance.spot.toFixed(2)}` : balance.error ? 'Error' : 'N/A'} />
        <StatCard icon={BarChart2} label="Futures Balance" color="text-purple-400"
          value={balance.futures !== null ? `$${balance.futures.toFixed(2)}` : 'N/A'} />
        <StatCard icon={Activity} label="Open Trades" color="text-yellow-400"
          value={summary.openCount} />
        <StatCard icon={DollarSign} label="Live PnL (Open)" color={summary.totalLivePnlUSDT >= 0 ? 'text-emerald-400' : 'text-red-400'}
          value={`${summary.totalLivePnlUSDT >= 0 ? '+' : ''}$${summary.totalLivePnlUSDT.toFixed(2)}`} />
      </div>

      {/* API Config panel */}
      <div className="glass-card border-white/5 overflow-hidden">
        <button onClick={() => setShowConfig(v => !v)}
          className="w-full p-6 flex items-center justify-between text-left hover:bg-white/[0.02] transition-colors">
          <div className="flex items-center gap-3">
            <Zap className="w-5 h-5 text-yellow-400" />
            <span className="text-sm font-black text-white uppercase tracking-widest">Binance API Configuration</span>
            {status.configured && <CheckCircle className="w-4 h-4 text-emerald-400" />}
          </div>
          {showConfig ? <ChevronUp className="text-slate-500 w-4 h-4" /> : <ChevronDown className="text-slate-500 w-4 h-4" />}
        </button>
        <AnimatePresence>
          {showConfig && (
            <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }}
              className="overflow-hidden border-t border-white/5">
              <div className="p-6 space-y-5">
                <form onSubmit={handleSaveConfig} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2 block">API Key</label>
                    <input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} required
                      placeholder="Binance API Key" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder:text-slate-600 focus:border-cyan-500/50 outline-none transition-all" />
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2 block">API Secret</label>
                    <input type="password" value={apiSecret} onChange={e => setApiSecret(e.target.value)} required
                      placeholder="Binance API Secret" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder:text-slate-600 focus:border-cyan-500/50 outline-none transition-all" />
                  </div>
                  <div className="flex items-center gap-3">
                    <button type="button" onClick={() => setTestnet(v => !v)}
                      className={`relative w-12 h-6 rounded-full transition-colors ${testnet ? 'bg-yellow-500' : 'bg-emerald-500'}`}>
                      <span className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${testnet ? 'left-1' : 'left-7'}`} />
                    </button>
                    <span className="text-sm text-slate-400 font-medium">{testnet ? '🧪 Testnet' : '🔴 Live (Real Money)'}</span>
                  </div>
                  <div className="flex gap-3">
                    <button type="submit" disabled={saving}
                      className="flex-1 py-3 bg-cyan-500 hover:bg-cyan-400 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all disabled:opacity-50">
                      {saving ? 'Saving…' : 'Save Keys'}
                    </button>
                    <button type="button" onClick={handleTest} disabled={testing || !status.configured}
                      className="flex-1 py-3 bg-white/5 hover:bg-white/10 text-slate-300 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all disabled:opacity-50">
                      {testing ? 'Testing…' : 'Test Connection'}
                    </button>
                  </div>
                </form>
                {testResult && (
                  <div className={`flex items-start gap-2 text-sm p-3 rounded-xl ${testResult.ok ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                    {testResult.ok ? <CheckCircle className="w-4 h-4 mt-0.5 flex-shrink-0" /> : <XCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />}
                    {testResult.msg}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Strategy configs */}
      <div className="glass-card border-white/5 overflow-hidden">
        <div className="p-6 border-b border-white/5">
          <h3 className="text-sm font-black text-white uppercase tracking-widest">Strategy Live Trading Config</h3>
          <p className="text-slate-500 text-xs mt-1">Enable strategies and set USDT trade amounts</p>
        </div>
        <div className="divide-y divide-white/5">
          {strategyConfigs.map(sc => (
            <div key={sc.strategy_id} className="p-5 flex flex-wrap items-center gap-4">
              <div className="flex-1 min-w-[160px]">
                <div className={`text-sm font-black ${STRATEGY_COLORS[sc.strategy_id] || 'text-white'}`}>
                  {STRATEGY_NAMES[sc.strategy_id] || `Strategy ${sc.strategy_id}`}
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">
                  ${sc.trade_amount_usdt} per trade · {sc.leverage}x · {sc.order_type}
                </div>
              </div>
              <button onClick={() => handleStrategyToggle(sc.strategy_id, sc.enabled)}
                className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${
                  sc.enabled ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-white/5 text-slate-500 border-white/10 hover:border-white/20'
                }`}>
                {sc.enabled ? '● Active' : '○ Inactive'}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Open Trades */}
      <div className="glass-card border-white/5 overflow-hidden">
        <div className="p-6 border-b border-white/5 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse inline-block" />
              Open Trades
            </h3>
            <p className="text-slate-500 text-xs mt-1">{openOrders.length} active position{openOrders.length !== 1 ? 's' : ''}</p>
          </div>
        </div>
        {openOrders.length === 0 ? (
          <div className="py-16 text-center text-slate-600 text-sm font-medium">No open trades</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-white/[0.02]">
                  {['Symbol', 'Side', 'Amount', 'Entry', 'Current', 'PnL %', 'PnL USDT', 'Strategy', 'Opened'].map(h => (
                    <th key={h} className="px-5 py-4 text-[10px] font-black uppercase tracking-widest text-slate-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {openOrders.map(o => {
                  const isProfit = (o.livePnlUSDT ?? 0) >= 0;
                  return (
                    <tr key={o.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-5 py-4 font-bold text-white text-sm">{o.symbol}</td>
                      <td className="px-5 py-4">
                        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-black uppercase ${
                          o.side === 'buy' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
                        }`}>
                          {o.side === 'buy' ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                          {o.side.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-sm text-slate-300 font-mono">{o.amount?.toFixed(6)}</td>
                      <td className="px-5 py-4 text-sm text-slate-300 font-mono">${(o.avg_fill_price || o.price)?.toFixed(4)}</td>
                      <td className="px-5 py-4 text-sm text-slate-300 font-mono">{o.currentPrice ? `$${o.currentPrice.toFixed(4)}` : '—'}</td>
                      <td className={`px-5 py-4 text-sm font-black font-mono ${isProfit ? 'text-emerald-400' : 'text-red-400'}`}>
                        {o.livePnlPct !== null ? `${isProfit ? '+' : ''}${o.livePnlPct}%` : '—'}
                      </td>
                      <td className={`px-5 py-4 text-sm font-black font-mono ${isProfit ? 'text-emerald-400' : 'text-red-400'}`}>
                        {o.livePnlUSDT !== null ? `${isProfit ? '+' : ''}$${o.livePnlUSDT.toFixed(4)}` : '—'}
                      </td>
                      <td className={`px-5 py-4 text-xs font-bold ${STRATEGY_COLORS[o.strategy_id] || 'text-slate-400'}`}>
                        {STRATEGY_NAMES[o.strategy_id] || `#${o.strategy_id}`}
                      </td>
                      <td className="px-5 py-4 text-xs text-slate-500 font-mono">
                        {new Date(o.created_at).toLocaleTimeString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Recent closed/error orders */}
      {recentClosed.length > 0 && (
        <div className="glass-card border-white/5 overflow-hidden">
          <div className="p-6 border-b border-white/5">
            <h3 className="text-sm font-black text-white uppercase tracking-widest">Recent Order History</h3>
            <p className="text-slate-500 text-xs mt-1">Last {recentClosed.length} completed orders</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-white/[0.02]">
                  {['Symbol', 'Side', 'Status', 'Entry Price', 'Strategy', 'Testnet', 'Time'].map(h => (
                    <th key={h} className="px-5 py-4 text-[10px] font-black uppercase tracking-widest text-slate-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {recentClosed.map(o => (
                  <tr key={o.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-5 py-4 font-bold text-white text-sm">{o.symbol}</td>
                    <td className="px-5 py-4">
                      <span className={`text-[10px] font-black uppercase px-2 py-1 rounded-lg ${
                        o.side === 'buy' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
                      }`}>{o.side}</span>
                    </td>
                    <td className="px-5 py-4">
                      <StatusBadge status={o.status} />
                    </td>
                    <td className="px-5 py-4 text-sm text-slate-400 font-mono">${(o.avg_fill_price || o.price)?.toFixed(4)}</td>
                    <td className={`px-5 py-4 text-xs font-bold ${STRATEGY_COLORS[o.strategy_id] || 'text-slate-400'}`}>
                      {STRATEGY_NAMES[o.strategy_id] || `#${o.strategy_id}`}
                    </td>
                    <td className="px-5 py-4">
                      {o.testnet ? <span className="text-[10px] text-yellow-500 font-bold">Testnet</span> : <span className="text-[10px] text-emerald-500 font-bold">Live</span>}
                    </td>
                    <td className="px-5 py-4 text-xs text-slate-500 font-mono">
                      {new Date(o.created_at).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </motion.div>
  );
}

function StatCard({ icon: Icon, label, value, color }: { icon: any; label: string; value: string | number; color: string }) {
  return (
    <div className="glass-card p-6 relative overflow-hidden group hover:border-white/20 transition-all">
      <div className="absolute -right-3 -bottom-3 opacity-[0.04] group-hover:opacity-[0.08] transition-opacity">
        <Icon size={80} />
      </div>
      <div className="relative z-10">
        <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-2">{label}</div>
        <div className={`text-3xl font-black tracking-tight ${color}`}>{value}</div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    open: 'bg-emerald-500/10 text-emerald-400',
    filled: 'bg-cyan-500/10 text-cyan-400',
    closed: 'bg-slate-500/10 text-slate-400',
    cancelled: 'bg-yellow-500/10 text-yellow-400',
    error: 'bg-red-500/10 text-red-400',
  };
  return (
    <span className={`text-[10px] font-black uppercase px-2 py-1 rounded-lg ${map[status] || 'bg-white/5 text-slate-500'}`}>
      {status}
    </span>
  );
}
