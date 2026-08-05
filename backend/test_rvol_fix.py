"""
Quick sanity test for the RVOL live-fetch fix.
Mocks fyers_service so no real API calls are made, then verifies:
1. A placeholder (price=500) cache does NOT short-circuit _compute_and_cache_rvol.
2. Live results replace placeholders and get cached.
3. Baseline-looking snapshots are rejected on load.
"""
import os
import sys
import time
import tempfile

# Run from backend dir
os.chdir(os.path.dirname(os.path.abspath(__file__)))

import pandas as pd

import fyers_service as fyers_mod
import screener_engine as se_mod


class MockFyers:
    is_connected = True
    fyers_model = object()

    def get_stock_universe(self, fno_only=True):
        return [
            {"symbol": f"NSE:STOCK{i}-EQ", "name": f"Stock{i}", "sector": "TEST", "base_price": 500.0}
            for i in range(50)
        ]

    def fetch_historical_candles(self, symbol, timeframe="D", days=120):
        # Simulate a live 1-day intraday candle history with real prices/volumes
        import random
        random.seed(hash(symbol) % 1000)
        rows = []
        t = 1785900000
        px = 1000 + random.random() * 2000
        for _ in range(5):
            vol = 50000 + random.random() * 900000
            rows.append([t, px, px + 2, px - 1, px + 1, vol])
            t += 300
            px += 1
        df = pd.DataFrame(rows, columns=["timestamp", "open", "high", "low", "close", "volume"])
        df["date"] = pd.to_datetime(df["timestamp"], unit="s")
        return df


mock = MockFyers()
fyers_mod.fyers_service = mock

# Patch module-level reference used inside ScreenerEngine
se_mod.fyers_service = mock

# Build engine WITHOUT touching real modules (avoid auto-init side effects)
engine = se_mod.ScreenerEngine.__new__(se_mod.ScreenerEngine)
engine._cache = {}
engine._today_stock_cache = {}
engine._baseline_20d_cache = {}
engine._rvol_lock = __import__("threading").Lock()
engine._cache_ttl = 300
engine._live_fetch_running = {}

# Simulate: 50 baseline placeholders seeded (as the old buggy code did)
placeholders = [
    {
        "symbol": f"NSE:STOCK{i}-EQ", "name": f"Stock{i}", "sector": "TEST",
        "price": 500.0, "changePct": 0.0, "today1stVol": 100000,
        "avg20Day1stVol": 100000, "rvolRatio": 1.0, "rvolPercent": 100.0, "signal": "NORMAL",
        "is_live": False
    }
    for i in range(50)
]
engine._cache["raw_rvol_5m_20_fno"] = (time.time(), placeholders)

# Verify helper detection
assert engine._looks_like_baseline(placeholders), "helper should detect placeholders"
print("PASS: _looks_like_baseline detects placeholders")

# Critical: _compute_and_cache_rvol must NOT return the placeholder cache; it must fetch live
live = engine._compute_and_cache_rvol("5m", 20)
prices = {r["symbol"]: r["price"] for r in live}
assert len(live) == 50, f"expected 50 live rows, got {len(live)}"
assert all(p != 500.0 for p in prices.values()), "live rows must have real prices"
assert all(r["is_live"] for r in live), "live rows must be flagged is_live=True"
assert not engine._looks_like_baseline(live), "live rows must not look like baseline"
print(f"PASS: live fetch replaced placeholders ({len(live)} rows, sample price {list(prices.values())[0]:.2f})")

# The cache should now hold live data and a second call short-circuits (no re-fetch)
cached = engine._compute_and_cache_rvol("5m", 20)
assert cached == live, "second call should return cached live results"
print("PASS: subsequent calls return cached live results")

# Snapshot guard: saving placeholders must be refused
tmp = tempfile.mkdtemp()
engine._get_snapshot_filepath = lambda tf: os.path.join(tmp, f"snap_{tf}.json")
engine._save_today_snapshot("5m", placeholders)
assert not os.path.exists(os.path.join(tmp, "snap_5m.json")), "placeholder snapshot must NOT be saved"
engine._save_today_snapshot("5m", live)
assert os.path.exists(os.path.join(tmp, "snap_5m.json")), "live snapshot SHOULD be saved"
print("PASS: _save_today_snapshot refuses placeholders, saves live")

# Snapshot load guard: baseline-looking snapshot rejected
engine._load_today_snapshot = se_mod.ScreenerEngine._load_today_snapshot.__get__(engine)
# craft a baseline-looking file
with open(os.path.join(tmp, "snap_5m.json"), "w") as f:
    import json
    json.dump(placeholders, f)
engine._get_snapshot_filepath = lambda tf: os.path.join(tmp, "snap_5m.json")
assert engine._load_today_snapshot("5m") is None, "baseline snapshot must be rejected on load"
print("PASS: _load_today_snapshot rejects baseline-looking snapshots")

print("\nALL TESTS PASSED")
