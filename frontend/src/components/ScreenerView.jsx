import React, { useState, useEffect } from 'react';
import { Filter, Play, Plus, Trash2, Zap, CheckCircle2, Sliders, LineChart } from 'lucide-react';
import { runScreener, getPresetScans } from '../services/api';

export default function ScreenerView({ onSelectStock, refreshTrigger }) {
  const [timeframe, setTimeframe] = useState('D');
  const [presets, setPresets] = useState([]);
  const [activePreset, setActivePreset] = useState(null);
  
  const [conditions, setConditions] = useState([
    { timeframe: 'D', indicator: 'Close', period: 20, operator: '>', target: 'EMA', target_period: 20, target_value: 0, multiplier: 1.0 }
  ]);

  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState({ total: 0, matches: 0 });

  useEffect(() => {
    async function loadPresets() {
      const data = await getPresetScans();
      setPresets(data);
      if (data.length > 0) {
        // Load first preset by default
        handleSelectPreset(data[0]);
      }
    }
    loadPresets();
  }, []);

  // Re-run scan on auto-refresh trigger
  useEffect(() => {
    if (refreshTrigger > 0) {
      handleRunScan();
    }
  }, [refreshTrigger]);

  const handleRunScan = async (overrideConditions = null, overridePresetId = null) => {
    setLoading(true);
    const condsToRun = overrideConditions || conditions;
    const data = await runScreener(timeframe, overridePresetId, condsToRun);
    if (data) {
      setResults(data.results || []);
      setStats({ total: data.total || 0, matches: data.matches || 0 });
    }
    setLoading(false);
  };

  const handleSelectPreset = (preset) => {
    setActivePreset(preset.id);
    setConditions(preset.conditions);
    handleRunScan(preset.conditions, preset.id);
  };

  const handleAddCondition = () => {
    setConditions([
      ...conditions,
      { timeframe: timeframe, indicator: 'RSI', period: 14, operator: '>', target: 'Value', target_period: 20, target_value: 50, multiplier: 1.0 }
    ]);
  };

  const handleRemoveCondition = (index) => {
    if (conditions.length > 1) {
      setConditions(conditions.filter((_, i) => i !== index));
    }
  };

  const handleConditionChange = (index, field, value) => {
    const updated = [...conditions];
    updated[index] = { ...updated[index], [field]: value };
    setConditions(updated);
    setActivePreset(null);
  };

  // Generate formula text preview
  const formulaText = conditions.map(c => {
    const targetStr = c.target === 'Value' ? c.target_value : c.target === 'EMA' ? `EMA(${c.target_period})` : c.target === 'Volume_SMA' ? `SMA(Volume, 20) * ${c.multiplier}` : c.target;
    return `[${c.timeframe || timeframe}] ${c.indicator}${c.indicator === 'RSI' || c.indicator === 'EMA' ? `(${c.period})` : ''} ${c.operator} ${targetStr}`;
  }).join(' AND ');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Preset Scans Header Bar */}
      <div className="card" style={{ padding: '20px' }}>
        <h3 style={{ fontSize: '1rem', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Zap size={18} color="var(--gold)" /> Chartink Popular Scans Catalog
        </h3>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          {presets.map((p) => (
            <button
              key={p.id}
              className={`btn-secondary ${activePreset === p.id ? 'active' : ''}`}
              style={{
                background: activePreset === p.id ? 'var(--blue)' : '#1a1f2c',
                color: activePreset === p.id ? '#fff' : 'var(--text-main)',
                borderColor: activePreset === p.id ? 'var(--blue)' : 'var(--border-color)',
                padding: '8px 14px'
              }}
              onClick={() => handleSelectPreset(p)}
            >
              <Zap size={14} color={activePreset === p.id ? '#fff' : 'var(--gold)'} /> {p.name}
            </button>
          ))}
        </div>
      </div>

      {/* Visual Rule Builder Panel */}
      <div className="card" style={{ padding: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
          <h3 style={{ fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Sliders size={18} color="var(--blue)" /> Custom Technical Condition Builder
          </h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Timeframe:</span>
            <select className="select-input" value={timeframe} onChange={(e) => setTimeframe(e.target.value)}>
              <option value="5m">5 Min</option>
              <option value="15m">15 Min</option>
              <option value="1h">1 Hour</option>
              <option value="D">Daily</option>
            </select>
            <button className="btn-primary" onClick={() => handleRunScan()} disabled={loading}>
              <Play size={16} /> {loading ? 'Scanning...' : 'Run Screener'}
            </button>
          </div>
        </div>

        {/* Condition Rows */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {conditions.map((cond, idx) => (
            <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'var(--bg-card-hover)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)', flexWrap: 'wrap', overflowX: 'auto' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--blue)', background: 'rgba(41,98,255,0.15)', padding: '2px 8px', borderRadius: '4px' }}>
                Rule #{idx + 1}
              </span>

              {/* Indicator dropdown */}
              <select className="select-input" value={cond.indicator} onChange={(e) => handleConditionChange(idx, 'indicator', e.target.value)}>
                <option value="Close">Close Price</option>
                <option value="EMA">EMA</option>
                <option value="RSI">RSI</option>
                <option value="Volume">Volume</option>
                <option value="Change%">Change %</option>
              </select>

              {/* Period input if applicable */}
              {(cond.indicator === 'EMA' || cond.indicator === 'RSI') && (
                <input 
                  type="number" 
                  className="text-input" 
                  style={{ width: '70px' }} 
                  value={cond.period} 
                  onChange={(e) => handleConditionChange(idx, 'period', e.target.value)} 
                  placeholder="Period"
                />
              )}

              {/* Operator */}
              <select className="select-input" value={cond.operator} onChange={(e) => handleConditionChange(idx, 'operator', e.target.value)}>
                <option value=">">Greater than (&gt;)</option>
                <option value=">=">Greater or Equal (&gt;=)</option>
                <option value="<">Less than (&lt;)</option>
                <option value="<=">Less or Equal (&lt;=)</option>
                <option value="==">Equal to (==)</option>
              </select>

              {/* Target Type */}
              <select className="select-input" value={cond.target} onChange={(e) => handleConditionChange(idx, 'target', e.target.value)}>
                <option value="Value">Static Value</option>
                <option value="EMA">EMA Indicator</option>
                <option value="Volume_SMA">Volume 20-SMA</option>
                <option value="High_Prev">Previous High</option>
              </select>

              {/* Target Details */}
              {cond.target === 'Value' ? (
                <input 
                  type="number" 
                  className="text-input" 
                  style={{ width: '90px' }} 
                  value={cond.target_value} 
                  onChange={(e) => handleConditionChange(idx, 'target_value', e.target.value)} 
                />
              ) : cond.target === 'EMA' ? (
                <input 
                  type="number" 
                  className="text-input" 
                  style={{ width: '80px' }} 
                  value={cond.target_period} 
                  onChange={(e) => handleConditionChange(idx, 'target_period', e.target.value)} 
                  placeholder="EMA Period"
                />
              ) : cond.target === 'Volume_SMA' ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.85rem' }}>
                  <span>x Multiplier:</span>
                  <input 
                    type="number" 
                    step="0.1" 
                    className="text-input" 
                    style={{ width: '70px' }} 
                    value={cond.multiplier} 
                    onChange={(e) => handleConditionChange(idx, 'multiplier', e.target.value)} 
                  />
                </div>
              ) : null}

              {conditions.length > 1 && (
                <button className="btn-secondary" style={{ color: 'var(--red)', padding: '6px' }} onClick={() => handleRemoveCondition(idx)}>
                  <Trash2 size={16} />
                </button>
              )}
            </div>
          ))}

          <button className="btn-secondary" style={{ alignSelf: 'flex-start', marginTop: '4px' }} onClick={handleAddCondition}>
            <Plus size={16} /> Add Condition Rule
          </button>
        </div>

        {/* Live Expression Formula Bar */}
        <div style={{ marginTop: '16px', background: 'var(--bg-card-hover)', padding: '12px 16px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>
            Chartink Formula Syntax Expression:
          </span>
          <code className="mono" style={{ color: 'var(--green)', fontSize: '0.9rem' }}>
            {formulaText}
          </code>
        </div>
      </div>

      {/* Scan Results Table */}
      <div className="card" style={{ padding: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div>
            <h3 style={{ fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Filter size={18} color="var(--blue)" /> Scan Results
            </h3>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              Found <strong style={{ color: 'var(--green)' }}>{stats.matches}</strong> matched stocks out of {stats.total} total
            </span>
          </div>
        </div>

        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>Running condition engine on NSE universe...</div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Status</th>
                <th>Symbol & Name</th>
                <th>Sector</th>
                <th>Price</th>
                <th>Change %</th>
                <th>RSI (14)</th>
                <th>Volume</th>
                <th>Signal</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {results.map((stk) => (
                <tr key={stk.symbol} style={{ opacity: stk.matched ? 1 : 0.45 }}>
                  <td>
                    {stk.matched ? (
                      <span className="badge-green" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <CheckCircle2 size={12} /> MATCH
                      </span>
                    ) : (
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>NO MATCH</span>
                    )}
                  </td>
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
                  <td className="mono">{stk.rsi}</td>
                  <td className="mono">{(stk.volume / 1000).toFixed(0)}k</td>
                  <td>
                    <span style={{ fontSize: '0.75rem', fontWeight: 600, color: stk.signal === 'BULLISH' ? 'var(--green)' : 'var(--red)' }}>
                      {stk.signal}
                    </span>
                  </td>
                  <td>
                    <button className="btn-primary" style={{ padding: '4px 10px', fontSize: '0.75rem' }} onClick={() => onSelectStock(stk.symbol, stk.name)}>
                      <LineChart size={14} /> Open Chart
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
