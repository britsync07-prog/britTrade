import { Navbar } from '../components/layout/Navbar';
import { Footer } from '../components/layout/Footer';
import { HelpCircle } from 'lucide-react';

export default function FAQ() {
  const faqs = [
    {
      question: "How does the AI signal engine work?",
      answer: "Our engine uses advanced machine learning models and technical indicators (like RSI, MACD, and SuperTrend) to scan hundreds of cryptocurrency pairs 24/7. It identifies high-probability setups based on historical data and real-time market conditions."
    },
    {
      question: "Do I need to leave my computer on?",
      answer: "No. BritTrade is a cloud-based SaaS platform. Once you configure your strategies and API keys, our backend servers handle the execution and monitoring autonomously."
    },
    {
      question: "Is my crypto safe? Do you hold my funds?",
      answer: "We do not hold your funds. All trading happens directly on your connected exchange (e.g., Binance) via API keys. Our platform only requires 'Trade' permissions, never 'Withdrawal' permissions. API keys are encrypted at rest using AES-256."
    },
    {
      question: "What exchanges do you support?",
      answer: "Currently, our automated execution engine fully supports Binance (Spot and USDⓈ-M Futures). We are actively working on integrating Bybit and OKX in Q3."
    },
    {
      question: "Can I cancel my subscription at any time?",
      answer: "Yes, you can cancel your subscription at any time from your account dashboard. You will continue to have access to the platform until the end of your current billing cycle."
    },
    {
      question: "What is paper trading?",
      answer: "Paper trading allows you to test our strategies in real-time market conditions using virtual money. It is a completely risk-free way to evaluate the performance of our signals before committing real capital."
    }
  ];

  return (
    <div className="min-h-screen bg-[#020617] text-slate-300 font-sans">
      <Navbar />
      <main className="pt-32 pb-24 container mx-auto px-6 max-w-3xl">
        <div className="text-center mb-16">
          <HelpCircle className="w-16 h-16 text-cyan-400 mx-auto mb-6" />
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">Frequently Asked <span className="text-cyan-400">Questions</span></h1>
          <p className="text-slate-400">Everything you need to know about BritTrade and our automated execution engine.</p>
        </div>

        <div className="space-y-6">
          {faqs.map((faq, index) => (
            <div key={index} className="bg-slate-900/50 border border-white/5 p-6 rounded-2xl">
              <h3 className="text-xl font-bold text-white mb-3">{faq.question}</h3>
              <p className="text-slate-400 leading-relaxed">{faq.answer}</p>
            </div>
          ))}
        </div>
      </main>
      <Footer />
    </div>
  );
}
