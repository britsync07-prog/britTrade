import { Link } from 'react-router-dom';

export function Footer() {
  return (
    <footer className="py-12 border-t border-white/5 bg-slate-950">
      <div className="container mx-auto px-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
          <div>
            <span className="text-xl font-bold tracking-tighter text-white block mb-4">BRIT<span className="text-cyan-400">TRADE</span></span>
            <p className="text-slate-500 text-sm">Advanced AI-driven crypto trading signals and automation platform.</p>
          </div>
          <div>
            <h4 className="text-white font-bold mb-4">Platform</h4>
            <ul className="space-y-2 text-sm text-slate-400">
              <li><Link to="/about" className="hover:text-cyan-400 transition-colors">About Us</Link></li>
              <li><Link to="/faq" className="hover:text-cyan-400 transition-colors">FAQ</Link></li>
              <li><a href="/#pricing" className="hover:text-cyan-400 transition-colors">Pricing</a></li>
            </ul>
          </div>
          <div>
            <h4 className="text-white font-bold mb-4">Legal</h4>
            <ul className="space-y-2 text-sm text-slate-400">
              <li><Link to="/terms" className="hover:text-cyan-400 transition-colors">Terms & Conditions</Link></li>
              <li><Link to="/privacy" className="hover:text-cyan-400 transition-colors">Privacy Policy</Link></li>
              <li><Link to="/disclaimer" className="hover:text-cyan-400 transition-colors">Risk Disclaimer</Link></li>
              <li><Link to="/refunds" className="hover:text-cyan-400 transition-colors">Refund Policy</Link></li>
            </ul>
          </div>
        </div>

        <div className="border-t border-white/5 pt-8 mb-8 text-xs text-slate-500 leading-relaxed">
          <p className="font-bold text-slate-400 mb-2">HIGH RISK WARNING:</p>
          <p>
            Trading cryptocurrencies and other financial instruments involves substantial risk of loss and is not suitable for every investor. The valuation of cryptocurrencies and futures may fluctuate, and, as a result, clients may lose more than their original investment. The highly leveraged nature of futures trading means that small market movements will have a great impact on your trading account and this can work against you, leading to large losses or can work for you, leading to large gains.
          </p>
          <p className="mt-2">
            BritTrade provides software, signals, and educational content. We are not a registered broker, analyst, or investment advisor. The information provided by BritTrade is for educational purposes only and should not be considered financial advice. Past performance is not indicative of future results. You are solely responsible for your own trading decisions.
          </p>
        </div>

        <div className="text-center text-slate-600 text-sm">
          &copy; {new Date().getFullYear()} BritTrade AI Solutions. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
