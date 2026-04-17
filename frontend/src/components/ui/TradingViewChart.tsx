export default function TradingViewChart() {
  const disabledFeatures = [
    'header_widget',
    'header_symbol_search',
    'header_interval_dialog_button',
    'header_indicators',
    'header_compare',
    'header_undo_redo',
    'header_screenshot',
    'header_fullscreen_button',
    'left_toolbar',
    'timeframes_toolbar',
    'edit_buttons_in_legend',
    'legend_context_menu',
    'context_menus',
    'control_bar',
    'display_market_status',
  ];

  const chartUrl = new URL('https://s.tradingview.com/widgetembed/');
  chartUrl.search = new URLSearchParams({
    frameElementId: 'tradingview_btc',
    symbol: 'BINANCE:BTCUSDT',
    interval: '5',
    theme: 'dark',
    style: '1',
    timezone: 'Etc/UTC',
    locale: 'en',
    studies: '[]',
    studies_overrides: '{}',
    overrides: JSON.stringify({
      'paneProperties.background': '#0f172a',
      'paneProperties.backgroundType': 'solid',
      'mainSeriesProperties.candleStyle.upColor': '#22c55e',
      'mainSeriesProperties.candleStyle.downColor': '#ef4444',
      'mainSeriesProperties.candleStyle.borderUpColor': '#22c55e',
      'mainSeriesProperties.candleStyle.borderDownColor': '#ef4444',
      'mainSeriesProperties.candleStyle.wickUpColor': '#22c55e',
      'mainSeriesProperties.candleStyle.wickDownColor': '#ef4444',
    }),
    enabled_features: '[]',
    disabled_features: JSON.stringify(disabledFeatures),
    hidetoptoolbar: '1',
    hidesidetoolbar: '1',
    hide_side_toolbar: '1',
    hide_top_toolbar: '1',
    hidelegend: '1',
    hidevolume: '1',
    withdateranges: '0',
    symboledit: '0',
    saveimage: '0',
    hideideas: '1',
    toolbarbg: '#0f172a',
    autosize: '1',
    utm_source: 'brittrade.pages.dev',
    utm_medium: 'widget',
    utm_campaign: 'chart',
    utm_term: 'BINANCE:BTCUSDT',
  }).toString();

  return (
    <div className="container mx-auto px-6 mb-20 relative z-20 max-w-5xl">
      {/* Background glow effect */}
      <div className="absolute -inset-4 bg-cyan-500/10 blur-3xl opacity-30 -z-10" />
      
      <div className="rounded-3xl overflow-hidden border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-2xl h-[400px] lg:h-[500px]">
        <iframe
          src={chartUrl.toString()}
          style={{ width: '100%', height: '100%', border: 'none' }}
          title="BTC/USDT Candlestick Chart"
        />
      </div>
    </div>
  );
}
