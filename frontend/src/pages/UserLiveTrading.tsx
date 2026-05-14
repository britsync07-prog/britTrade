import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { ArrowLeft, Radio } from 'lucide-react';
import LiveTradingPanel from '../components/admin/LiveTradingPanel';

export default function UserLiveTrading() {
  return (
    <div className="min-h-screen bg-cyber-dark text-slate-200 pb-20 relative overflow-hidden">
      <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-emerald-500/5 rounded-full blur-[120px] -z-10" />
      <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-cyan-500/5 rounded-full blur-[120px] -z-10" />

      <div className="max-w-7xl mx-auto px-6 pt-12 space-y-12 relative z-10">
        <header className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-8">
          <div className="space-y-2">
            <div className="flex items-center gap-3 mb-2 text-emerald-400">
              <Radio className="w-5 h-5" />
              <span className="text-[10px] font-black uppercase tracking-[0.2em]">Personal Live Trading</span>
            </div>
            <h1 className="text-5xl lg:text-7xl font-black tracking-tighter text-white">
              Live <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-400">Trading</span>
            </h1>
            <p className="text-slate-400 text-lg font-medium max-w-xl">Manage your Binance API, strategy settings, and real orders in one place.</p>
          </div>

          <Link to="/dashboard" className="glass-card px-6 py-3 flex items-center gap-2 hover:border-cyan-500/30 transition-all cursor-pointer group">
            <ArrowLeft className="text-cyan-400 w-4 h-4" />
            <span className="text-xs font-black uppercase tracking-widest text-white">Dashboard</span>
          </Link>
        </header>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <LiveTradingPanel apiBase="/live-trading" showKillSwitch={false} />
        </motion.div>
      </div>
    </div>
  );
}
