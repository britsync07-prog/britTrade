import { Activity } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';

export function Navbar() {
  const location = useLocation();
  const isHome = location.pathname === '/';

  return (
    <nav className="fixed top-0 w-full z-50 border-b border-white/5 bg-slate-950/50 backdrop-blur-md">
      <div className="container mx-auto px-6 py-2 flex justify-between items-center">
        <Link to="/" className="flex items-center gap-2">
          <Activity className="text-cyan-400 w-8 h-8" />
          <span className="text-xl font-bold tracking-tighter text-white">BRIT<span className="text-cyan-400">TRADE</span></span>
        </Link>
        <div className="flex items-center gap-6">
          <Link to="/about" className="text-sm font-bold text-slate-300 hover:text-white transition-colors uppercase tracking-widest">About</Link>
          <Link to="/faq" className="text-sm font-bold text-slate-300 hover:text-white transition-colors uppercase tracking-widest">FAQ</Link>
          {isHome ? (
            <a href="#pricing" className="text-sm font-bold text-cyan-400 hover:text-cyan-300 transition-colors uppercase tracking-widest">Pricing</a>
          ) : (
            <Link to="/#pricing" className="text-sm font-bold text-cyan-400 hover:text-cyan-300 transition-colors uppercase tracking-widest">Pricing</Link>
          )}
          <Link to="/login" className="text-sm font-medium text-slate-300 hover:text-white transition-colors">Log In</Link>
          <Link to="/login?signup=true" className="px-4 py-2 bg-white text-black rounded-lg text-sm font-bold hover:bg-slate-200 transition-colors">Get Started</Link>
        </div>
      </div>
    </nav>
  );
}
