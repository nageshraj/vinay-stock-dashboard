import React, { useState, useEffect } from 'react';
import { PieChart, TrendingUp, TrendingDown, Eye } from 'lucide-react';
import { getSectors } from '../services/api';

export default function SectorView({ onSelectStock, refreshTrigger }) {
  const [sectors, setSectors] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadSectors() {
      setLoading(true);
      const data = await getSectors();
      setSectors(data);
      setLoading(false);
    }
    loadSectors();
  }, [refreshTrigger]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div className="glass-card" style={{ padding: '24px' }}>
        <h2 style={{ fontSize: '1.4rem', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <PieChart size={22} color="var(--blue)" /> NSE Sector Heatmap & Performance
        </h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
          Monitor capital flows across key Indian sectors (NIFTY Bank, IT, Auto, Pharma, Metal, Energy, FMCG).
        </p>
      </div>

      {loading ? (
        <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>Calculating sector metrics...</div>
      ) : (
        <div className="sector-grid">
          {sectors.map((sec) => {
            const isPos = sec.avgChangePct >= 0;
            return (
              <div 
                key={sec.sector} 
                className="glass-card" 
                style={{ 
                  padding: '20px', 
                  borderTop: `4px solid ${isPos ? 'var(--green)' : 'var(--red)'}`,
                  background: isPos ? 'linear-gradient(180deg, rgba(0,240,144,0.04) 0%, var(--bg-card) 100%)' : 'linear-gradient(180deg, rgba(255,59,87,0.04) 0%, var(--bg-card) 100%)'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <div>
                    <h3 style={{ fontSize: '1.1rem' }}>{sec.sector}</h3>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{sec.count} Stocks</span>
                  </div>
                  <div className={isPos ? 'badge-green' : 'badge-red'} style={{ fontSize: '0.9rem', padding: '4px 10px' }}>
                    {isPos ? <TrendingUp size={14} style={{ marginRight: '4px' }} /> : <TrendingDown size={14} style={{ marginRight: '4px' }} />}
                    {isPos ? `+${sec.avgChangePct}%` : `${sec.avgChangePct}%`}
                  </div>
                </div>

                {sec.topGainer && (
                  <div style={{ background: '#0b0e14', padding: '10px', borderRadius: '6px', marginBottom: '14px', fontSize: '0.8rem', display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Top Mover:</span>
                    <strong style={{ color: '#fff' }}>{sec.topGainer.name} ({sec.topGainer.changePct >= 0 ? `+${sec.topGainer.changePct}%` : `${sec.topGainer.changePct}%`})</strong>
                  </div>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {sec.stocks.map((stk) => (
                    <div 
                      key={stk.symbol} 
                      style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 8px', borderRadius: '4px', background: 'rgba(255,255,255,0.02)' }}
                    >
                      <span style={{ fontSize: '0.85rem', fontWeight: 500 }}>{stk.name}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span className="mono" style={{ fontSize: '0.85rem' }}>₹{stk.price}</span>
                        <span className={stk.changePct >= 0 ? 'badge-green' : 'badge-red'} style={{ fontSize: '0.7rem' }}>
                          {stk.changePct >= 0 ? `+${stk.changePct}%` : `${stk.changePct}%`}
                        </span>
                        <button 
                          className="btn-secondary" 
                          style={{ padding: '2px 6px', fontSize: '0.7rem' }} 
                          onClick={() => onSelectStock(stk.symbol, stk.name)}
                        >
                          <Eye size={12} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
