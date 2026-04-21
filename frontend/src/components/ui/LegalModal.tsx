import { motion, AnimatePresence } from 'framer-motion';
import { X, ShieldAlert, FileText, AlertTriangle } from 'lucide-react';

interface LegalModalProps {
  isOpen: boolean;
  onClose: () => void;
  type: 'terms' | 'risk';
}

export const LegalModal = ({ isOpen, onClose, type }: LegalModalProps) => {
  const content = {
    terms: {
      title: "Terms & Conditions",
      icon: <FileText className="w-6 h-6 text-cyan-400" />,
      sections: [
        {
          h: "1. Acceptance of Service",
          p: "By accessing or using BritTrade, you agree to be bound by these Terms. If you disagree with any part of the terms, you may not access the service."
        },
        {
          h: "2. Subscription & Payments",
          p: "Our services are billed on a subscription basis. All fees are non-refundable except as required by law. You are responsible for all charges incurred under your account."
        },
        {
          h: "3. User Responsibilities",
          p: "You are responsible for maintaining the confidentiality of your account and API keys. Any activity under your account is your sole responsibility."
        },
        {
          h: "4. Service Limitations",
          p: "BritTrade provides a platform for automated trading signals. We do not guarantee 100% uptime and are not liable for any service interruptions."
        }
      ]
    },
    risk: {
      title: "Risk Disclosure",
      icon: <ShieldAlert className="w-6 h-6 text-red-400" />,
      sections: [
        {
          h: "1. High Volatility Risk",
          p: "Cryptocurrency markets are extremely volatile. Trading involves significant risk of loss and is not suitable for all investors."
        },
        {
          h: "2. No Profit Guarantee",
          p: "Past performance of our algorithms is not indicative of future results. BritTrade makes no guarantees regarding potential profits or losses."
        },
        {
          h: "3. Leverage & Liquidation",
          p: "High-risk strategies utilizing leverage can result in the total loss of your capital. You should only trade with funds you can afford to lose."
        },
        {
          h: "4. Technical Risks",
          p: "Automated trading relies on API connectivity and software execution. System failures, network latency, or exchange outages can impact trade execution."
        }
      ]
    }
  };

  const active = content[type];

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100]"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-2xl glass-card p-0 overflow-hidden z-[101] shadow-2xl border border-white/10"
          >
            <div className="p-6 border-b border-white/5 flex justify-between items-center bg-white/[0.02]">
              <div className="flex items-center gap-3">
                {active.icon}
                <h2 className="text-xl font-bold tracking-tight text-white">{active.title}</h2>
              </div>
              <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-full transition-colors text-slate-400 hover:text-white">
                <X size={20} />
              </button>
            </div>
            
            <div className="p-8 max-h-[60vh] overflow-y-auto custom-scrollbar space-y-8">
              {type === 'risk' && (
                <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl flex gap-4 items-start">
                  <AlertTriangle className="w-6 h-6 text-red-400 shrink-0 mt-1" />
                  <p className="text-sm text-red-200 font-medium">
                    Trading digital assets carries a high level of risk. Your capital is at risk. 
                    Ensure you fully understand the risks involved before proceeding.
                  </p>
                </div>
              )}

              {active.sections.map((s, i) => (
                <div key={i} className="space-y-3">
                  <h3 className="text-sm font-black uppercase tracking-widest text-cyan-400/80">{s.h}</h3>
                  <p className="text-slate-400 text-sm leading-relaxed font-medium">{s.p}</p>
                </div>
              ))}
            </div>

            <div className="p-6 border-t border-white/5 flex justify-end bg-white/[0.01]">
              <button 
                onClick={onClose}
                className="px-6 py-2 bg-white text-black rounded-xl text-sm font-bold hover:bg-slate-200 transition-all"
              >
                Understood
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
