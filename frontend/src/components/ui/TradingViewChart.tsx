import React, { useEffect, useRef } from 'react';

declare global {
  interface Window {
    TradingView: any;
  }
}

export default function TradingViewChart() {
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/tv.js";
    script.type = "text/javascript";
    script.async = true;
    script.onload = () => {
      if (container.current && window.TradingView) {
        new window.TradingView.widget({
          "autosize": true,
          "symbol": "BINANCE:BTCUSDT",
          "interval": "5",
          "timezone": "Etc/UTC",
          "theme": "dark",
          "style": "1",
          "locale": "en",
          "toolbar_bg": "#f1f3f6",
          "enable_publishing": false,
          "hide_side_toolbar": false,
          "allow_symbol_change": true,
          "container_id": "tradingview_btc_chart",
          "backgroundColor": "#020617",
          "gridColor": "rgba(42, 46, 57, 0.06)",
          "save_image": false,
        });
      }
    };
    document.head.appendChild(script);

    return () => {
      if (script.parentNode) {
        script.parentNode.removeChild(script);
      }
    };
  }, []);

  return (
    <div className="container mx-auto px-6 mb-20 relative">
      <div className="absolute -inset-1 bg-gradient-to-r from-cyan-500/20 via-purple-500/20 to-emerald-500/20 blur-3xl opacity-50 -z-10" />
      <div className="rounded-3xl overflow-hidden border border-white/10 bg-slate-900/50 backdrop-blur-3xl shadow-2xl h-[500px] lg:h-[650px] group transition-all duration-700 hover:border-cyan-500/30">
        <div id="tradingview_btc_chart" className="w-full h-full" />
      </div>
    </div>
  );
}
