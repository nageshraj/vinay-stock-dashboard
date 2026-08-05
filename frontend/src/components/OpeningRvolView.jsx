import React, { useState, useEffect } from 'react';
import { BarChart3, Search, LineChart, RefreshCw } from 'lucide-react';
import { getOpeningRvolDashboard } from '../services/api';

export default function OpeningRvolView({ onSelectStock, refreshTrigger }) {
  const [timeframe, setTimeframe] = useState('5m');
  const [searchTerm, setSearchTerm] = useState('');
  
  const [stocks, setStocks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isBaseline, setIsBaseline] = useState(false); // true when showing placeholder data
  const [liveRetryCount, setLiveRetryCount] = useState(0);
  const [sortConfig, setSortConfig] = useState({ key: 'rvolRatio', direction: 'desc' });
  const MAX_LIVE_RETRIES = 5;

  const fetchDashboard = async (silent = false) => {
    if (!silent) setLoading(true);
    const data = await getOpeningRvolDashboard(timeframe, 'desc');
    if (data && data.results && data.results.length > 0) {
      setStocks(data.results);
      // Detect if backend returned any placeholder rows (not backed by a live fetch) —
      // matches the backend's _looks_like_baseline semantics (any non-live row)
      const looksLikeBaseline = data.results.some(r => !r.is_live);
      setIsBaseline(looksLikeBaseline);
    }
    if (!silent) setLoading(false);
  };

  useEffect(() => {
    setIsBaseline(false);
    setLiveRetryCount(0);
    fetchDashboard();
  }, [timeframe]);

  // Auto-retry in background when baseline placeholder data is detected
  useEffect(() => {
    if (!isBaseline || liveRetryCount >= MAX_LIVE_RETRIES) return;
    const timer = setTimeout(() => {
      setLiveRetryCount(c => c + 1);
      fetchDashboard(true); // silent = no spinner
    }, 8000); // retry after 8 seconds
    return () => clearTimeout(timer);
  }, [isBaseline, liveRetryCount, timeframe]);

  const handleSort = (key) => {
    let direction = 'desc';
    if (sortConfig.key === key && sortConfig.direction === 'desc') {
      direction = 'asc';
    }
    setSortConfig({ key, direction });
  };

  // Sort and Search filter
  const sortedStocks = React.useMemo(() => {
    let sortableStocks = [...stocks];
    if (sortConfig !== null) {
      sortableStocks.sort((a, b) => {
        if (a[sortConfig.key] < b[sortConfig.key]) {
          return sortConfig.direction === 'asc' ? -1 : 1;
        }
        if (a[sortConfig.key] > b[sortConfig.key]) {
          return sortConfig.direction === 'asc' ? 1 : -1;
        }
        return 0;
      });
    }
    return sortableStocks;
  }, [stocks, sortConfig]);

  const filteredStocks = sortedStocks.filter(stk =>
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
      <div style={{ padding: '24px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <h2 style={{ fontSize: '1.5rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <BarChart3 size={24} color="var(--blue)" /> Opening RVOL
            </h2>
          </div>

          <button className="btn-secondary" onClick={fetchDashboard} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'spin' : ''} /> {loading ? 'Loading...' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Live Data Loading Banner */}
      {isBaseline && liveRetryCount < MAX_LIVE_RETRIES && (
        <div style={{ padding: '12px 20px', borderRadius: '10px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '12px', fontSize: '0.9rem' }}>
          <RefreshCw size={16} className="spin" color="var(--text-muted)" style={{ flexShrink: 0 }} />
          <span style={{ color: 'var(--text-muted)' }}>
            Fetching live data... (attempt {liveRetryCount + 1}/{MAX_LIVE_RETRIES}).
          </span>
        </div>
      )}

      {/* Control Toolbar: Timeframe + Search */}
      <div style={{ padding: '20px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '12px' }}>
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

          {/* Search */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
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
      <div style={{ padding: '24px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '12px' }}>
        {loading ? (
          <div style={{ padding: '40px 24px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px', color: 'var(--text-muted)' }}>
            <RefreshCw size={24} className="spin" />
            <div>Loading data...</div>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: '50px' }}>Rank</th>
                <th style={{ cursor: 'pointer' }} onClick={() => handleSort('name')}>Symbol & Company Name {sortConfig.key === 'name' && (sortConfig.direction === 'asc' ? '↑' : '↓')}</th>
                <th style={{ cursor: 'pointer' }} onClick={() => handleSort('sector')}>Sector {sortConfig.key === 'sector' && (sortConfig.direction === 'asc' ? '↑' : '↓')}</th>
                <th style={{ cursor: 'pointer' }} onClick={() => handleSort('price')}>Price {sortConfig.key === 'price' && (sortConfig.direction === 'asc' ? '↑' : '↓')}</th>
                <th style={{ cursor: 'pointer' }} onClick={() => handleSort('changePct')}>Change % {sortConfig.key === 'changePct' && (sortConfig.direction === 'asc' ? '↑' : '↓')}</th>
                <th style={{ cursor: 'pointer' }} onClick={() => handleSort('today1stVol')}>Today 1st Vol {sortConfig.key === 'today1stVol' && (sortConfig.direction === 'asc' ? '↑' : '↓')}</th>
                <th style={{ cursor: 'pointer' }} onClick={() => handleSort('avg20Day1stVol')}>20-Day Avg 1st Vol {sortConfig.key === 'avg20Day1stVol' && (sortConfig.direction === 'asc' ? '↑' : '↓')}</th>
                <th style={{ cursor: 'pointer' }} onClick={() => handleSort('rvolRatio')}>Volume Ratio {sortConfig.key === 'rvolRatio' && (sortConfig.direction === 'asc' ? '↑' : '↓')}</th>
                <th style={{ cursor: 'pointer' }} onClick={() => handleSort('signal')}>Signal {sortConfig.key === 'signal' && (sortConfig.direction === 'asc' ? '↑' : '↓')}</th>
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
