import React, { useState, useEffect } from 'react';
import { BarChart3, ArrowUpDown, Search, LineChart, RefreshCw, Zap, TrendingUp, TrendingDown } from 'lucide-react';
import { getOpeningRvolDashboard } from '../services/api';

export default function OpeningRvolView({ onSelectStock, refreshTrigger }) {
  const [timeframe, setTimeframe] = useState('5m');
  const [sortOrder, setSortOrder] = useState('asc'); // 'asc' or 'desc'
  const [searchTerm, setSearchTerm] = useState('');
  
  const [stocks, setStocks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isBaseline, setIsBaseline] = useState(false); // true when showing placeholder data
  const [liveRetryCount, setLiveRetryCount] = useState(0);
  const MAX_LIVE_RETRIES = 5;

  const fetchDashboard = async (silent = false) => {
    if (!silent) setLoading(true);
    const data = await getOpeningRvolDashboard(timeframe, sortOrder);
    if (data && data.results && data.results.length > 0) {
      setStocks(data.results);
      // Detect if backend returned baseline placeholder data (all prices are 500.0)
      const looksLikeBaseline = data.results.slice(0, 5).every(r => r.price === 500.0);
      setIsBaseline(looksLikeBaseline);
    }
    if (!silent) setLoading(false);
  };

  useEffect(() => {
    setIsBaseline(false);
    setLiveRetryCount(0);
    fetchDashboard();
  }, [timeframe, sortOrder]);

  // Auto-retry in background when baseline placeholder data is detected
  useEffect(() => {
    if (!isBaseline || liveRetryCount >= MAX_LIVE_RETRIES) return;
    const timer = setTimeout(() => {
      setLiveRetryCount(c => c + 1);
      fetchDashboard(true); // silent = no spinner
    }, 8000); // retry after 8 seconds
    return () => clearTimeout(timer);
  }, [isBaseline, liveRetryCount, timeframe, sortOrder]);

  // Search filter
  const filteredStocks = stocks.filter(stk => 
    stk.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    stk.symbol.toLowerCase().includes(searchTerm.toLowerCase()) ||
    stk.sector.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const lowestRvol = stocks.length > 0 ? [...stocks].sort((a,b) => a.rvolRatio - b.rvolRatio)[0] : null;
  const highestRvol = stocks.length > 0 ? [...stocks].sort((a,b) => b.rvolRatio - a.rvolRatio)[0] : null;
  const avgRatio = stocks.length > 0 ? (stocks.reduce((acc, s) => acc + s.rvolRatio, 0) / stocks.length).toFixed(2) : '1.00';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Page Header */}
      <div className="glass-card" style={{ padding: '24px', background: 'linear-gradient(135deg, #131722 0%, #1a2235 100%)', borderLeft: '4px solid var(--blue)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <h2 style={{ fontSize: '1.5rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <BarChart3 size={24} color="var(--blue)" /> Opening 1st Candle Volume Dashboard (20-Day Comparison)
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '4px' }}>
              Compares today's opening 1st candle volume ({timeframe === '5m' ? '9:15-9:20 AM' : '9:15-9:30 AM'}) against the 20-day average opening 1st candle volume for <strong>NSE F&O Stocks</strong>. Listed in <strong>{sortOrder === 'asc' ? 'Ascending Order (Lowest to Highest)' : 'Descending Order (Highest to Lowest)'}</strong>.
            </p>
          </div>

          <button className="btn-secondary" onClick={fetchDashboard} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'spin' : ''} /> {loading ? 'Computing...' : 'Refresh RVOL Data'}
          </button>
        </div>
      </div>

      {/* Live Data Loading Banner */}
      {isBaseline && liveRetryCount < MAX_LIVE_RETRIES && (
        <div style={{ padding: '12px 20px', borderRadius: '10px', background: 'rgba(255, 165, 0, 0.1)', border: '1px solid rgba(255, 165, 0, 0.3)', display: 'flex', alignItems: 'center', gap: '12px', fontSize: '0.9rem' }}>
          <RefreshCw size={16} className="spin" color="#FFA500" style={{ flexShrink: 0 }} />
          <span style={{ color: '#FFA500' }}>
            <strong>Fetching live FYERS data...</strong> Showing 20-day baseline averages while live data loads (attempt {liveRetryCount + 1}/{MAX_LIVE_RETRIES}).
          </span>
        </div>
      )}

      {/* Summary Metric Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
        <div className="glass-card" style={{ padding: '16px' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Analyzed Stocks</span>
          <div className="mono" style={{ fontSize: '1.5rem', fontWeight: 700, color: '#fff', marginTop: '4px' }}>
            {stocks.length} F&O Stocks
          </div>
          <span style={{ fontSize: '0.75rem', color: 'var(--blue)' }}>Timeframe: {timeframe}</span>
        </div>

        <div className="glass-card" style={{ padding: '16px' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Lowest 1st Vol Ratio</span>
          {lowestRvol ? (
            <div style={{ marginTop: '4px' }}>
              <div style={{ fontWeight: 600, fontSize: '0.95rem', color: '#fff' }}>{lowestRvol.name}</div>
              <span className="badge-red" style={{ fontSize: '0.85rem' }}>{lowestRvol.rvolRatio}x (Lowest)</span>
            </div>
          ) : <div style={{ color: 'var(--text-muted)' }}>-</div>}
        </div>

        <div className="glass-card" style={{ padding: '16px' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Highest 1st Vol Ratio</span>
          {highestRvol ? (
            <div style={{ marginTop: '4px' }}>
              <div style={{ fontWeight: 600, fontSize: '0.95rem', color: '#fff' }}>{highestRvol.name}</div>
              <span className="badge-green" style={{ fontSize: '0.85rem' }}>+{highestRvol.rvolRatio}x (Highest)</span>
            </div>
          ) : <div style={{ color: 'var(--text-muted)' }}>-</div>}
        </div>

        <div className="glass-card" style={{ padding: '16px' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Market Avg RVOL</span>
          <div className="mono" style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--gold)', marginTop: '4px' }}>
            {avgRatio}x Average
          </div>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>20-Day Baseline</span>
        </div>
      </div>

      {/* Control Toolbar: Timeframe + Sort + Search */}
      <div className="glass-card" style={{ padding: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          {/* Timeframe selector tabs */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600 }}>1st Candle Timeframe:</span>
            <div className="nav-tabs">
              <button 
                className={`nav-btn ${timeframe === '5m' ? 'active' : ''}`}
                onClick={() => setTimeframe('5m')}
              >
                5 Minutes (9:15 AM)
              </button>
              <button 
                className={`nav-btn ${timeframe === '15m' ? 'active' : ''}`}
                onClick={() => setTimeframe('15m')}
              >
                15 Minutes (9:15 AM)
              </button>
            </div>
          </div>

          {/* Sort order & Search */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <button 
              className="btn-secondary" 
              onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
              style={{ padding: '8px 14px' }}
            >
              <ArrowUpDown size={14} /> Sort: {sortOrder === 'asc' ? 'Ascending (Lowest -> Highest)' : 'Descending (Highest -> Lowest)'}
            </button>

            <div style={{ position: 'relative' }}>
              <Search size={14} color="var(--text-muted)" style={{ position: 'absolute', left: '10px', top: '10px' }} />
              <input 
                type="text" 
                className="text-input" 
                style={{ paddingLeft: '32px', width: '220px' }} 
                placeholder="Search stock or sector..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Main Results Table */}
      <div className="glass-card" style={{ padding: '24px' }}>
        {loading ? (
          <div style={{ padding: '40px 24px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px' }}>
            <div style={{ position: 'relative', width: '56px', height: '56px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ position: 'absolute', width: '100%', height: '100%', borderRadius: '50%', border: '3px solid rgba(0, 240, 144, 0.15)', borderTopColor: '#00f090', animation: 'spin 1s linear infinite' }}></div>
              <BarChart3 size={24} color="#00f090" />
            </div>
            <div>
              <div style={{ fontWeight: 600, fontSize: '1.05rem', color: '#fff', marginBottom: '4px' }}>
                Initializing NIFTY 50 Opening RVOL Dashboard...
              </div>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                Connecting to FYERS API & loading pre-computed 20-day opening volume baselines
              </div>
            </div>
            {/* Animated Skeleton rows preview */}
            <div style={{ width: '100%', marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} style={{ height: '44px', width: '100%', background: 'linear-gradient(90deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.03) 100%)', borderRadius: '6px' }} />
              ))}
            </div>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: '50px' }}>Rank</th>
                <th>Symbol & Company Name</th>
                <th>Sector</th>
                <th>Price</th>
                <th>Change %</th>
                <th>Today 1st Vol</th>
                <th>20-Day Avg 1st Vol</th>
                <th>Volume Ratio</th>
                <th>Signal</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredStocks.map((stk, idx) => {
                const ratio = stk.rvolRatio;
                let badgeClass = 'badge-red';
                if (ratio >= 1.5) badgeClass = 'badge-green';
                else if (ratio >= 0.8) badgeClass = 'badge-gold';

                return (
                  <tr key={stk.symbol}>
                    <td className="mono" style={{ color: 'var(--text-muted)', fontWeight: 600 }}>#{idx + 1}</td>
                    <td>
                      <div style={{ fontWeight: 600, color: '#fff' }}>{stk.name}</div>
                      <div className="mono" style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{stk.symbol}</div>
                    </td>
                    <td><span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{stk.sector}</span></td>
                    <td className="mono" style={{ fontWeight: 600 }}>₹{stk.price}</td>
                    <td>
                      <span className={stk.changePct >= 0 ? 'badge-green' : 'badge-red'}>
                        {stk.changePct >= 0 ? `+${stk.changePct}%` : `${stk.changePct}%`}
                      </span>
                    </td>
                    <td className="mono" style={{ fontWeight: 600, color: '#fff' }}>{(stk.today1stVol / 1000).toFixed(0)}k</td>
                    <td className="mono" style={{ color: 'var(--text-muted)' }}>{(stk.avg20Day1stVol / 1000).toFixed(0)}k</td>
                    <td>
                      <span 
                        className={badgeClass} 
                        style={{ 
                          fontSize: '0.85rem', 
                          fontWeight: 700, 
                          padding: '4px 10px',
                          background: ratio < 0.8 ? 'rgba(255,59,87,0.15)' : ratio >= 1.5 ? 'rgba(0,240,144,0.15)' : 'rgba(255,183,3,0.15)',
                          color: ratio < 0.8 ? 'var(--red)' : ratio >= 1.5 ? 'var(--green)' : 'var(--gold)',
                          border: `1px solid ${ratio < 0.8 ? 'rgba(255,59,87,0.3)' : ratio >= 1.5 ? 'rgba(0,240,144,0.3)' : 'rgba(255,183,3,0.3)'}`
                        }}
                      >
                        {ratio.toFixed(2)}x
                      </span>
                    </td>
                    <td>
                      <span style={{ fontSize: '0.75rem', fontWeight: 600, color: ratio < 0.8 ? 'var(--red)' : ratio >= 1.5 ? 'var(--green)' : 'var(--gold)' }}>
                        {stk.signal}
                      </span>
                    </td>
                    <td>
                      <button 
                        className="btn-primary" 
                        style={{ padding: '4px 10px', fontSize: '0.75rem' }} 
                        onClick={() => onSelectStock(stk.symbol, stk.name)}
                      >
                        <LineChart size={14} /> Open Chart
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
