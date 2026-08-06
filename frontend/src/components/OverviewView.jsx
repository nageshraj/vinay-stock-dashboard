import React, { useState, useEffect } from 'react';
import { TrendingUp, ArrowUpRight, ArrowDownRight, Activity, Eye, Zap } from 'lucide-react';
import { runScreener } from '../services/api';

export default function OverviewView({ onSelectStock, onSwitchToScreener, refreshTrigger }) {
  const [stocks, setStocks] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      const data = await runScreener('D');
      if (data && data.results) {
        setStocks(data.results);
      }
      setLoading(false);
    }
    loadData();
  }, [refreshTrigger]);

  const gainers = [...stocks].sort((a, b) => b.changePct - a.changePct).slice(0, 5);
  const losers = [...stocks].sort((a, b) => a.changePct - b.changePct).slice(0, 5);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Featured Watchlist Cards */}
      <div>
        <h3 style={{ fontSize: '1.1rem', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Activity size={18} color="var(--blue)" /> Market Leaders & Active Stocks
        </h3>

        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>Loading market snapshot...</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '16px' }}>
            {stocks.slice(0, 8).map((stk) => (
              <div 
                key={stk.symbol} 
                className="card"
                style={{ padding: '16px', cursor: 'pointer' }}
                onClick={() => onSelectStock(stk.symbol, stk.name)}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                  <div>
                    <h4 style={{ fontSize: '1rem' }}>{stk.name}</h4>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{stk.sector}</span>
                  </div>
                  <span className={stk.changePct >= 0 ? 'badge-green' : 'badge-red'}>
                    {stk.changePct >= 0 ? `+${stk.changePct}%` : `${stk.changePct}%`}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: '12px' }}>
                  <div>
                    <div className="mono" style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-heading)' }}>
                      ₹{stk.price.toLocaleString()}
                    </div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Vol: {(stk.volume / 1000).toFixed(0)}k</span>
                  </div>
                  <button className="btn-secondary" style={{ padding: '4px 8px', fontSize: '0.75rem' }}>
                    <Eye size={14} /> Chart
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Gainers & Losers Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '20px' }}>
        {/* Top Gainers */}
        <div className="card" style={{ padding: '20px' }}>
          <h3 style={{ fontSize: '1rem', color: 'var(--green)', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <ArrowUpRight size={18} /> Top Gainers Today
          </h3>
          <table className="data-table">
            <thead>
              <tr>
                <th>Symbol</th>
                <th>Price</th>
                <th>Change %</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {gainers.map((stk) => (
                <tr key={stk.symbol}>
                  <td style={{ fontWeight: 600 }}>{stk.name}</td>
                  <td className="mono">₹{stk.price}</td>
                  <td><span className="badge-green">+{stk.changePct}%</span></td>
                  <td>
                    <button className="btn-secondary" style={{ padding: '2px 8px', fontSize: '0.75rem' }} onClick={() => onSelectStock(stk.symbol, stk.name)}>
                      View Chart
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Top Losers */}
        <div className="card" style={{ padding: '20px' }}>
          <h3 style={{ fontSize: '1rem', color: 'var(--red)', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <ArrowDownRight size={18} /> Top Losers Today
          </h3>
          <table className="data-table">
            <thead>
              <tr>
                <th>Symbol</th>
                <th>Price</th>
                <th>Change %</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {losers.map((stk) => (
                <tr key={stk.symbol}>
                  <td style={{ fontWeight: 600 }}>{stk.name}</td>
                  <td className="mono">₹{stk.price}</td>
                  <td><span className="badge-red">{stk.changePct}%</span></td>
                  <td>
                    <button className="btn-secondary" style={{ padding: '2px 8px', fontSize: '0.75rem' }} onClick={() => onSelectStock(stk.symbol, stk.name)}>
                      View Chart
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
