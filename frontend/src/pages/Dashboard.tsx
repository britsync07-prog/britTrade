import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Play, TrendingUp, Shield, BarChart3, Zap, ArrowRight, Wallet } from 'lucide-react';
import api from '../services/api';

export default function Dashboard() {
  const [strategies, setStrategies] = useState<any[]>([]);
  const [subscribed, setSubscribed] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [stratsRes, subRes] = await Promise.all([
          api.get('/strategies'),
          api.get('/strategies/subscribed')
        ]);
        setStrategies(stratsRes.data);
        setSubscribed(subRes.data);
      } catch (e) {
        console.error('Error fetching dashboard data:', e);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  if (loading) return <div className="p-8 text-center text-text-dim">Loading Strategies...</div>;

  return (
    <div className="space-y-12">
      <header className="flex justify-between items-end">
        <div>
          <h1 className="text-4xl font-bold mb-2">Market <span className="text-gradient">Terminals</span></h1>
          <p className="text-text-dim">Deploy advanced AI strategies across 100+ crypto markets.</p>
        </div>
        <div className="glass-card flex items-center gap-4 py-3 px-6 rounded-2xl">
          <Wallet className="text-primary" size={24} />
          <div>
            <div className="text-xs text-text-dim uppercase font-bold tracking-wider">Account Balance</div>
            <div className="text-xl font-bold">$10,000.00</div>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {strategies.map((strat) => {
          const isSubscribed = subscribed.some(s => s.id === strat.id);
          return (
            <div key={strat.id} className="glass-card group flex flex-col">
              <div className="flex justify-between items-start mb-6">
                <div className="p-3 bg-primary/10 rounded-xl">
                  {strat.name === 'UltimateFuturesScalper' ? <Zap className="text-primary" /> : <BarChart3 className="text-primary" />}
                </div>
                {isSubscribed && <span className="badge badge-success">Active</span>}
              </div>

              <h3 className="text-xl font-bold mb-2">{strat.name}</h3>
              <p className="text-text-dim text-sm mb-6 flex-grow">{strat.description || "High-performance automated trading strategy."}</p>

              <div className="flex items-center gap-6 mb-8 text-sm">
                <div>
                  <div className="text-text-dim mb-1">Risk</div>
                  <div className="font-bold text-yellow-400">Medium</div>
                </div>
                <div>
                  <div className="text-text-dim mb-1">Avg 24h</div>
                  <div className="font-bold text-green-400">+2.4%</div>
                </div>
                <div>
                  <div className="text-text-dim mb-1">Mode</div>
                  <div className="font-bold uppercase tracking-wider text-[10px] bg-white/5 px-2 rounded-md">Futures</div>
                </div>
              </div>

              <Link 
                to={`/strategy/${strat.id}`} 
                className={`btn-primary w-full flex items-center justify-center gap-2 ${isSubscribed ? '' : 'opacity-80'}`}
              >
                {isSubscribed ? 'Open Terminal' : 'View Details'}
                <ArrowRight size={18} />
              </Link>
            </div>
          );
        })}
      </div>
    </div>
  );
}
