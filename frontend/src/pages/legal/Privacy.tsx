import { Navbar } from '../../components/layout/Navbar';
import { Footer } from '../../components/layout/Footer';

export default function Privacy() {
  return (
    <div className="min-h-screen bg-[#020617] text-slate-300 font-sans">
      <Navbar />
      <main className="pt-32 pb-24 container mx-auto px-6 max-w-4xl">
        <h1 className="text-4xl font-bold text-white mb-8">Privacy Policy</h1>
        <div className="prose prose-invert max-w-none text-slate-400">
          <p className="mb-4"><em>Last updated: {new Date().toLocaleDateString()}</em></p>
          <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg mb-8 text-yellow-200 text-sm">
            <strong>Legal Review Notice:</strong> This document is provided for structural and planning purposes. It must be reviewed and customized by a qualified legal professional to ensure compliance with GDPR, CCPA, or other applicable privacy laws.
          </div>

          <h2 className="text-2xl text-white mt-8 mb-4">1. Information We Collect</h2>
          <p className="mb-4">We collect information you provide directly to us, such as when you create an account, subscribe to a service, or contact support. This may include your name, email address, payment information (processed securely via Stripe), and encrypted API keys for trading execution.</p>

          <h2 className="text-2xl text-white mt-8 mb-4">2. How We Use Your Information</h2>
          <p className="mb-4">We use the information we collect to operate, maintain, and improve our services, process transactions, send technical notices, and communicate with you about updates and offers.</p>

          <h2 className="text-2xl text-white mt-8 mb-4">3. Data Security</h2>
          <p className="mb-4">We implement industry-standard security measures, including AES-256 encryption for sensitive data such as API keys. However, no security system is impenetrable, and we cannot guarantee the absolute security of your data.</p>

          <h2 className="text-2xl text-white mt-8 mb-4">4. Third-Party Services</h2>
          <p className="mb-4">We may share your information with trusted third-party service providers (e.g., payment processors, analytics providers) strictly to facilitate the operation of our platform.</p>
        </div>
      </main>
      <Footer />
    </div>
  );
}
