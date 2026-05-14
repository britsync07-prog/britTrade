import { Navbar } from '../../components/layout/Navbar';
import { Footer } from '../../components/layout/Footer';

export default function Refunds() {
  return (
    <div className="min-h-screen bg-[#020617] text-slate-300 font-sans">
      <Navbar />
      <main className="pt-32 pb-24 container mx-auto px-6 max-w-4xl">
        <h1 className="text-4xl font-bold text-white mb-8">Refund Policy</h1>
        <div className="prose prose-invert max-w-none text-slate-400">
          <p className="mb-4"><em>Last updated: {new Date().toLocaleDateString()}</em></p>
          <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg mb-8 text-yellow-200 text-sm">
            <strong>Legal Review Notice:</strong> This document is provided for structural and planning purposes. Ensure this policy aligns with your actual business practices and payment processor terms.
          </div>

          <h2 className="text-2xl text-white mt-8 mb-4">1. Digital Goods and Services</h2>
          <p className="mb-4">Due to the nature of digital goods, software subscriptions, and instant access to proprietary trading signals, all sales are considered final once access to the service has been granted.</p>

          <h2 className="text-2xl text-white mt-8 mb-4">2. Subscription Cancellations</h2>
          <p className="mb-4">You may cancel your subscription at any time to prevent future billing charges. Cancellation requests must be submitted through your account dashboard or by contacting support before your next billing cycle.</p>

          <h2 className="text-2xl text-white mt-8 mb-4">3. Exceptional Circumstances</h2>
          <p className="mb-4">We reserve the right to issue refunds or credits at our sole discretion under exceptional circumstances, such as prolonged technical outages that prevent the core service from functioning.</p>

          <h2 className="text-2xl text-white mt-8 mb-4">4. Dispute Resolution</h2>
          <p className="mb-4">If you experience technical issues, we encourage you to contact our support team to resolve the issue before initiating any chargebacks with your bank or credit card provider.</p>
        </div>
      </main>
      <Footer />
    </div>
  );
}
