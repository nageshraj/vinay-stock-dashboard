import React, { useState, useEffect } from 'react';
import { BarChart3, Search, LineChart, RefreshCw, X } from 'lucide-react';
import { getOpeningRvolDashboard, clearScreenerCache } from '../services/api';

export default function OpeningRvolView({ onSelectStock, refreshTrigger }) {
  const [timeframe, setTimeframe] = useState('5m');
  const [searchTerm, setSearchTerm] = useState('');
  
  const [stocks, setStocks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isBaseline, setIsBaseline] = useState(false); // true when showing placeholder data
  const [liveRetryCount, setLiveRetryCount] = useState(0);
  const [sortConfig, setSortConfig] = useState({ key: 'rvolRatio', direction: 'desc' });
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const MAX_LIVE_RETRIES = 5;

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

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

  const handleForceRefresh = async () => {
    setLoading(true);
    try {
      await clearScreenerCache();
      setIsBaseline(true);
      setLiveRetryCount(0);
      await fetchDashboard(true);
    } catch (err) {
      console.error('Error in force refresh:', err);
    }
    setLoading(false);
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
      <div style={{ 
        padding: isMobile ? '16px' : '24px', 
        background: 'var(--bg-card)', 
        border: '1px solid var(--border-color)', 
        borderRadius: '12px' 
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h2 style={{ fontSize: isMobile ? '1.2rem' : '1.5rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <BarChart3 size={isMobile ? 20 : 24} color="var(--blue)" /> Opening RVOL
            </h2>
          </div>

          <div style={{ display: 'flex', gap: '8px', width: isMobile ? '100%' : 'auto' }}>
            <button 
              className="btn-secondary" 
              onClick={handleForceRefresh} 
              disabled={loading} 
              style={{ 
                borderColor: 'var(--red)', 
                color: 'var(--red)', 
                flex: isMobile ? 1 : 'none', 
                justifyContent: 'center',
                fontSize: isMobile ? '0.75rem' : '0.875rem',
                padding: isMobile ? '8px' : '6px 12px'
              }}
            >
              <RefreshCw size={12} className={loading ? 'spin' : ''} /> {isMobile ? 'Force' : 'Force Live Refresh'}
            </button>
            <button 
              className="btn-secondary" 
              onClick={() => fetchDashboard()} 
              disabled={loading}
              style={{ 
                flex: isMobile ? 1 : 'none', 
                justifyContent: 'center',
                fontSize: isMobile ? '0.75rem' : '0.875rem',
                padding: isMobile ? '8px' : '6px 12px'
              }}
            >
              <RefreshCw size={12} className={loading ? 'spin' : ''} /> Refresh
            </button>
          </div>
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
      <div style={{ 
        padding: isMobile ? '16px' : '20px', 
        background: 'var(--bg-card)', 
        border: '1px solid var(--border-color)', 
        borderRadius: '12px' 
      }}>
        <div style={{ 
          display: 'flex', 
          flexDirection: isMobile ? 'column' : 'row', 
          justifyContent: 'space-between', 
          alignItems: isMobile ? 'stretch' : 'center', 
          gap: '16px' 
        }}>
          {/* Segmented Switcher */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>1st Candle Timeframe</span>
            <div style={{ 
              display: 'flex', 
              background: '#f1f5f9', 
              padding: '4px', 
              borderRadius: '8px', 
              border: '1px solid #e2e8f0',
              width: isMobile ? '100%' : '320px'
            }}>
              <button 
                style={{
                  flex: 1,
                  background: timeframe === '5m' ? '#ffffff' : 'transparent',
                  color: timeframe === '5m' ? 'var(--blue)' : 'var(--text-muted)',
                  border: 'none',
                  outline: 'none',
                  padding: '6px 12px',
                  borderRadius: '6px',
                  fontSize: '0.75rem',
                  fontWeight: timeframe === '5m' ? '700' : '500',
                  cursor: 'pointer',
                  boxShadow: timeframe === '5m' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                  transition: 'all 0.15s ease'
                }}
                onClick={() => setTimeframe('5m')}
              >
                5 Min (9:15 AM)
              </button>
              <button 
                style={{
                  flex: 1,
                  background: timeframe === '15m' ? '#ffffff' : 'transparent',
                  color: timeframe === '15m' ? 'var(--blue)' : 'var(--text-muted)',
                  border: 'none',
                  outline: 'none',
                  padding: '6px 12px',
                  borderRadius: '6px',
                  fontSize: '0.75rem',
                  fontWeight: timeframe === '15m' ? '700' : '500',
                  cursor: 'pointer',
                  boxShadow: timeframe === '15m' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                  transition: 'all 0.15s ease'
                }}
                onClick={() => setTimeframe('15m')}
              >
                15 Min (9:15 AM)
              </button>
            </div>
          </div>

          {/* Custom Search Box */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: isMobile ? 1 : 'none' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>Search</span>
            <div style={{ position: 'relative', width: '100%' }}>
              <input 
                type="text" 
                className="text-input" 
                style={{ 
                  paddingLeft: '32px', 
                  paddingRight: searchTerm ? '32px' : '10px',
                  width: '100%',
                  minWidth: isMobile ? '100%' : '260px',
                  borderRadius: '8px'
                }} 
                placeholder="Search stock or sector..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              <Search size={14} color="var(--text-muted)" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
              {searchTerm && (
                <button 
                  onClick={() => setSearchTerm('')}
                  style={{ 
                    position: 'absolute', 
                    right: '10px', 
                    top: '50%', 
                    transform: 'translateY(-50%)',
                    background: 'transparent',
                    border: 'none',
                    padding: '4px',
                    cursor: 'pointer',
                    color: 'var(--text-muted)'
                  }}
                >
                  <X size={12} />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Main Results Table/List */}
      <div style={{ padding: isMobile ? '16px' : '24px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '12px' }}>
        {loading ? (
          <div style={{ padding: '40px 24px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px', color: 'var(--text-muted)' }}>
            <RefreshCw size={24} className="spin" />
            <div>Loading data...</div>
          </div>
        ) : isMobile ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {filteredStocks.length === 0 ? (
              <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>No stocks found</div>
            ) : (
              filteredStocks.map((stk, idx) => {
                const ratio = stk.rvolRatio;
                let badgeBg = 'rgba(255, 59, 87, 0.1)';
                let badgeColor = 'var(--red)';
                let borderStyle = '1px solid rgba(255, 59, 87, 0.2)';
                if (ratio >= 1.5) {
                  badgeBg = 'rgba(16, 185, 129, 0.1)';
                  badgeColor = 'var(--green)';
                  borderStyle = '1px solid rgba(16, 185, 129, 0.2)';
                } else if (ratio >= 0.8) {
                  badgeBg = 'rgba(217, 119, 6, 0.1)';
                  badgeColor = 'var(--gold)';
                  borderStyle = '1px solid rgba(217, 119, 6, 0.2)';
                }

                return (
                  <div 
                    key={stk.symbol}
                    className="card"
                    onClick={() => onSelectStock(stk.symbol, stk.name)}
                    style={{ 
                      padding: '14px', 
                      cursor: 'pointer',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      border: '1px solid var(--border-color)',
                      borderRadius: '10px',
                      background: 'var(--bg-card)'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: '0' }}>
                      <div style={{ 
                        fontFamily: 'var(--font-mono)', 
                        fontSize: '0.8rem', 
                        fontWeight: 700, 
                        color: 'var(--text-muted)',
                        background: '#f1f5f9',
                        width: '28px',
                        height: '28px',
                        borderRadius: '6px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0
                      }}>
                        {idx + 1}
                      </div>
                      <div style={{ minWidth: '0' }}>
                        <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-heading)' }}>
                          {stk.name}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                          {stk.sector}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
                      <div style={{ textAlign: 'right' }}>
                        <div className="mono" style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-heading)' }}>
                          ₹{stk.price}
                        </div>
                        <div style={{ marginTop: '2px' }}>
                          <span className={stk.changePct >= 0 ? 'badge-green' : 'badge-red'} style={{ fontSize: '0.7rem', padding: '1px 5px' }}>
                            {stk.changePct >= 0 ? `+${stk.changePct}%` : `${stk.changePct}%`}
                          </span>
                        </div>
                      </div>

                      <div 
                        style={{ 
                          background: badgeBg, 
                          color: badgeColor, 
                          border: borderStyle,
                          borderRadius: '6px',
                          padding: '6px 8px',
                          textAlign: 'center',
                          minWidth: '58px'
                        }}
                      >
                        <div style={{ fontSize: '0.8rem', fontWeight: 800 }}>{ratio.toFixed(2)}x</div>
                        <div style={{ fontSize: '0.55rem', fontWeight: 600, textTransform: 'uppercase', opacity: 0.8 }}>RVOL</div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: '50px' }}>Rank</th>
                <th className="sticky-col-symbol" style={{ cursor: 'pointer' }} onClick={() => handleSort('name')}>Symbol {sortConfig.key === 'name' && (sortConfig.direction === 'asc' ? '↑' : '↓')}</th>
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
                    <td className="sticky-col-symbol">
                      <div style={{ fontWeight: 600, color: 'var(--text-heading)' }}>{stk.name}</div>
                      <div className="mono" style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{stk.symbol}</div>
                    </td>
                    <td><span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{stk.sector}</span></td>
                    <td className="mono" style={{ fontWeight: 600 }}>₹{stk.price}</td>
                    <td>
                      <span className={stk.changePct >= 0 ? 'badge-green' : 'badge-red'}>
                        {stk.changePct >= 0 ? `+${stk.changePct}%` : `${stk.changePct}%`}
                      </span>
                    </td>
                    <td className="mono" style={{ fontWeight: 600, color: 'var(--text-heading)' }}>{(stk.today1stVol / 1000).toFixed(0)}k</td>
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
