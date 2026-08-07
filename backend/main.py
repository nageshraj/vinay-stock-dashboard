from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
import os
import threading
import time as _time
from concurrent.futures import ThreadPoolExecutor, as_completed
import pandas as pd

from fyers_service import fyers_service
from screener_engine import screener_engine

app = FastAPI(
    title="FYERS Stock Screener & Dashboard API",
    description="Backend API for Chartink-style technical screener, sector heatmaps, and stock charts powered by FYERS API v3.",
    version="1.0.0"
)

# Enable CORS for React frontend (local Vite & production domains)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class AuthCredentialsRequest(BaseModel):
    app_id: str
    access_token: str
    secret_key: Optional[str] = ""

class ScreenerRunRequest(BaseModel):
    timeframe: Optional[str] = "D"
    preset_id: Optional[str] = None
    conditions: Optional[List[Dict[str, Any]]] = None

from fastapi.responses import HTMLResponse

@app.get("/api/health")
def health_check():
    return {
        "status": "healthy",
        "fyers_connected": fyers_service.is_connected,
        "app_id": fyers_service.app_id[:6] + "..." if fyers_service.app_id else "Not Configured"
    }

@app.get("/api/debug/status")
def debug_status():
    """
    Full diagnostic endpoint. Shows connection state, token validity, raw FYERS API response,
    and screener cache state. Visit https://vinay-stock-dashboard.onrender.com/api/debug/status
    """
    import time as _time
    from datetime import datetime, timedelta
    import traceback

    try:
        report = {
            "timestamp": datetime.now().isoformat(),
            "fyers": {},
            "candle_test": {},
            "render_env": {},
            "screener_cache": {}
        }

        # 1. FYERS connection state
        report["fyers"] = {
            "is_connected": fyers_service.is_connected,
            "has_model": fyers_service.fyers_model is not None,
            "app_id_prefix": fyers_service.app_id[:8] + "..." if fyers_service.app_id else "MISSING",
            "token_prefix": fyers_service.access_token[:12] + "..." if fyers_service.access_token else "MISSING",
            "token_length": len(fyers_service.access_token) if fyers_service.access_token else 0,
        }

        # 2. Raw FYERS candle API test
        if fyers_service.is_connected and fyers_service.fyers_model:
            try:
                today = datetime.now()
                from_date = (today - timedelta(days=5)).strftime("%Y-%m-%d")
                to_date = today.strftime("%Y-%m-%d")
                test_data = {
                    "symbol": "NSE:RELIANCE-EQ",
                    "resolution": "5",
                    "date_format": "1",
                    "range_from": from_date,
                    "range_to": to_date,
                    "cont_flag": "1"
                }
                t0 = _time.time()
                raw = fyers_service.fyers_model.history(data=test_data)
                elapsed = round(_time.time() - t0, 2)
                candles = raw.get("candles", [])
                report["candle_test"] = {
                    "symbol": "NSE:RELIANCE-EQ",
                    "timeframe": "5m",
                    "range": f"{from_date} to {to_date}",
                    "api_status": raw.get("s"),
                    "api_code": raw.get("code"),
                    "api_message": raw.get("message", ""),
                    "candles_returned": len(candles),
                    "first_candle": candles[0] if candles else None,
                    "last_candle": candles[-1] if candles else None,
                    "elapsed_seconds": elapsed
                }
            except Exception as e:
                report["candle_test"] = {"error": str(e)}
        else:
            report["candle_test"] = {"skipped": "FYERS not connected or model not initialized"}

        # 3. Render environment variables present?
        report["render_env"] = {
            "RENDER_API_KEY_set": bool(os.getenv("RENDER_API_KEY")),
            "RENDER_SERVICE_ID_set": bool(os.getenv("RENDER_SERVICE_ID")),
            "FYERS_APP_ID_set": bool(os.getenv("FYERS_APP_ID")),
            "FYERS_SECRET_KEY_set": bool(os.getenv("FYERS_SECRET_KEY")),
            "FYERS_ACCESS_TOKEN_set": bool(os.getenv("FYERS_ACCESS_TOKEN")),
            "FYERS_ACCESS_TOKEN_length": len(os.getenv("FYERS_ACCESS_TOKEN", "")),
            "env_keys": sorted(list(os.environ.keys()))
        }

        # 4. Screener cache state
        cache_5m = screener_engine._cache.get("raw_rvol_5m_20_fno")
        cache_15m = screener_engine._cache.get("raw_rvol_15m_20_fno")
        def sample_prices(results):
            if not results:
                return []
            return [{"symbol": r["symbol"], "price": r.get("price"), "rvolRatio": r.get("rvolRatio"), "is_live": r.get("is_live")} for r in results[:3]]

        def live_count(results):
            if not results:
                return 0
            return sum(1 for r in results if r.get("is_live"))

        report["screener_cache"] = {
            "5m_cache_exists": cache_5m is not None,
            "5m_stock_count": len(cache_5m[1]) if cache_5m else 0,
            "5m_live_count": live_count(cache_5m[1] if cache_5m else []),
            "5m_cache_age_seconds": round(_time.time() - cache_5m[0], 0) if cache_5m else None,
            "5m_sample_prices": sample_prices(cache_5m[1] if cache_5m else []),
            "15m_cache_exists": cache_15m is not None,
            "15m_stock_count": len(cache_15m[1]) if cache_15m else 0,
            "15m_live_count": live_count(cache_15m[1] if cache_15m else []),
        }

        return report
    except Exception as ex:
        return {
            "status": "error",
            "error_message": str(ex),
            "traceback": traceback.format_exc()
        }

@app.post("/api/auth/credentials")
def update_credentials(req: AuthCredentialsRequest):
    result = fyers_service.set_credentials(req.app_id, req.access_token, req.secret_key)
    return result

@app.get("/api/auth/login-url")
def get_login_url():
    url = fyers_service.get_login_url()
    return {"url": url, "app_id": fyers_service.app_id}

@app.get("/api/auth/callback", response_class=HTMLResponse)
def auth_callback(auth_code: str = Query(...), s: Optional[str] = None, message: Optional[str] = None):
    if s == "error":
        return f"<h1>FYERS Login Failed</h1><p>{message}</p>"

    res = fyers_service.validate_and_save_auth_code(auth_code)
    if res.get("status") == "success":
        return """
        <html>
          <body style="font-family: sans-serif; background: #0b0e14; color: #00f090; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh;">
            <h1>✅ FYERS Auto-Login SUCCESS!</h1>
            <p style="color: #fff;">New Access Token generated & saved to config.json automatically.</p>
            <script>setTimeout(() => window.close(), 1500);</script>
          </body>
        </html>
        """
    else:
        return f"<h1>Token Validation Failed</h1><p>{res.get('message')}</p>"

@app.get("/api/indices")
def get_indices():
    return fyers_service.get_indices_summary()

@app.get("/api/stocks")
def get_stock_universe():
    return fyers_service.get_stock_universe()

# Sector performance: computed in parallel and cached for 5 minutes, since it
# fetches 10-day candles for the entire universe (hundreds of FYERS calls).
_sector_cache = {"ts": 0, "data": None}
_sector_cache_lock = threading.Lock()
SECTOR_CACHE_TTL = 300


@app.get("/api/sectors")
def get_sector_performance():
    now = _time.time()
    with _sector_cache_lock:
        if _sector_cache["data"] is not None and now - _sector_cache["ts"] < SECTOR_CACHE_TTL:
            return _sector_cache["data"]

    universe = fyers_service.get_stock_universe()
    sector_map = {}
    stock_map = {}
    for stock in universe:
        sec = stock["sector"]
        if sec not in sector_map:
            sector_map[sec] = {"sector": sec, "stocks": [], "total_change": 0.0, "count": 0}
        stock_map[stock["symbol"]] = stock

    # Fetch all stocks in batches using quotes API
    symbols = list(stock_map.keys())
    batch_size = 50
    live_data = {}

    if fyers_service.is_connected and fyers_service.fyers_model:
        for i in range(0, len(symbols), batch_size):
            batch = symbols[i:i + batch_size]
            symbols_str = ",".join(batch)
            try:
                quotes = fyers_service.fyers_model.quotes({"symbols": symbols_str})
                if quotes.get("s") == "ok" and "d" in quotes:
                    for item in quotes["d"]:
                        sym = item.get("n", "")
                        v = item.get("v", {})
                        lp = v.get("lp", 0.0)
                        chp = v.get("chp", 0.0)
                        live_data[sym] = {"price": round(float(lp), 2), "changePct": round(float(chp), 2), "is_live": True}
            except Exception as e:
                print(f"Error fetching quotes for sectors: {e}")

    for stock in universe:
        sym = stock["symbol"]
        entry = sector_map.get(stock["sector"])
        if entry is None:
            continue

        snap = live_data.get(sym, {
            "price": float(stock.get("base_price", 0.0)),
            "changePct": 0.0,
            "is_live": False
        })

        entry["stocks"].append({
            "symbol": sym,
            "name": stock["name"],
            "price": snap["price"],
            "changePct": snap["changePct"],
            "is_live": snap["is_live"]
        })
        entry["total_change"] += snap["changePct"]
        entry["count"] += 1

    results = []
    for sec, data in sector_map.items():
        avg_pct = round(data["total_change"] / max(data["count"], 1), 2)
        data["avgChangePct"] = avg_pct
        data["stocks"].sort(key=lambda x: -x["changePct"])
        data["topGainer"] = data["stocks"][0] if data["stocks"] else None
        results.append(data)

    results.sort(key=lambda x: -x["avgChangePct"])

    with _sector_cache_lock:
        _sector_cache["data"] = results
        _sector_cache["ts"] = _time.time()
    return results

@app.get("/api/screener/presets")
def get_preset_scans():
    return screener_engine.preset_scans

@app.post("/api/screener/run")
def run_screener(req: ScreenerRunRequest):
    conditions = req.conditions
    if req.preset_id:
        for preset in screener_engine.preset_scans:
            if preset["id"] == req.preset_id:
                conditions = preset["conditions"]
                break

    results = screener_engine.run_screener(conditions=conditions, timeframe=req.timeframe)
    return {
        "timeframe": req.timeframe,
        "total": len(results),
        "matches": sum(1 for r in results if r["matched"]),
        "results": results
    }

@app.get("/api/candles")
def get_stock_candles(symbol: str = Query("NSE:RELIANCE-EQ"), timeframe: str = Query("D")):
    # Optimize fetch_days depending on timeframe to reduce data transfer and speed up chart loading
    if timeframe == "5m":
        fetch_days = 15
    elif timeframe == "15m":
        fetch_days = 30
    elif timeframe == "1h":
        fetch_days = 60
    else:
        fetch_days = 120
    df = fyers_service.fetch_historical_candles(symbol, timeframe=timeframe, days=fetch_days)
    df_ind = screener_engine.calculate_indicators(df)
    candles = []
    for _, row in df_ind.iterrows():
        # Format time for TradingView Lightweight Charts (YYYY-MM-DD for daily, timestamp integer for intraday)
        if timeframe == "D" and "date" in row and hasattr(row["date"], "strftime"):
            time_val = row["date"].strftime("%Y-%m-%d")
        else:
            time_val = int(row["timestamp"])

        candles.append({
            "time": time_val,
            "open": float(row["open"]),
            "high": float(row["high"]),
            "low": float(row["low"]),
            "close": float(row["close"]),
            "volume": int(row["volume"]),
            "ema20": float(row["EMA_20"]) if pd.notna(row.get("EMA_20")) else None,
            "ema50": float(row["EMA_50"]) if pd.notna(row.get("EMA_50")) else None,
            "rsi": float(row["RSI_14"]) if pd.notna(row.get("RSI_14")) else None,
            "volume_ma": float(row["Volume_SMA"]) if pd.notna(row.get("Volume_SMA")) else None
        })

    return {
        "symbol": symbol,
        "timeframe": timeframe,
        "candles": candles
    }

@app.get("/api/dashboard/opening-rvol")
def get_opening_rvol_dashboard(
    timeframe: str = Query("5m"),
    days: int = Query(20),
    sort_order: str = Query("desc")
):
    results = screener_engine.calculate_opening_rvol_dashboard(
        timeframe=timeframe,
        days=days,
        sort_order=sort_order
    )
    return {
        "timeframe": timeframe,
        "days": days,
        "sort_order": sort_order,
        "total": len(results),
        "results": results
    }

@app.post("/api/screener/clear-cache")
def clear_screener_cache():
    screener_engine.invalidate_live_cache()
    return {
        "status": "success",
        "message": "Memory cache cleared and today's snapshots deleted. Spawning fresh live FYERS fetch."
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=False)
