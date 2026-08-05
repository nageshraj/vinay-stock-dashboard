const API_BASE = '/api';

export async function checkHealth() {
  try {
    const res = await fetch(`${API_BASE}/health`);
    return await res.json();
  } catch (err) {
    return { status: 'offline', fyers_connected: false };
  }
}

export async function getIndices() {
  try {
    const res = await fetch(`${API_BASE}/indices`);
    return await res.json();
  } catch (err) {
    console.error('Error fetching indices:', err);
    return [];
  }
}

export async function getSectors() {
  try {
    const res = await fetch(`${API_BASE}/sectors`);
    return await res.json();
  } catch (err) {
    console.error('Error fetching sectors:', err);
    return [];
  }
}

export async function getPresetScans() {
  try {
    const res = await fetch(`${API_BASE}/screener/presets`);
    return await res.json();
  } catch (err) {
    console.error('Error fetching preset scans:', err);
    return [];
  }
}

export async function runScreener(timeframe = 'D', presetId = null, conditions = null) {
  try {
    const res = await fetch(`${API_BASE}/screener/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ timeframe, preset_id: presetId, conditions })
    });
    return await res.json();
  } catch (err) {
    console.error('Error running screener:', err);
    return { timeframe, total: 0, matches: 0, results: [] };
  }
}

export async function getStockCandles(symbol, timeframe = 'D') {
  try {
    const res = await fetch(`${API_BASE}/candles?symbol=${encodeURIComponent(symbol)}&timeframe=${timeframe}`);
    return await res.json();
  } catch (err) {
    console.error('Error fetching candles:', err);
    return { symbol, timeframe, candles: [] };
  }
}

export async function updateAuthCredentials(appId, accessToken, secretKey = '') {
  try {
    const res = await fetch(`${API_BASE}/auth/credentials`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ app_id: appId, access_token: accessToken, secret_key: secretKey })
    });
    return await res.json();
  } catch (err) {
    return { status: 'error', message: err.message };
  }
}

export async function getOpeningRvolDashboard(timeframe = '5m', sortOrder = 'asc', retries = 3) {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const res = await fetch(`${API_BASE}/dashboard/opening-rvol?timeframe=${timeframe}&sort_order=${sortOrder}`);
      if (res.ok) {
        const data = await res.json();
        if (data && data.results && data.results.length > 0) {
          return data;
        }
      }
    } catch (err) {
      console.warn(`Opening RVOL fetch attempt ${attempt + 1} failed, retrying...`);
    }
    if (attempt < retries - 1) {
      await new Promise(r => setTimeout(r, 1200));
    }
  }
  return { timeframe, sort_order: sortOrder, total: 0, results: [] };
}
