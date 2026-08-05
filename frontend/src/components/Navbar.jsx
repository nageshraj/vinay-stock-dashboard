import React from 'react';
import { TrendingUp, Filter, PieChart, ShieldCheck, ShieldAlert, Zap, RefreshCw, Clock, BarChart3 } from 'lucide-react';

export default function Navbar({ 
  activeTab, 
  setActiveTab, 
  indices, 
  fyersConnected, 
  onOpenAuthModal,
  refreshInterval,
  setRefreshInterval,
  countdown,
  isRefreshing,
  onManualRefresh
}) {
  return (
    <header>
      <div className="navbar">
        <div className="brand">
          <div className="brand-icon">
            <TrendingUp size={22} color="#fff" />
          </div>
          <span>ChartPulse <span style={{ fontSize: '0.7rem', color: '#00f090', textTransform: 'uppercase', background: 'rgba(0,240,144,0.15)', padding: '2px 8px', borderRadius: '4px', border: '1px solid rgba(0,240,144,0.3)', fontWeight: 600 }}>FYERS v3</span></span>
        </div>

        <nav className="nav-tabs">
          <button 
            className={`nav-btn ${activeTab === 'overview' ? 'active' : ''}`}
            onClick={() => setActiveTab('overview')}
          >
            <TrendingUp size={16} /> Overview
          </button>
          <button 
            className={`nav-btn ${activeTab === 'rvol' ? 'active' : ''}`}
            onClick={() => setActiveTab('rvol')}
          >
            <BarChart3 size={16} /> Opening RVOL
          </button>
          <button 
            className={`nav-btn ${activeTab === 'screener' ? 'active' : ''}`}
            onClick={() => setActiveTab('screener')}
          >
            <Filter size={16} /> Screener
          </button>
          <button 
            className={`nav-btn ${activeTab === 'sectors' ? 'active' : ''}`}
            onClick={() => setActiveTab('sectors')}
          >
            <PieChart size={16} /> Sectors
          </button>
        </nav>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {/* Auto Refresh Control Group */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#0b0e14', padding: '4px 10px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
            <Clock size={14} color="var(--blue)" />
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Auto Refresh:</span>
            <select 
              className="select-input" 
              style={{ padding: '2px 6px', fontSize: '0.75rem', background: '#131722' }}
              value={refreshInterval} 
              onChange={(e) => setRefreshInterval(Number(e.target.value))}
            >
              <option value={0}>OFF</option>
              <option value={10}>10s</option>
              <option value={30}>30s</option>
              <option value={60}>1m</option>
              <option value={300}>5m</option>
            </select>

            {refreshInterval > 0 && (
              <span className="mono" style={{ fontSize: '0.75rem', color: 'var(--green)', fontWeight: 600, minWidth: '24px' }}>
                {countdown}s
              </span>
            )}

            <button 
              className="btn-secondary" 
              style={{ padding: '4px 8px', fontSize: '0.75rem' }}
              onClick={onManualRefresh}
              title="Refresh data now"
            >
              <RefreshCw size={12} className={isRefreshing ? 'spin' : ''} />
            </button>
          </div>

          {/* Simple FYERS Status Badge */}
          <button 
            className="btn-secondary" 
            onClick={onOpenAuthModal}
            style={{ 
              borderRadius: '8px',
              padding: '6px 14px',
              fontSize: '0.8rem',
              background: fyersConnected ? 'rgba(0, 240, 144, 0.12)' : 'rgba(255, 59, 87, 0.12)',
              border: `1px solid ${fyersConnected ? '#00f090' : '#ff3b57'}`,
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
            title="Click to manage FYERS API credentials"
          >
            {fyersConnected ? (
              <>
                <ShieldCheck size={16} color="#00f090" />
                <span style={{ color: '#00f090', fontWeight: 700 }}>Connected</span>
              </>
            ) : (
              <>
                <ShieldAlert size={16} color="#ff3b57" />
                <span style={{ color: '#ff3b57', fontWeight: 700 }}>Not Connected</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Live Market Ticker Bar */}
      <div className="ticker-bar">
        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#787b86', textTransform: 'uppercase' }}>MARKET INDICES</span>
        {indices.map((idx, i) => (
          <div key={i} className="ticker-item">
            <span className="ticker-name">{idx.name}</span>
            <span className="mono" style={{ color: '#fff', fontWeight: 600 }}>{idx.value.toLocaleString()}</span>
            <span className={idx.change >= 0 ? 'badge-green' : 'badge-red'}>
              {idx.change >= 0 ? `+${idx.change}` : idx.change} ({idx.pChange >= 0 ? `+${idx.pChange}%` : `${idx.pChange}%`})
            </span>
          </div>
        ))}
      </div>
    </header>
  );
}
