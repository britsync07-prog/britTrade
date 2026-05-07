import { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Hero } from './components/ui/animated-hero';
import RadialOrbitalTimeline from './components/ui/radial-orbital-timeline';
import { ServiceCarousel, type Service } from './components/ui/services-card';
import { Activity, Shield, TrendingUp, Coins, Rocket, Layers } from "lucide-react";
import { SignalBroadcast } from './components/ui/SignalBroadcast';
import { PerformanceTicker } from './components/ui/PerformanceTicker';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import StrategyDetail from './pages/StrategyDetail';
import TradingViewChart from './components/ui/TradingViewChart';
import AdminDashboard from './pages/AdminDashboard';
import api from './services/api';

const services: Service[] = [
  {
    number: "001",
    title: "Low Risk Strategy",
    description:
      "Conservative spot trading focusing on BTC and ETH. Minimal drawdown with consistent long-term growth.",
    icon: Shield,
    gradient: "from-emerald-500/50 to-emerald-800/50",
    price: "$25",
    planId: "low_risk",
    dailyReturn: "+$0.00"
  },
  {
    number: "002",
    title: "Medium Risk Strategy",
    description:
      "Dynamic altcoin rotation and mid-cap gems. Balanced approach for higher returns with managed volatility.",
    icon: Coins,
    gradient: "from-blue-500/50 to-blue-800/50",
    price: "$20",
    planId: "medium_risk",
    dailyReturn: "+$0.00"
  },
  {
    number: "003",
    title: "High Risk Strategy",
    description:
      "Leveraged futures scalping and momentum trading. Engineered for aggressive growth in volatile markets.",
    icon: Rocket,
    gradient: "from-purple-500/50 to-purple-800/50",
    price: "$15",
    planId: "high_risk",
    dailyReturn: "+$0.00"
  },
  {
    number: "004",
    title: "All Strategies Bundle",
    description:
      "Complete access to all strategies, custom alerts, and priority AI signals. The ultimate trading toolkit.",
    icon: Layers,
    gradient: "from-cyan-500/50 to-cyan-800/50",
    price: "$50",
    planId: "bundle",
    dailyReturn: "+$0.00"
  },
];

const timelineData = [
  {
    id: 1,
    title: "Secure Auth",
    date: "Stable",
    content: "Enterprise-grade JWT authentication and secure session management.",
    category: "Security",
    icon: Shield,
    relatedIds: [2],
    status: "completed" as const,
    energy: 100,
  },
  {
    id: 2,
    title: "Signal Mining",
    date: "Ready",
    content: "Direct access to real-time premium signals with entry and exit targets.",
    category: "Connectivity",
    icon: Activity,
    relatedIds: [2],
    status: "completed" as const,
    energy: 95,
  },
  {
    id: 3,
    title: "AI Analysis",
    date: "Running",
    content: "Advanced machine learning models scanning 200+ pairs for high-probability setups.",
    category: "AI",
    icon: TrendingUp,
    relatedIds: [2, 4],
    status: "in-progress" as const,
    energy: 85,
  },
  {
    id: 4,
    title: "Risk Calibration",
    date: "Active",
    content: "Dynamic take-profit and stop-loss calculations based on market volatility.",
    category: "Risk",
    icon: Shield,
    relatedIds: [3, 5],
    status: "completed" as const,
    energy: 90,
  },
  {
    id: 5,
    title: "Full Autonomy",
    date: "Q2 2024",
    content: "Completely hands-off autonomous portfolio rebalancing.",
    category: "Future",
    icon: Activity,
    relatedIds: [4],
    status: "pending" as const,
    energy: 40,
  },
];

function LandingPage({ user }: { user: any }) {
  const [perfData, setPerfData] = useState<any[]>([]);
  const [localServices, setLocalServices] = useState(services);

  useEffect(() => {
    const fetchPerf = async () => {
      try {
        const { data } = await api.get('/public/strategies/performance');
        setPerfData(data);
        
        // Strategy Name Mapping
        const nameMap: Record<string, string> = {
          "Low Risk Strategy": "GridMeanReversion",
          "Medium Risk Strategy": "TrendFollower",
          "High Risk Strategy": "UltimateFuturesScalper"
        };

        // Update services with live returns
        const updated = services.map(s => {
          const backendName = nameMap[s.title];
          const match = data.find((p: any) => p.name === backendName);
          
          if (match) {
            return { 
              ...s, 
              dailyReturn: `${parseFloat(match.prof24h) >= 0 ? '+' : ''}$${match.prof24h}` 
            };
          }
          
          // Special handling for Bundle (combined profit)
        // Special handling for Bundle (combined profit)
        if (s.planId === 'bundle') {
          const totalProf = data.reduce((acc: number, p: any) => acc + parseFloat(p.prof24h || 0), 0);
          return { 
            ...s, 
            dailyReturn: `${totalProf >= 0 ? '+' : ''}$${totalProf.toFixed(2)}` 
          };
        }

        return s;
      });

      // Apply offers on top of updated performance data
      try {
        const { data: offers } = await api.get('/payments/offers');
        const finalized = updated.map(s => {
          const offer = offers.find((o: any) => o.planId === s.planId);
          if (offer) {
            const originalPriceVal = parseInt(s.price?.replace('$', '') || '0');
            const discount = Math.floor(originalPriceVal * (offer.discountPercentage / 100));
            return {
              ...s,
              originalPrice: s.price,
              price: `$${originalPriceVal - discount}`,
              discountPercentage: offer.discountPercentage
            };
          }
          return s;
        });
        setLocalServices(finalized);
        } catch (e) {
          console.error('Failed to fetch offers', e);
          setLocalServices(updated);
        }
      } catch (err) {
        console.error('Failed to fetch performance', err);
      }
    };

    fetchPerf();

    // Handle hash scroll on initial load
    if (window.location.hash) {
      setTimeout(() => {
        const id = window.location.hash.replace('#', '');
        const element = document.getElementById(id);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth' });
        }
      }, 500); // Small delay to ensure content is rendered
    }

    const interval = setInterval(fetchPerf, 30000);
    return () => clearInterval(interval);
  }, []);

  const handlePurchase = async (planId: string) => {
    if (user?.purchasedPlans?.includes(planId)) {
      window.location.href = '/dashboard';
      return;
    }

    const token = localStorage.getItem('token');
    if (!token) {
      window.location.href = `/login?redirect=purchase&planId=${planId}`;
      return;
    }

    try {
      const { data } = await api.post('/payments/create-session', { planId });
      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error('No checkout URL received');
      }
    } catch (e: any) {
      console.error('Purchase failed', e);
      alert(e.response?.data?.error || 'Purchase failed');
    }
  };

  return (
    <div className="min-h-screen bg-[#020617] selection:bg-cyan-500/30">
      <nav className="fixed top-0 w-full z-50 border-b border-white/5 bg-slate-950/50 backdrop-blur-md">
        <div className="container mx-auto px-6 py-2 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Activity className="text-cyan-400 w-8 h-8" />
            <span className="text-xl font-bold tracking-tighter text-white">BRIT<span className="text-cyan-400">TRADE</span></span>
          </div>
          <div className="flex items-center gap-6">
            <a href="#pricing" className="text-sm font-bold text-cyan-400 hover:text-cyan-300 transition-colors uppercase tracking-widest">Pricing</a>
            <a href="/login" className="text-sm font-medium text-slate-300 hover:text-white transition-colors">Log In</a>
            <a href="/login?signup=true" className="px-4 py-2 bg-white text-black rounded-lg text-sm font-bold hover:bg-slate-200 transition-colors">Get Started</a>
          </div>
        </div>
      </nav>

      <main className="pt-[56px]">
        <SignalBroadcast />
        <Hero />
        <PerformanceTicker data={perfData} />
        <TradingViewChart />

        <section id="pricing" className="py-24 bg-slate-950/20">
          <div className="container mx-auto px-6 text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold mb-4 tracking-tighter">
              Choose Your <span className="text-cyan-400">Strategy</span>
            </h2>
            <p className="text-slate-400 max-w-2xl mx-auto">
              Select a signal package tailored to your risk tolerance and trading goals.
              <br />
              <span className="text-[10px] uppercase tracking-widest text-cyan-400/60 font-bold">Based on 24h simulated paper trades</span>
            </p>
          </div>
          <ServiceCarousel services={localServices} onPurchase={handlePurchase} />
        </section>
        
        <section className="py-24 relative">
          <div className="container mx-auto px-6 text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold mb-4">Our Technology <span className="text-cyan-400">Roadmap</span></h2>
            <p className="text-slate-400 max-w-2xl mx-auto">Explore the core systems powering the world's most advanced autonomous trading engine.</p>
          </div>
          
          <RadialOrbitalTimeline timelineData={timelineData} />
        </section>

        <section className="py-24 border-t border-white/5">
           <div className="container mx-auto px-6 text-center">
              <div className="grid md:grid-cols-3 gap-12">
                <div className="p-8 rounded-3xl bg-slate-900/50 border border-white/5">
                  <Activity className="w-12 h-12 text-cyan-400 mb-6 mx-auto" />
                  <h3 className="text-xl font-bold mb-4">24/7 Signals</h3>
                  <p className="text-slate-400">The engine never sleeps. It scans markets and identifies premium signals while you enjoy your life.</p>
                </div>
                <div className="p-8 rounded-3xl bg-slate-900/50 border border-white/5">
                  <Shield className="w-12 h-12 text-purple-400 mb-6 mx-auto" />
                  <h3 className="text-xl font-bold mb-4">Secure Storage</h3>
                  <p className="text-slate-400">Your API keys are encrypted at rest with military-grade AES-256 standards.</p>
                </div>
                <div className="p-8 rounded-3xl bg-slate-900/50 border border-white/5">
                  <TrendingUp className="w-12 h-12 text-emerald-400 mb-6 mx-auto" />
                  <h3 className="text-xl font-bold mb-4">Compound Growth</h3>
                  <p className="text-slate-400">Our strategies are optimized for long-term compounding and risk management.</p>
                </div>
              </div>
           </div>
        </section>
      </main>

      <footer className="py-12 border-t border-white/5">
        <div className="container mx-auto px-6 text-center text-slate-500 text-sm">
          &copy; 2024 BritTrade AI Solutions. All rights reserved.
        </div>
      </footer>
    </div>
  );
}

import { GoogleOAuthProvider } from '@react-oauth/google';
import { AuthProvider, useAuth } from './context/AuthContext';

function AppContent() {
  const { user, loading } = useAuth();

  if (loading) return (
    <div className="min-h-screen bg-[#020617] flex items-center justify-center">
      <Activity className="w-12 h-12 text-cyan-400 animate-pulse" />
    </div>
  );

  return (
    <Router>
      <Routes>
        <Route path="/" element={<LandingPage user={user} />} />
        <Route 
          path="/login" 
          element={!user ? <Login /> : <Navigate to="/dashboard" />} 
        />
        <Route 
          path="/dashboard/*" 
          element={user ? <Dashboard /> : <Navigate to="/login" />} 
        />
        <Route 
          path="/strategy/:id" 
          element={user ? <StrategyDetail /> : <Navigate to="/login" />} 
        />
        <Route 
          path="/admin" 
          element={user?.role === 'admin' ? <AdminDashboard /> : <Navigate to="/dashboard" />} 
        />
      </Routes>
    </Router>
  );
}

function App() {
  return (
    <GoogleOAuthProvider clientId={import.meta.env.VITE_GOOGLE_CLIENT_ID || ''}>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </GoogleOAuthProvider>
  );
}

export default App;
