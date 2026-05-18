import React from 'react';
import { Activity } from 'lucide-react';

const MaintenancePage: React.FC = () => {
  return (
    <div className="min-h-screen bg-[#020617] flex flex-col items-center justify-center p-6 text-center">
      <div className="relative mb-8">
        <div className="absolute inset-0 bg-cyan-500/20 blur-3xl rounded-full" />
        <Activity className="w-16 h-16 text-cyan-400 animate-pulse relative z-10" />
      </div>
      <h1 className="text-3xl md:text-5xl font-bold text-white mb-6 tracking-tight">
        Under <span className="text-cyan-400">Maintenance</span>
      </h1>
      <p className="text-slate-400 max-w-2xl text-lg md:text-xl leading-relaxed font-medium">
        we are makeing the website better for you .so that you can get real profitable trade profit. it wont take much time . keep up with us. thanks fro you patince. website will properly tomorrow .
      </p>
      <div className="mt-12 text-[10px] uppercase tracking-[0.2em] text-cyan-500/50 font-bold">
        BritTrade AI Solutions
      </div>
    </div>
  );
};

export default MaintenancePage;
