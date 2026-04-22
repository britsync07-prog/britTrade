import { useEffect, useState } from 'react';
import { Activity, TrendingUp, TrendingDown, Clock, ShieldCheck } from 'lucide-react';
import api from '../../services/api';

interface Signal {
  symbol: string;
  side: string;
  pnl: number;
  status: string;
  timestamp: string;
  strategyName: string;
}

export function SignalBroadcast() {
  const [signals, setSignals] = useState<Signal[]>([]);

  useEffect(() => {
    const fetchBroadcast = async () => {
      try {
        const { data } = await api.get('/public/signals/broadcast');
        if (Array.isArray(data)) {
          // Double it to create a seamless infinite scroll loop
          setSignals([...data, ...data]);
        }
      } catch (e) {
        console.error('Failed to fetch broadcast signals', e);
      }
    };
    fetchBroadcast();
    const interval = setInterval(fetchBroadcast, 15000); // 15s refresh
    return () => clearInterval(interval);
  }, []);

  if (signals.length === 0) return null;

  return (
    <div className="w-full bg-slate-950/80 backdrop-blur-md border-b border-white/10 overflow-hidden relative z-40 py-1">
      <div className="flex items-center gap-3 absolute left-0 h-full z-10 bg-gradient-to-r from-slate-950 via-slate-950 to-transparent px-4">
        <Activity className="w-4 h-4 text-cyan-400 animate-pulse" />
        <span className="text-xs font-bold uppercase tracking-widest text-cyan-400">Live Trades</span>
      </div>

      <div className="flex whitespace-nowrap animate-marquee ml-32">
        {signals.map((sig, i) => {
          const isProfit = sig.pnl >= 0;
          const PnlIcon = isProfit ? TrendingUp : TrendingDown;
          const pnlColor = isProfit ? 'text-emerald-400' : 'text-red-400';
          const bgGlass = isProfit ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-red-500/10 border-red-500/20';

          return (
            <div key={i} className={`inline-flex items-center gap-4 mx-2 px-4 py-1.5 rounded-full border ${bgGlass} backdrop-blur-sm shadow-sm transition-all hover:scale-105`}>
              <div className="flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-slate-400" />
                <span className="text-xs font-medium text-slate-300">{sig.strategyName.replace(/([A-Z])/g, ' $1').trim()}</span>
              </div>
              <div className="w-px h-3 bg-white/10" />
              <span className="font-bold text-sm text-white tracking-wide">{sig.symbol}</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded text-black font-extrabold uppercase ${sig.side === 'buy' || sig.side === 'long' ? 'bg-emerald-400' : 'bg-red-400'}`}>
                {sig.side}
              </span>
              <div className="w-px h-3 bg-white/10" />
              <div className="flex items-center gap-1">
                <PnlIcon className={`w-3.5 h-3.5 ${pnlColor}`} />
                <span className={`text-sm font-bold ${pnlColor}`}>{isProfit ? '+' : ''}{sig.pnl.toFixed(2)}%</span>
              </div>
              <div className="flex items-center gap-1 ml-2 text-slate-500 opacity-70">
                <Clock className="w-3 h-3" />
                <span className="text-[10px]">{new Date(sig.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
              </div>
            </div>
          );
        })}
      </div>

      <style>{`
        @keyframes marquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); } /* Scrolls precisely half since array is doubled */
        }
        .animate-marquee {
          animation: marquee 30s linear infinite;
        }
        .animate-marquee:hover {
          animation-play-state: paused;
        }
      `}</style>
    </div>
  );
}
