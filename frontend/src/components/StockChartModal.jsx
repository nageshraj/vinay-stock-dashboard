import React, { useEffect, useRef, useState } from 'react';
import { X, RefreshCw, BarChart2, Layers } from 'lucide-react';
import { createChart } from 'lightweight-charts';
import { getStockCandles } from '../services/api';

export default function StockChartModal({ symbol, name, onClose }) {
  const chartContainerRef = useRef(null);
  const chartInstance = useRef(null);

  const [timeframe, setTimeframe] = useState('D');
  const [loading, setLoading] = useState(true);
  const [showEma20, setShowEma20] = useState(true);
  const [showEma50, setShowEma50] = useState(true);
  const [stockInfo, setStockInfo] = useState({ price: 0, changePct: 0, high: 0, low: 0, volume: 0 });

  useEffect(() => {
    if (!symbol || !chartContainerRef.current) return;

    let isMounted = true;
    setLoading(true);

    // Clear previous chart
    if (chartInstance.current) {
      chartInstance.current.remove();
      chartInstance.current = null;
    }

    async function renderChart() {
      const data = await getStockCandles(symbol, timeframe);
      if (!isMounted || !data || !data.candles || data.candles.length === 0) {
        setLoading(false);
        return;
      }

      const candles = data.candles;
      const latest = candles[candles.length - 1];
      const prev = candles.length > 1 ? candles[candles.length - 2] : latest;

      setStockInfo({
        price: latest.close,
        changePct: roundNum(((latest.close - prev.close) / prev.close) * 100),
        high: latest.high,
        low: latest.low,
        volume: latest.volume
      });

      // Create Lightweight Chart instance
      const chart = createChart(chartContainerRef.current, {
        width: chartContainerRef.current.clientWidth,
        height: 440,
        layout: {
          background: { color: '#131722' },
          textColor: '#d1d4dc',
          fontFamily: "'Inter', sans-serif"
        },
        grid: {
          vertLines: { color: '#1e222d' },
          horzLines: { color: '#1e222d' }
        },
        crosshair: {
          mode: 1
        },
        rightPriceScale: {
          borderColor: '#2a2e39'
        },
        timeScale: {
          borderColor: '#2a2e39',
          timeVisible: timeframe !== 'D',
          secondsVisible: false
        }
      });

      chartInstance.current = chart;

      // Candlestick Series
      const candlestickSeries = chart.addCandlestickSeries({
        upColor: '#00f090',
        downColor: '#ff3b57',
        borderUpColor: '#00f090',
        borderDownColor: '#ff3b57',
        wickUpColor: '#00f090',
        wickDownColor: '#ff3b57'
      });

      const formattedCandles = candles.map(c => ({
        time: c.time,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close
      }));
      candlestickSeries.setData(formattedCandles);

      // Volume Series
      const volumeSeries = chart.addHistogramSeries({
        color: '#26a69a',
        priceFormat: { type: 'volume' },
        priceScaleId: '',
        scaleMargins: { top: 0.8, bottom: 0 }
      });

      volumeSeries.setData(candles.map(c => ({
        time: c.time,
        value: c.volume,
        color: c.close >= c.open ? 'rgba(0, 240, 144, 0.3)' : 'rgba(255, 59, 87, 0.3)'
      })));

      // EMA 20 Overlay Line
      if (showEma20) {
        const ema20Series = chart.addLineSeries({
          color: '#2962ff',
          lineWidth: 2,
          title: 'EMA 20'
        });
        ema20Series.setData(candles.filter(c => c.ema20 !== null).map(c => ({ time: c.time, value: c.ema20 })));
      }

      // EMA 50 Overlay Line
      if (showEma50) {
        const ema50Series = chart.addLineSeries({
          color: '#ffb703',
          lineWidth: 2,
          title: 'EMA 50'
        });
        ema50Series.setData(candles.filter(c => c.ema50 !== null).map(c => ({ time: c.time, value: c.ema50 })));
      }

      chart.timeScale().fitContent();

      // Handle Resize
      const handleResize = () => {
        if (chartContainerRef.current && chartInstance.current) {
          chartInstance.current.applyOptions({ width: chartContainerRef.current.clientWidth });
        }
      };
      window.addEventListener('resize', handleResize);

      setLoading(false);
    }

    renderChart();

    return () => {
      isMounted = false;
      if (chartInstance.current) {
        chartInstance.current.remove();
        chartInstance.current = null;
      }
    };
  }, [symbol, timeframe, showEma20, showEma50]);

  const roundNum = (n) => Math.round(n * 100) / 100;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid var(--border-color)', paddingBottom: '16px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <h2 style={{ fontSize: '1.4rem' }}>{name}</h2>
              <span className="mono" style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{symbol}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '4px' }}>
              <span className="mono" style={{ fontSize: '1.25rem', fontWeight: 700, color: '#fff' }}>₹{stockInfo.price}</span>
              <span className={stockInfo.changePct >= 0 ? 'badge-green' : 'badge-red'}>
                {stockInfo.changePct >= 0 ? `+${stockInfo.changePct}%` : `${stockInfo.changePct}%`}
              </span>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>High: ₹{stockInfo.high} | Low: ₹{stockInfo.low}</span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {/* Timeframe selector */}
            <div className="nav-tabs">
              {['15m', '1h', 'D'].map((tf) => (
                <button 
                  key={tf} 
                  className={`nav-btn ${timeframe === tf ? 'active' : ''}`}
                  onClick={() => setTimeframe(tf)}
                  style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                >
                  {tf}
                </button>
              ))}
            </div>

            <button className="btn-secondary" style={{ padding: '8px' }} onClick={onClose}>
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Indicators Overlay Toggles */}
        <div style={{ display: 'flex', gap: '12px', marginBottom: '12px', alignItems: 'center' }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Layers size={14} /> Technical Overlays:
          </span>
          <button 
            className="btn-secondary" 
            style={{ 
              padding: '2px 8px', 
              fontSize: '0.75rem', 
              borderColor: showEma20 ? '#2962ff' : 'var(--border-color)',
              color: showEma20 ? '#2962ff' : 'var(--text-muted)'
            }}
            onClick={() => setShowEma20(!showEma20)}
          >
            EMA 20
          </button>
          <button 
            className="btn-secondary" 
            style={{ 
              padding: '2px 8px', 
              fontSize: '0.75rem', 
              borderColor: showEma50 ? '#ffb703' : 'var(--border-color)',
              color: showEma50 ? '#ffb703' : 'var(--text-muted)'
            }}
            onClick={() => setShowEma50(!showEma50)}
          >
            EMA 50
          </button>
        </div>

        {/* TradingView Chart Canvas */}
        <div style={{ position: 'relative', width: '100%', height: '440px' }}>
          {loading && (
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(19,23,34,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10, color: 'var(--text-muted)' }}>
              <RefreshCw size={24} className="spin" style={{ marginRight: '8px' }} /> Loading candlestick data from FYERS...
            </div>
          )}
          <div ref={chartContainerRef} style={{ width: '100%', height: '100%', borderRadius: '8px', overflow: 'hidden' }} />
        </div>
      </div>
    </div>
  );
}
