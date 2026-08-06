import React, { useEffect, useRef, useState } from 'react';
import { X, RefreshCw, BarChart2, Layers } from 'lucide-react';
import { createChart } from 'lightweight-charts';
import { getStockCandles } from '../services/api';

export default function StockChartModal({ symbol, name, onClose }) {
  const chartContainerRef = useRef(null);
  const chartInstance = useRef(null);
  const legendRef = useRef(null);

  const [timeframe, setTimeframe] = useState('15m');
  const [loading, setLoading] = useState(true);
  const [showEma20, setShowEma20] = useState(true);
  const [showEma50, setShowEma50] = useState(true);
  const [stockInfo, setStockInfo] = useState({ price: 0, changePct: 0, high: 0, low: 0, volume: 0 });

  useEffect(() => {
    if (!symbol || !chartContainerRef.current) return;

    let isMounted = true;
    const containerElement = chartContainerRef.current;
    let doubleClickHandler = null;
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
        },
        watermark: {
          visible: true,
          fontSize: 32,
          horzAlign: 'center',
          vertAlign: 'center',
          color: 'rgba(255, 255, 255, 0.04)',
          text: `${symbol.replace('NSE:', '').replace('-EQ', '')} (${timeframe})`
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

      const isIntraday = timeframe !== 'D';
      const offset = isIntraday ? 19800 : 0; // +5:30 offset in seconds

      const formattedCandles = candles.map(c => ({
        time: isIntraday ? c.time + offset : c.time,
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
        time: isIntraday ? c.time + offset : c.time,
        value: c.volume,
        color: c.close >= c.open ? 'rgba(0, 240, 144, 0.3)' : 'rgba(255, 59, 87, 0.3)'
      })));

      // Volume MA (20) Overlay Line
      const volumeMaSeries = chart.addLineSeries({
        color: 'rgba(255, 183, 3, 0.7)', // Semi-transparent gold/yellow
        lineWidth: 1.5,
        priceScaleId: '',
        title: 'Volume MA (20)',
        scaleMargins: { top: 0.8, bottom: 0 }
      });

      volumeMaSeries.setData(candles.filter(c => c.volume_ma !== undefined && c.volume_ma !== null).map(c => ({
        time: isIntraday ? c.time + offset : c.time,
        value: c.volume_ma
      })));

      // EMA 20 Overlay Line
      let ema20Series = null;
      if (showEma20) {
        ema20Series = chart.addLineSeries({
          color: '#2962ff',
          lineWidth: 2,
          title: 'EMA 20'
        });
        ema20Series.setData(candles.filter(c => c.ema20 !== null).map(c => ({ time: isIntraday ? c.time + offset : c.time, value: c.ema20 })));
      }

      // EMA 50 Overlay Line
      let ema50Series = null;
      if (showEma50) {
        ema50Series = chart.addLineSeries({
          color: '#ffb703',
          lineWidth: 2,
          title: 'EMA 50'
        });
        ema50Series.setData(candles.filter(c => c.ema50 !== null).map(c => ({ time: isIntraday ? c.time + offset : c.time, value: c.ema50 })));
      }

      // Optimize default zoom / visible candles based on standard industry views
      const visibleBarsMap = {
        '5m': 50,    // ~half a trading day
        '15m': 60,   // ~2 trading days
        '1h': 70,    // ~2 weeks
        'D': 90      // ~4 months
      };
      const defaultVisibleBars = visibleBarsMap[timeframe] || 60;

      if (candles.length > defaultVisibleBars) {
        chart.timeScale().setVisibleLogicalRange({
          from: candles.length - defaultVisibleBars,
          to: candles.length
        });
      } else {
        chart.timeScale().fitContent();
      }

      // Legend Update Logic (formatted like Dhan/Zerodha hover legend)
      const formatVol = (val) => {
        if (val === undefined || val === null || isNaN(val)) return 'N/A';
        if (val >= 1000000) return (val / 1000000).toFixed(2) + 'M';
        if (val >= 1000) return (val / 1000).toFixed(2) + 'K';
        return val.toFixed(0);
      };

      const updateLegend = (bar, vol, volMa, ema20Val, ema50Val) => {
        if (!legendRef.current) return;
        
        let html = '';
        if (bar) {
          const isGreen = bar.close >= bar.open;
          const colorClass = isGreen ? '#00f090' : '#ff3b57';
          const change = bar.close - bar.open;
          const changePct = ((change / bar.open) * 100).toFixed(2);
          const sign = change >= 0 ? '+' : '';

          html += `
            <div style="display: flex; align-items: center; gap: 4px; margin-right: 12px; flex-wrap: wrap;">
              <span style="color: var(--text-muted)">O</span> <span style="color: ${colorClass}; font-weight: 600;">${bar.open.toFixed(2)}</span>
              <span style="color: var(--text-muted); margin-left: 4px;">H</span> <span style="color: ${colorClass}; font-weight: 600;">${bar.high.toFixed(2)}</span>
              <span style="color: var(--text-muted); margin-left: 4px;">L</span> <span style="color: ${colorClass}; font-weight: 600;">${bar.low.toFixed(2)}</span>
              <span style="color: var(--text-muted); margin-left: 4px;">C</span> <span style="color: ${colorClass}; font-weight: 600;">${bar.close.toFixed(2)}</span>
              <span style="color: ${colorClass}; font-weight: 600; font-size: 0.72rem; margin-left: 4px;">(${sign}${changePct}%)</span>
            </div>
          `;
        }
        
        if (vol !== undefined && vol !== null) {
          const volStr = formatVol(vol);
          const volMaStr = volMa !== undefined && volMa !== null ? formatVol(volMa) : 'N/A';
          html += `
            <div style="display: flex; align-items: center; gap: 4px; margin-right: 12px; flex-wrap: wrap;">
              <span style="color: var(--text-muted)">Vol:</span> <span style="color: #26a69a; font-weight: 600;">${volStr}</span>
              <span style="color: var(--text-muted); margin-left: 6px;">Vol MA(20):</span> <span style="color: #ffb703; font-weight: 600;">${volMaStr}</span>
            </div>
          `;
        }

        let emaHtml = '';
        if (showEma20 && ema20Val !== undefined && ema20Val !== null) {
          emaHtml += `<span style="color: #2962ff; font-weight: 600; margin-right: 8px;">EMA 20: ${ema20Val.toFixed(2)}</span>`;
        }
        if (showEma50 && ema50Val !== undefined && ema50Val !== null) {
          emaHtml += `<span style="color: #ffb703; font-weight: 600;">EMA 50: ${ema50Val.toFixed(2)}</span>`;
        }
        if (emaHtml) {
          html += `
            <div style="display: flex; align-items: center; gap: 4px; border-left: 1px solid #2a2e39; padding-left: 12px; flex-wrap: wrap;">
              ${emaHtml}
            </div>
          `;
        }

        legendRef.current.innerHTML = html;
      };

      // Set initial values (using the latest candle in the array)
      const latestCandle = candles[candles.length - 1];
      if (latestCandle) {
        const latestFormattedBar = formattedCandles[formattedCandles.length - 1];
        updateLegend(
          latestFormattedBar,
          latestCandle.volume,
          latestCandle.volume_ma,
          latestCandle.ema20,
          latestCandle.ema50
        );
      }

      // Subscribe to Crosshair Movement
      chart.subscribeCrosshairMove(param => {
        if (param.time) {
          const bar = param.seriesData.get(candlestickSeries);
          const volData = param.seriesData.get(volumeSeries);
          const vol = volData ? volData.value : null;
          const volMaData = param.seriesData.get(volumeMaSeries);
          const volMa = volMaData ? volMaData.value : null;
          
          let ema20Val = null;
          if (showEma20 && ema20Series) {
            const e20 = param.seriesData.get(ema20Series);
            ema20Val = e20 ? e20.value : null;
          }
          let ema50Val = null;
          if (showEma50 && ema50Series) {
            const e50 = param.seriesData.get(ema50Series);
            ema50Val = e50 ? e50.value : null;
          }

          updateLegend(bar, vol, volMa, ema20Val, ema50Val);
        } else {
          // Fallback to latest candle values
          const latestCandle = candles[candles.length - 1];
          if (latestCandle) {
            const latestFormattedBar = formattedCandles[formattedCandles.length - 1];
            updateLegend(
              latestFormattedBar,
              latestCandle.volume,
              latestCandle.volume_ma,
              latestCandle.ema20,
              latestCandle.ema50
            );
          }
        }
      });

      // Handle Resize with ResizeObserver
      const resizeObserver = new ResizeObserver(entries => {
        if (entries.length === 0 || entries[0].target !== chartContainerRef.current) { return; }
        const newRect = entries[0].contentRect;
        if (chartInstance.current) {
            chartInstance.current.applyOptions({ width: newRect.width });
        }
      });
      resizeObserver.observe(chartContainerRef.current);

      // Double Click to Reset Zoom (Dhan/Zerodha style double-click to reset view)
      doubleClickHandler = () => {
        if (chartInstance.current) {
          if (candles.length > defaultVisibleBars) {
            chartInstance.current.timeScale().setVisibleLogicalRange({
              from: candles.length - defaultVisibleBars,
              to: candles.length
            });
          } else {
            chartInstance.current.timeScale().fitContent();
          }
        }
      };
      if (containerElement) {
        containerElement.addEventListener('dblclick', doubleClickHandler);
      }

      chartInstance.current.resizeObserver = resizeObserver;

      setLoading(false);
    }

    renderChart();

    return () => {
      isMounted = false;
      if (containerElement && doubleClickHandler) {
        containerElement.removeEventListener('dblclick', doubleClickHandler);
      }
      if (chartInstance.current) {
        if (chartInstance.current.resizeObserver) {
            chartInstance.current.resizeObserver.disconnect();
        }
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
        <div className="chart-modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid var(--border-color)', paddingBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ flex: '1 1 auto', minWidth: '0', wordBreak: 'break-word' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <h2 style={{ fontSize: '1.4rem' }}>{name}</h2>
              <span className="mono" style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{symbol}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '4px', flexWrap: 'wrap' }}>
              <span className="mono" style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-heading)' }}>₹{stockInfo.price}</span>
              <span className={stockInfo.changePct >= 0 ? 'badge-green' : 'badge-red'}>
                {stockInfo.changePct >= 0 ? `+${stockInfo.changePct}%` : `${stockInfo.changePct}%`}
              </span>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>High: ₹{stockInfo.high} | Low: ₹{stockInfo.low}</span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
            {/* Timeframe selector */}
            <div className="nav-tabs">
              {['5m', '15m', '1h', 'D'].map((tf) => (
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
        <div style={{ display: 'flex', gap: '12px', marginBottom: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
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
        <div className="chart-container" style={{ position: 'relative', width: '100%', height: '440px' }}>
          {loading && (
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(255,255,255,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10, color: 'var(--text-muted)' }}>
              <RefreshCw size={24} className="spin" style={{ marginRight: '8px' }} /> Loading candlestick data from FYERS...
            </div>
          )}
          <div ref={legendRef} style={{
            position: 'absolute',
            top: '12px',
            left: '12px',
            zIndex: 5,
            fontSize: '0.72rem',
            fontFamily: "'Inter', sans-serif",
            color: '#d1d4dc',
            background: 'rgba(19, 23, 34, 0.85)',
            padding: '6px 12px',
            borderRadius: '6px',
            pointerEvents: 'none',
            display: 'flex',
            flexWrap: 'wrap',
            gap: '8px',
            lineHeight: '1.4',
            border: '1px solid #2a2e39',
            maxWidth: 'calc(100% - 24px)'
          }} />
          <div ref={chartContainerRef} style={{ width: '100%', height: '100%', borderRadius: '8px', overflow: 'hidden' }} />
        </div>
      </div>
    </div>
  );
}
