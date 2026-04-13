import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { BarChart3, Zap, ArrowRight, Wallet, Activity, TrendingUp } from 'lucide-react';
import api from '../services/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { motion } from 'framer-motion';

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

  if (loading) return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <Activity className="w-12 h-12 text-cyan-400 animate-pulse" />
    </div>
  );

  return (
    <div className="space-y-12 animate-fade-in px-4 py-8 max-w-7xl mx-auto">
      <header className="flex flex-col md:flex-row justify-between items-end gap-6">
        <div className="w-full">
          <h1 className="text-4xl md:text-5xl font-bold tracking-tighter mb-2">
            Market <span className="bg-gradient-to-r from-cyan-400 to-purple-400 bg-clip-text text-transparent">Terminals</span>
          </h1>
          <p className="text-slate-400 text-lg">Deploy advanced AI strategies across 100+ crypto markets.</p>
        </div>
        
        <Card className="bg-white/5 border-white/10 backdrop-blur-xl w-full md:w-auto">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-3 bg-cyan-500/10 rounded-2xl">
              <Wallet className="text-cyan-400" size={24} />
            </div>
            <div>
              <div className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">Account Balance</div>
              <div className="text-2xl font-bold text-white leading-tight">$10,000.00</div>
            </div>
          </CardContent>
        </Card>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {strategies.map((strat, idx) => {
          const isSubscribed = subscribed.some(s => s.id === strat.id);
          const Icon = strat.name === 'UltimateFuturesScalper' ? Zap : (idx % 2 === 0 ? BarChart3 : TrendingUp);
          
          return (
            <motion.div
              key={strat.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.1 }}
            >
              <Card className="group relative bg-slate-900/40 border-white/5 hover:border-white/20 transition-all duration-500 overflow-hidden h-full flex flex-col hover:shadow-2xl hover:shadow-cyan-500/10 hover:-translate-y-1">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-cyan-500/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                
                <CardHeader className="flex flex-row justify-between items-start pb-2">
                  <div className="p-3 bg-white/5 rounded-2xl group-hover:bg-cyan-500/10 transition-colors">
                    <Icon className="text-slate-400 group-hover:text-cyan-400" size={24} />
                  </div>
                  {isSubscribed && (
                    <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 px-3 py-1">
                      Active
                    </Badge>
                  )}
                </CardHeader>

                <CardContent className="flex-grow pt-4">
                  <CardTitle className="text-2xl font-bold mb-3 tracking-tight group-hover:text-white transition-colors">{strat.name}</CardTitle>
                  <p className="text-slate-400 text-sm leading-relaxed mb-8">
                    {strat.description || "High-performance automated trading strategy utilizing advanced deep learning models for predictive market analysis."}
                  </p>

                  <div className="grid grid-cols-3 gap-4 mb-8 pt-6 border-t border-white/5">
                    <div>
                      <div className="text-[10px] text-slate-500 uppercase font-bold mb-1 tracking-wider">Risk</div>
                      <div className="text-sm font-bold text-yellow-500/80">Medium</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-500 uppercase font-bold mb-1 tracking-wider">24h Prof</div>
                      <div className="text-sm font-bold text-emerald-400">+3.2%</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-500 uppercase font-bold mb-1 tracking-wider">Mode</div>
                      <div className="text-[10px] font-bold bg-white/5 text-slate-300 px-2 py-0.5 rounded-full inline-block">Futures</div>
                    </div>
                  </div>

                  <Link to={`/strategy/${strat.id}`} className="block">
                    <Button 
                      className={`w-full h-12 rounded-2xl group/btn ${isSubscribed ? 'bg-white text-black hover:bg-white/90' : 'bg-slate-800 text-white hover:bg-slate-700'}`}
                    >
                      <span className="font-bold">{isSubscribed ? 'Open Terminal' : 'View Details'}</span>
                      <ArrowRight className="ml-2 w-4 h-4 group-hover/btn:translate-x-1 transition-transform" />
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
