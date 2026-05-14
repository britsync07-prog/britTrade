import { Navbar } from '../../components/layout/Navbar';
import { Footer } from '../../components/layout/Footer';

export default function Terms() {
  return (
    <div className="min-h-screen bg-[#020617] text-slate-300 font-sans">
      <Navbar />
      <main className="pt-32 pb-24 container mx-auto px-6 max-w-4xl">
        <h1 className="text-4xl font-bold text-white mb-8">Terms and Conditions</h1>
        <div className="prose prose-invert max-w-none text-slate-400">
          <p className="mb-4"><em>Last updated: {new Date().toLocaleDateString()}</em></p>
          <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg mb-8 text-yellow-200 text-sm">
            <strong>Legal Review Notice:</strong> This document is provided for structural and planning purposes. It must be reviewed and customized by a qualified legal professional for your specific jurisdiction before public use.
          </div>

          <h2 className="text-2xl text-white mt-8 mb-4">1. Introduction</h2>
          <p className="mb-4">Welcome to BritTrade. By accessing our website, services, or software, you agree to be bound by these Terms and Conditions. If you do not agree with any part of these terms, you must not use our services.</p>

          <h2 className="text-2xl text-white mt-8 mb-4">2. Services Provided</h2>
          <p className="mb-4">BritTrade provides automated trading signals, software tools, and educational content. We do not provide personalized financial, investment, or legal advice. You are solely responsible for evaluating the merits and risks associated with the use of any information provided by our services.</p>

          <h2 className="text-2xl text-white mt-8 mb-4">3. User Responsibilities</h2>
          <p className="mb-4">You agree to use our services at your own risk. You acknowledge that crypto trading involves high risk, including the possible loss of principal. You must secure your own API keys and never share them with third parties.</p>

          <h2 className="text-2xl text-white mt-8 mb-4">4. Subscriptions and Payments</h2>
          <p className="mb-4">Certain services are provided on a subscription basis. By subscribing, you authorize us to charge your selected payment method. Subscriptions automatically renew unless canceled prior to the renewal date.</p>

          <h2 className="text-2xl text-white mt-8 mb-4">5. Limitation of Liability</h2>
          <p className="mb-4">To the maximum extent permitted by law, BritTrade shall not be liable for any indirect, incidental, special, consequential, or punitive damages, or any loss of profits or revenues, whether incurred directly or indirectly, or any loss of data, use, goodwill, or other intangible losses resulting from your use of the services.</p>
        </div>
      </main>
      <Footer />
    </div>
  );
}
