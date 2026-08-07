import React, { useState } from 'react';
import { X, Key, Zap } from 'lucide-react';

export default function FyersAuthModal({ onClose, onConnected }) {
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState(null);

  const handleAutoLogin = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/auth/login-url');
      const data = await res.json();
      setLoading(false);
      if (data.url) {
        window.open(data.url, '_blank');
        setStatusMsg({ 
          type: 'success', 
          text: 'Opening FYERS Login tab... After approving login, it will automatically save your token to config.json!' 
        });
      } else {
        setStatusMsg({ type: 'error', text: 'Error: App ID or credentials missing on the server.' });
      }
    } catch (e) {
      setLoading(false);
      setStatusMsg({ type: 'error', text: 'Error launching auto login: ' + e.message });
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" style={{ maxWidth: '500px' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h3 style={{ fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Key size={20} color="var(--gold)" /> FYERS API v3 Login
          </h3>
          <button className="btn-secondary" style={{ padding: '6px' }} onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {/* 1-Click Auto Login Feature */}
        <div className="card" style={{ padding: '20px', marginBottom: '20px', background: 'var(--blue-bg)', borderColor: 'var(--blue)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <h4 style={{ fontSize: '1rem', color: 'var(--text-heading)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Zap size={18} color="var(--gold)" /> 1-Click Automated FYERS Login
              </h4>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '6px', lineHeight: '1.4' }}>
                Uses the App ID and Secret Key configured on the server to automatically fetch, validate, and save your daily access token.
              </p>
            </div>
            <button 
              className="btn-primary" 
              type="button" 
              onClick={handleAutoLogin} 
              disabled={loading}
              style={{ padding: '10px 16px', fontSize: '0.9rem', alignSelf: 'flex-start' }}
            >
              <Zap size={16} /> {loading ? 'Launching...' : 'Launch Auto-Login'}
            </button>
          </div>
        </div>

        {statusMsg && (
          <div style={{ padding: '12px', borderRadius: '8px', marginBottom: '16px', fontSize: '0.85rem', background: statusMsg.type === 'success' ? 'var(--green-glow)' : 'var(--red-glow)', color: statusMsg.type === 'success' ? 'var(--green)' : 'var(--red)', border: `1px solid ${statusMsg.type === 'success' ? 'rgba(0,240,144,0.3)' : 'rgba(255,59,87,0.3)'}` }}>
            {statusMsg.text}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
          <button type="button" className="btn-secondary" onClick={onClose} style={{ padding: '8px 16px' }}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
