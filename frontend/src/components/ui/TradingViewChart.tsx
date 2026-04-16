export default function TradingViewChart() {
  return (
    <div className="container mx-auto px-6 mb-20 relative z-20 max-w-5xl">
      {/* Background glow effect */}
      <div className="absolute -inset-4 bg-cyan-500/10 blur-3xl opacity-30 -z-10" />
      
      <div className="rounded-3xl overflow-hidden border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-2xl h-[400px] lg:h-[500px]">
        <iframe
          src="https://s.tradingview.com/widgetembed/?frameElementId=tradingview_btc&symbol=BINANCE%3ABTCUSDT&interval=5&hidetoptoolbar=1&hidesidetoolbar=1&symboledit=1&saveimage=1&toolbarbg=f1f3f6&studies=%5B%5D&theme=dark&style=1&timezone=Etc%2FUTC&studies_overrides=%7B%7D&overrides=%7B%7D&enabled_features=%5B%5D&disabled_features=%5B%5D&locale=en&utm_source=brittrade.pages.dev&utm_medium=widget&utm_campaign=chart&utm_term=BINANCE%3ABTCUSDT"
          style={{ width: '100%', height: '100%', border: 'none' }}
          title="BTC/USDT Advanced Chart"
        />
      </div>
    </div>
  );
}
