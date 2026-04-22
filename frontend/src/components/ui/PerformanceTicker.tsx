import { TrendingUp, Activity, BarChart3, Target } from 'lucide-react';

export function PerformanceTicker({ data = [] }: { data?: any[] }) {
  const combinedYield = data.reduce((acc, s) => acc + parseFloat(s.pnl24h || 0), 0);
  const avgProfit = data.length > 0 
    ? data.reduce((acc, s) => acc + parseFloat(s.prof24h || 0), 0) / data.length 
    : 0;
  const avgWinRate = data.length > 0 
    ? data.reduce((acc, s) => acc + parseFloat(s.winRate || 0), 0) / data.length 
    : 0;

  const stats = [
    { 
      label: "Combined 24h Yield", 
      value: `${combinedYield >= 0 ? '+' : ''}${combinedYield.toFixed(2)}%`, 
      icon: TrendingUp, 
      color: "text-emerald-400" 
    },
    { 
      label: "Avg. Profit per $100", 
      value: `$${avgProfit.toFixed(2)}`, 
      icon: Target, 
      color: "text-cyan-400" 
    },
    { 
      label: "Win Rate (Simulated)", 
      value: `${avgWinRate.toFixed(1)}%`, 
      icon: Activity, 
      color: "text-purple-400" 
    },
    { 
      label: "Active Strategies", 
      value: data.length > 0 ? data.length.toString() : "3", 
      icon: BarChart3, 
      color: "text-blue-400" 
    }
  ];

  return (
    <div className="w-full bg-slate-900/40 border-y border-white/5 backdrop-blur-sm">
      <div className="container mx-auto px-6">
        <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-white/5">
          {stats.map((stat, i) => (
            <div key={i} className="py-4 px-4 flex flex-col items-center justify-center text-center group hover:bg-white/[0.02] transition-colors">
              <div className="flex items-center gap-2 mb-2">
                <stat.icon className={`w-4 h-4 ${stat.color} opacity-70`} />
                <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">{stat.label}</span>
              </div>
              <span className={`text-2xl font-black tracking-tighter ${stat.color} group-hover:scale-110 transition-transform`}>
                {stat.value}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
