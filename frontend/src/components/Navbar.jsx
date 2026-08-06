import React from 'react';
import { TrendingUp, Filter, PieChart, ShieldCheck, ShieldAlert, RefreshCw, Clock, BarChart3 } from 'lucide-react';

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
            <TrendingUp size={22} color="var(--text-heading)" />
          </div>
          <span>ChartPulse <span className="fyers-badge" style={{ fontSize: '0.65rem', padding: '1px 5px' }}>v3</span></span>
        </div>

        <nav className="nav-tabs desktop-only">
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

        <div className="navbar-controls">
          {/* Auto Refresh Control Group */}
          <div className="auto-refresh-group">
            <Clock size={14} className="icon-blue" style={{ flexShrink: 0 }} />
            <span className="auto-refresh-label">Auto Refresh:</span>
            <select 
              className="select-input auto-refresh-select"
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
              <span className="mono auto-refresh-countdown">
                {countdown}s
              </span>
            )}

            <button 
              className="btn-secondary refresh-btn"
              onClick={onManualRefresh}
              title="Refresh data now"
            >
              <RefreshCw size={12} className={isRefreshing ? 'spin' : ''} />
            </button>
          </div>

          {/* Simple FYERS Status Badge */}
          <button 
            className={`btn-secondary fyers-status-btn ${fyersConnected ? 'connected' : 'disconnected'}`}
            onClick={onOpenAuthModal}
            title="Click to manage FYERS API credentials"
          >
            {fyersConnected ? (
              <>
                <ShieldCheck size={16} className="icon-green" />
                <span className="status-text-connected">Connected</span>
              </>
            ) : (
              <>
                <ShieldAlert size={16} className="icon-red" />
                <span className="status-text-disconnected">Not Connected</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Live Market Ticker Bar */}
      <div className="ticker-bar">
        <span className="ticker-label" style={{ fontSize: '0.7rem', fontWeight: 600, color: '#787b86', textTransform: 'uppercase' }}>MARKET INDICES</span>
        {indices.map((idx, i) => (
          <div key={i} className="ticker-item">
            <span className="ticker-name">{idx.name}</span>
            <span className="mono" style={{ color: 'var(--text-main)', fontWeight: 600 }}>{idx.value.toLocaleString()}</span>
            <span className={idx.change >= 0 ? 'badge-green' : 'badge-red'}>
              {idx.change >= 0 ? `+${idx.change}` : idx.change} ({idx.pChange >= 0 ? `+${idx.pChange}%` : `${idx.pChange}%`})
            </span>
          </div>
        ))}
      </div>

      {/* Sticky Bottom Navigation for Mobile */}
      <nav className="mobile-bottom-nav">
        <button 
          className={`mobile-nav-btn ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          <TrendingUp size={20} />
          <span>Overview</span>
        </button>
        <button 
          className={`mobile-nav-btn ${activeTab === 'rvol' ? 'active' : ''}`}
          onClick={() => setActiveTab('rvol')}
        >
          <BarChart3 size={20} />
          <span>RVOL</span>
        </button>
        <button 
          className={`mobile-nav-btn ${activeTab === 'screener' ? 'active' : ''}`}
          onClick={() => setActiveTab('screener')}
        >
          <Filter size={20} />
          <span>Screener</span>
        </button>
        <button 
          className={`mobile-nav-btn ${activeTab === 'sectors' ? 'active' : ''}`}
          onClick={() => setActiveTab('sectors')}
        >
          <PieChart size={20} />
          <span>Sectors</span>
        </button>
      </nav>
    </header>
  );
}
