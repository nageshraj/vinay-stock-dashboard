from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
import os
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

@app.get("/api/sectors")
def get_sector_performance():
    universe = fyers_service.get_stock_universe()
    sector_map = {}

    for stock in universe:
        sec = stock["sector"]
        if sec not in sector_map:
            sector_map[sec] = {"sector": sec, "stocks": [], "total_change": 0.0, "count": 0}
        
        df = fyers_service.fetch_historical_candles(stock["symbol"], timeframe="D", days=10)
        if not df.empty and len(df) >= 2:
            c_curr = df.iloc[-1]["close"]
            c_prev = df.iloc[-2]["close"]
            pct = round(((c_curr - c_prev) / c_prev) * 100, 2)
        else:
            pct = 0.0

        sector_map[sec]["stocks"].append({
            "symbol": stock["symbol"],
            "name": stock["name"],
            "price": round(df.iloc[-1]["close"], 2) if not df.empty else stock["base_price"],
            "changePct": pct
        })
        sector_map[sec]["total_change"] += pct
        sector_map[sec]["count"] += 1

    results = []
    for sec, data in sector_map.items():
        avg_pct = round(data["total_change"] / max(data["count"], 1), 2)
        data["avgChangePct"] = avg_pct
        data["stocks"].sort(key=lambda x: -x["changePct"])
        data["topGainer"] = data["stocks"][0] if data["stocks"] else None
        results.append(data)

    results.sort(key=lambda x: -x["avgChangePct"])
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
    df = fyers_service.fetch_historical_candles(symbol, timeframe=timeframe, days=120)
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
            "rsi": float(row["RSI_14"]) if pd.notna(row.get("RSI_14")) else None
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
    sort_order: str = Query("asc")
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

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=False)
