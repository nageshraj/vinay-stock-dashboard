import React, { useState } from 'react';
import { X, Key, ShieldCheck, ExternalLink, Info, Zap } from 'lucide-react';
import { updateAuthCredentials } from '../services/api';

export default function FyersAuthModal({ onClose, onConnected }) {
  const [appId, setAppId] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [secretKey, setSecretKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState(null);

  const handleAutoLogin = async () => {
    try {
      const res = await fetch('/api/auth/login-url');
      const data = await res.json();
      if (data.url) {
        window.open(data.url, '_blank');
        setStatusMsg({ 
          type: 'success', 
          text: 'Opening FYERS Login tab... After approving login, it will automatically save your token to config.json!' 
        });
      }
    } catch (e) {
      setStatusMsg({ type: 'error', text: 'Error launching auto login: ' + e.message });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setStatusMsg(null);

    const res = await updateAuthCredentials(appId, accessToken, secretKey);
    setLoading(false);

    if (res.status === 'success') {
      setStatusMsg({ type: 'success', text: `Connected successfully! Logged in as ${res.user}` });
      onConnected(true);
      setTimeout(onClose, 1200);
    } else {
      setStatusMsg({ type: 'error', text: res.message || 'Authentication failed. Please check App ID and Access Token.' });
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" style={{ maxWidth: '560px' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h3 style={{ fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Key size={20} color="var(--gold)" /> FYERS API v3 Credentials
          </h3>
          <button className="btn-secondary" style={{ padding: '6px' }} onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {/* 1-Click Auto Login Feature */}
        <div className="glass-card" style={{ padding: '16px', marginBottom: '20px', background: 'linear-gradient(135deg, rgba(41,98,255,0.15) 0%, rgba(19,23,34,0.8) 100%)', borderColor: 'var(--blue)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <h4 style={{ fontSize: '0.95rem', color: '#fff', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Zap size={16} color="var(--gold)" /> 1-Click Automated FYERS Login
              </h4>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                Uses APP_ID & SECRET_KEY from your <code className="mono">config.json</code> to auto-fetch & save token.
              </p>
            </div>
            <button className="btn-primary" type="button" onClick={handleAutoLogin} style={{ padding: '8px 14px', fontSize: '0.8rem' }}>
              <Zap size={14} /> Launch Auto-Login
            </button>
          </div>
        </div>

        <div style={{ background: '#0b0e14', padding: '14px', borderRadius: '8px', border: '1px solid var(--border-color)', marginBottom: '20px', fontSize: '0.85rem' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', color: 'var(--text-muted)' }}>
            <Info size={16} color="var(--blue)" style={{ flexShrink: 0, marginTop: '2px' }} />
            <div>
              Or manually paste a daily <strong>Access Token</strong> below.
              <a href="https://myapi.fyers.in/" target="_blank" rel="noreferrer" style={{ color: 'var(--blue)', marginLeft: '6px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
                FYERS Portal <ExternalLink size={12} />
              </a>
            </div>
          </div>
        </div>

        {statusMsg && (
          <div style={{ padding: '12px', borderRadius: '8px', marginBottom: '16px', fontSize: '0.85rem', background: statusMsg.type === 'success' ? 'var(--green-glow)' : 'var(--red-glow)', color: statusMsg.type === 'success' ? 'var(--green)' : 'var(--red)', border: `1px solid ${statusMsg.type === 'success' ? 'rgba(0,240,144,0.3)' : 'rgba(255,59,87,0.3)'}` }}>
            {statusMsg.text}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '6px' }}>FYERS App ID</label>
            <input 
              type="text" 
              className="text-input" 
              style={{ width: '100%' }} 
              value={appId} 
              onChange={(e) => setAppId(e.target.value)} 
              placeholder="e.g. 1YFK7Z5TIV-100"
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '6px' }}>FYERS Access Token</label>
            <textarea 
              className="text-input" 
              style={{ width: '100%', height: '70px', fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }} 
              value={accessToken} 
              onChange={(e) => setAccessToken(e.target.value)} 
              placeholder="Paste FYERS OAuth Access Token string..."
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '8px' }}>
            <button type="button" className="btn-secondary" onClick={onClose}>
              Close
            </button>
            <button type="submit" className="btn-primary" disabled={loading}>
              <ShieldCheck size={16} /> {loading ? 'Validating...' : 'Save & Connect'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
