import { Navbar } from '../../components/layout/Navbar';
import { Footer } from '../../components/layout/Footer';

export default function Disclaimer() {
  return (
    <div className="min-h-screen bg-[#020617] text-slate-300 font-sans">
      <Navbar />
      <main className="pt-32 pb-24 container mx-auto px-6 max-w-4xl">
        <h1 className="text-4xl font-bold text-white mb-8">Risk Disclaimer</h1>
        <div className="prose prose-invert max-w-none text-slate-400">
          <p className="mb-4"><em>Last updated: {new Date().toLocaleDateString()}</em></p>
          <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg mb-8 text-yellow-200 text-sm">
            <strong>Legal Review Notice:</strong> This document is provided for structural and planning purposes. Financial disclaimers must be reviewed by a qualified attorney in your operating jurisdiction.
          </div>

          <h2 className="text-2xl text-white mt-8 mb-4">High Risk Warning</h2>
          <p className="mb-4 font-bold text-white">Trading cryptocurrencies, futures, and other financial instruments involves substantial risk of loss and is not suitable for every investor.</p>
          <p className="mb-4">The valuation of cryptocurrencies and futures may fluctuate, and, as a result, clients may lose more than their original investment. The highly leveraged nature of futures trading means that small market movements will have a great impact on your trading account and this can work against you, leading to large losses or can work for you, leading to large gains.</p>

          <h2 className="text-2xl text-white mt-8 mb-4">No Investment Advice</h2>
          <p className="mb-4">BritTrade provides software, signals, and educational content. We are not a registered broker, analyst, or investment advisor. The information provided by BritTrade is for educational and informational purposes only and should not be considered financial advice.</p>

          <h2 className="text-2xl text-white mt-8 mb-4">Past Performance</h2>
          <p className="mb-4">Past performance of any trading system or methodology is not necessarily indicative of future results. Any performance results presented on this website are hypothetical and based on simulated paper trades unless explicitly stated otherwise.</p>

          <h2 className="text-2xl text-white mt-8 mb-4">User Responsibility</h2>
          <p className="mb-4">You are solely responsible for your own trading decisions. You must carefully consider your investment objectives, level of experience, and risk appetite before deciding to participate in any trading activities.</p>
        </div>
      </main>
      <Footer />
    </div>
  );
}
