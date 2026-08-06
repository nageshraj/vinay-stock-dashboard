import os
import json
import time
import threading
from datetime import datetime
import pandas as pd
import numpy as np
from typing import List, Dict, Any, Optional
from concurrent.futures import ThreadPoolExecutor, as_completed
from fyers_service import fyers_service

class ScreenerEngine:
    def __init__(self):
        self._cache = {}
        self._today_stock_cache = {}
        self._cache_ttl = 300 # 5 minutes (opening 1st candles do not change every second)
        self.preset_scans = [
            {
                "id": "golden_crossover",
                "name": "Golden EMA Crossover (20 EMA > 50 EMA)",
                "description": "Bullish trend momentum scan where 20 EMA is above 50 EMA with strong volume.",
                "category": "Momentum",
                "conditions": [
                    {"timeframe": "D", "indicator": "EMA", "period": 20, "operator": ">", "target": "EMA", "target_period": 50},
                    {"timeframe": "D", "indicator": "Close", "operator": ">", "target": "EMA", "target_period": 20}
                ]
            },
            {
                "id": "rsi_oversold",
                "name": "RSI Oversold Reversal (RSI <= 35)",
                "description": "Reversal opportunities where daily RSI dropped below 35 and price is recovering.",
                "category": "Reversal",
                "conditions": [
                    {"timeframe": "D", "indicator": "RSI", "period": 14, "operator": "<=", "target": "Value", "target_value": 35}
                ]
            },
            {
                "id": "volume_surge",
                "name": "Volume Surge Breakout (Vol > 1.8x 20-day SMA)",
                "description": "Stocks experiencing high institutional volume (>180% of 20-day volume average).",
                "category": "Volume",
                "conditions": [
                    {"timeframe": "D", "indicator": "Volume", "operator": ">", "target": "Volume_SMA", "target_period": 20, "multiplier": 1.8},
                    {"timeframe": "D", "indicator": "Change%", "operator": ">", "target": "Value", "target_value": 1.5}
                ]
            },
            {
                "id": "15min_breakout",
                "name": "15-Min High Breakout",
                "description": "Intraday breakout stocks crossing above yesterday's High with momentum.",
                "category": "Intraday",
                "conditions": [
                    {"timeframe": "15m", "indicator": "Close", "operator": ">", "target": "High_Prev", "target_period": 1},
                    {"timeframe": "15m", "indicator": "RSI", "period": 14, "operator": ">", "target": "Value", "target_value": 55}
                ]
            }
        ]

        self._baseline_20d_cache = {} # Key: (symbol, timeframe) -> float (20-day avg 1st candle vol)
        self._baseline_last_updated = 0
        self._rvol_lock = threading.Lock()
        self._live_fetch_running = {}  # tf -> bool (in-flight gate for live fetch threads)

        # Synchronously pre-load disk baselines into memory and seed initial cache
        self._ensure_20d_baselines_loaded("5m")
        self._ensure_20d_baselines_loaded("15m")
        self._seed_cache_from_baselines("5m")
        self._seed_cache_from_baselines("15m")

        # Start background pre-computation thread for zero-latency UI responses
        threading.Thread(target=self._background_prewarmer, daemon=True).start()

    def _get_snapshot_filepath(self, tf: str) -> str:
        today_str = datetime.now().strftime("%Y-%m-%d")
        return os.path.join(os.path.dirname(__file__), f"today_rvol_{tf}_{today_str}.json")

    @staticmethod
    def _looks_like_baseline(results) -> bool:
        """
        Returns True if any row is not backed by a successful live fetch
        (is_live is False/missing). Placeholder rows must never be treated as
        complete live data, otherwise the cache guard short-circuits and the
        FYERS API is never called again.
        """
        return bool(results) and not all(r.get("is_live", False) for r in results)

    def invalidate_live_cache(self):
        """
        Clears all per-stock live data locks, RVOL result cache, and today's disk
        snapshots. Call this whenever a new FYERS token is authenticated so stale/
        placeholder data locked during a previous failed session gets discarded
        and re-fetched.
        """
        self._today_stock_cache.clear()
        for tf in ["5m", "15m"]:
            self._cache.pop(f"raw_rvol_{tf}_20_fno", None)
            # Delete today's snapshot so a stale placeholder snapshot on disk
            # doesn't get re-loaded on the next restart.
            snap_file = self._get_snapshot_filepath(tf)
            if os.path.exists(snap_file):
                try:
                    os.remove(snap_file)
                    print(f"[ScreenerEngine] Removed stale today snapshot: {snap_file}")
                except Exception:
                    pass
        print("[ScreenerEngine] Live cache invalidated — will re-fetch fresh FYERS data.")
        # Kick off fresh live fetch in background
        for tf in ["5m", "15m"]:
            threading.Thread(target=self._trigger_live_fetch, args=(tf,), daemon=True).start()

    def _load_today_snapshot(self, tf: str) -> Optional[List[Dict[str, Any]]]:
        snap_file = self._get_snapshot_filepath(tf)
        if os.path.exists(snap_file):
            try:
                with open(snap_file, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    if isinstance(data, list) and len(data) >= 50 and not self._looks_like_baseline(data):
                        return data
            except Exception:
                pass
        return None

    def _save_today_snapshot(self, tf: str, data: List[Dict[str, Any]]):
        # Never persist placeholder rows (rows not backed by a live fetch) — a
        # snapshot must only ever contain real live data.
        if not data or len(data) < 50 or self._looks_like_baseline(data):
            return
        snap_file = self._get_snapshot_filepath(tf)
        try:
            with open(snap_file, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2)
        except Exception:
            pass

    def _ensure_20d_baselines_loaded(self, tf: str):
        """Ensures 20-day baseline opening volume is pre-loaded into memory and persisted to disk."""
        disk_file = os.path.join(os.path.dirname(__file__), f"baseline_20d_{tf}.json")
        if os.path.exists(disk_file):
            try:
                with open(disk_file, "r", encoding="utf-8") as f:
                    disk_data = json.load(f)
                    for sym, val in disk_data.items():
                        self._baseline_20d_cache[(sym, tf)] = float(val)
            except Exception as e:
                print(f"Notice reading baseline disk cache: {e}")

    def _seed_cache_from_baselines(self, tf: str):
        """Loads today's snapshot if available; otherwise builds in-memory baseline rows.
        Baseline placeholder rows are never persisted to disk — only real live data
        gets snapshotted so every boot attempts a live fetch."""
        self._ensure_20d_baselines_loaded(tf)
        snap = self._load_today_snapshot(tf)
        if snap and len(snap) >= 50:
            self._cache[f"raw_rvol_{tf}_20_fno"] = (time.time(), snap)
            return

        # Delete stale disk snapshot if present
        snap_file = self._get_snapshot_filepath(tf)
        if os.path.exists(snap_file):
            try:
                os.remove(snap_file)
            except Exception:
                pass

        universe = fyers_service.get_stock_universe(fno_only=True)
        results = []
        for stock in universe:
            sym = stock["symbol"]
            avg_vol = float(self._baseline_20d_cache.get((sym, tf), 100000.0))
            results.append({
                "symbol": sym,
                "name": stock["name"],
                "sector": stock["sector"],
                "price": float(stock.get("base_price", 500.0)),
                "changePct": 0.0,
                "today1stVol": int(avg_vol),
                "avg20Day1stVol": int(round(avg_vol, 0)),
                "rvolRatio": 1.0,
                "rvolPercent": 100.0,
                "signal": "NORMAL",
                "is_live": False
            })
        self._cache[f"raw_rvol_{tf}_20_fno"] = (time.time(), results)
        # NOTE: never persist placeholder rows as today's snapshot. Only rows
        # backed by a successful live fetch (is_live=True) get snapshotted so
        # boot always tries a live fetch.

    def _trigger_live_fetch(self, tf: str):
        """Background thread: Fetches live FYERS data and replaces baseline placeholders in cache.
        Guarded by an in-flight gate so concurrent triggers (dashboard polls, prewarmer,
        OAuth invalidation) don't pile up duplicate fetch threads."""
        with self._rvol_lock:
            if self._live_fetch_running.get(tf, False):
                return
            self._live_fetch_running[tf] = True
        try:
            if fyers_service.is_connected:
                print(f"[RVOL] Fetching live FYERS data for {tf}...")
                live_results = self._compute_and_cache_rvol(tf, 20)
                if live_results and len(live_results) >= 50:
                    self._save_today_snapshot(tf, live_results)
                    print(f"[RVOL] Live data loaded for {tf}: {len(live_results)} stocks")
                else:
                    print(f"[RVOL] Live fetch returned {len(live_results) if live_results else 0} results — keeping baseline")
            else:
                print(f"[RVOL] Fyers not connected, skipping live fetch for {tf}")
        except Exception as e:
            print(f"[RVOL] Live fetch error for {tf}: {e}")
        finally:
            self._live_fetch_running[tf] = False

    def _background_prewarmer(self):
        """Background thread: Seeds baseline data immediately, then fetches live FYERS data."""
        time.sleep(2)
        # On first run: seed baselines, then ALWAYS kick off live fetch in parallel.
        # A snapshot (even a live one) must not block live refresh — placeholders
        # in the cache must be replaced with real FYERS data.
        for tf in ["5m", "15m"]:
            try:
                snap = self._load_today_snapshot(tf)
                if snap and len(snap) >= 50:
                    self._cache[f"raw_rvol_{tf}_20_fno"] = (time.time(), snap)
                    print(f"[RVOL] Loaded today's snapshot for {tf}: {len(snap)} stocks")
                else:
                    self._seed_cache_from_baselines(tf)
                # Kick off live fetch immediately in parallel (always)
                threading.Thread(target=self._trigger_live_fetch, args=(tf,), daemon=True).start()
            except Exception as e:
                print(f"[RVOL] Init error for {tf}: {e}")

        # Subsequent runs: refresh live data every 5 minutes
        while True:
            time.sleep(300)
            try:
                for tf in ["5m", "15m"]:
                    threading.Thread(target=self._trigger_live_fetch, args=(tf,), daemon=True).start()
            except Exception as e:
                print(f"Background RVOL prewarmer notice: {e}")

    def _compute_and_cache_rvol(self, tf: str, days: int) -> List[Dict[str, Any]]:
        raw_key = f"raw_rvol_{tf}_{days}_fno"
        universe = fyers_service.get_stock_universe(fno_only=True)

        # Avoid recomputation if full live universe results are already cached.
        # Any row not backed by a live fetch (is_live False/missing) means the
        # fetch was incomplete — those stocks must be retried, so the cache does
        # NOT count as complete live data.
        def _has_complete_live_results():
            if raw_key not in self._cache:
                return False
            _, existing = self._cache[raw_key]
            if len(existing) < len(universe):
                return False
            return all(r.get("is_live", False) for r in existing)

        if _has_complete_live_results():
            return self._cache[raw_key][1]

        with self._rvol_lock:
            if _has_complete_live_results():
                return self._cache[raw_key][1]

            # Fetch all stocks in parallel. Bounded to 8 workers — the same
            # limit enforced by fyers_service._api_semaphore, so we stay within
            # FYERS rate limits while cutting full-universe latency dramatically.
            temp_results = []
            with ThreadPoolExecutor(max_workers=8) as executor:
                futures = [
                    executor.submit(self._process_single_stock_rvol_delta, stock, tf)
                    for stock in universe
                ]
                for future in as_completed(futures):
                    try:
                        res = future.result()
                        if res:
                            temp_results.append(res)
                    except Exception:
                        pass

            now = time.time()
            if temp_results and len(temp_results) >= len(universe):
                self._cache[raw_key] = (now, temp_results)
            return temp_results

    def _process_single_stock_rvol_delta(self, stock: Dict[str, Any], tf: str) -> Dict[str, Any]:
        """
        INCREMENTAL DELTA FETCHER: Fetches ONLY today's 1-day intraday candles.
        Combines today's opening candle volume with pre-loaded 20-day baseline.
        Locks processed stock results in memory so they never revert or shift on refresh.
        """
        symbol = stock["symbol"]
        cache_key = (symbol, tf)

        # Serve from in-memory lock while fresh. TTL guards against serving
        # yesterday's opening candle after midnight — a stale entry simply gets
        # re-fetched on the next refresh cycle.
        cached = self._today_stock_cache.get(cache_key)
        if cached and (time.time() - cached[0]) < self._cache_ttl:
            return cached[1]

        raw_avg = self._baseline_20d_cache.get((symbol, tf))
        if raw_avg is None or not isinstance(raw_avg, (int, float)) or float(raw_avg) <= 0:
            avg_20day_vol = 100000.0
        else:
            avg_20day_vol = float(raw_avg)
        
        # DELTA: Try fetching 1 day of intraday candles
        today_vol = int(avg_20day_vol)
        curr_price = float(stock.get("base_price", 500.0))
        change_pct = 0.0
        live_fetch_ok = False

        try:
            df_today = fyers_service.fetch_historical_candles(symbol, timeframe=tf, days=1)
            if not df_today.empty and len(df_today) >= 1:
                # Convert timestamp (UTC epoch) to IST datetime (+5:30)
                df_today["ist_date"] = pd.to_datetime(df_today["timestamp"] + 19800, unit="s")
                
                # Get the latest session date present in the dataset
                latest_date = df_today["ist_date"].dt.date.max()
                
                # Filter for only this latest session's candles
                df_filtered = df_today[df_today["ist_date"].dt.date == latest_date]
                
                if not df_filtered.empty:
                    first_row = df_filtered.iloc[0]
                    today_vol = int(first_row["volume"])
                    
                    latest = df_filtered.iloc[-1]
                    curr_price = round(float(latest["close"]), 2)
                    
                    # Benchmark price to calculate true daily Change %:
                    # Last candle of the previous day if available, otherwise today's opening price.
                    first_index = df_filtered.index[0]
                    if first_index > 0:
                        yesterday_close = float(df_today.loc[first_index - 1, "close"])
                    else:
                        yesterday_close = float(first_row["open"])
                    
                    change_pct = round(float(((curr_price - yesterday_close) / max(yesterday_close, 0.01)) * 100), 2)
                    live_fetch_ok = True
        except Exception:
            pass

        # Volume Ratio compared to pre-loaded 20-day 1st candle average
        rvol_ratio = round(today_vol / max(avg_20day_vol, 1.0), 2)
        rvol_pct = round(rvol_ratio * 100, 1)

        result_item = {
            "symbol": symbol,
            "name": stock["name"],
            "sector": stock["sector"],
            "price": curr_price,
            "changePct": change_pct,
            "today1stVol": today_vol,
            "avg20Day1stVol": int(round(avg_20day_vol, 0)),
            "rvolRatio": rvol_ratio,
            "rvolPercent": rvol_pct,
            "signal": "HIGH RVOL" if rvol_ratio >= 1.5 else "NORMAL" if rvol_ratio >= 0.8 else "LOW RVOL",
            "is_live": live_fetch_ok
        }

        # Lock in memory (with timestamp) so results don't churn within the TTL.
        # Only lock rows backed by a successful live fetch — a failed fetch is
        # never locked, so it retries on the next refresh cycle.
        if live_fetch_ok:
            self._today_stock_cache[cache_key] = (time.time(), result_item)
        return result_item

    def calculate_opening_rvol_dashboard(self, timeframe: str = "5m", days: int = 20, sort_order: str = "desc") -> List[Dict[str, Any]]:
        """
        Instant response opening RVOL dashboard calculator.
        Returns cached data immediately (baseline on first call, live data on subsequent calls).
        If any row is not backed by a live fetch (is_live False/missing), triggers a
        background live fetch so placeholders get replaced as soon as FYERS responds.
        """
        tf = timeframe if timeframe in ["5m", "15m"] else "5m"
        raw_key = f"raw_rvol_{tf}_{days}_fno"

        if raw_key not in self._cache or len(self._cache[raw_key][1]) < 50:
            self._seed_cache_from_baselines(tf)

        _, results = self._cache.get(raw_key, (time.time(), []))

        # If any row is not backed by a live fetch, trigger a background live fetch.
        # This handles the case where the background prewarmer hasn't run yet.
        if self._looks_like_baseline(results):
            threading.Thread(target=self._trigger_live_fetch, args=(tf,), daemon=True).start()

        def safe_sort_key(x):
            c = x.get("changePct")
            c_num = float(c) if isinstance(c, (int, float)) and not pd.isna(c) else 0.0
            s = str(x.get("symbol", ""))
            return (c_num, s)

        # Sort by Change % according to requested order (asc = lowest first, desc = highest first)
        reverse = (sort_order or "desc").lower() != "asc"
        sorted_res = sorted(results, key=safe_sort_key, reverse=reverse)
        return sorted_res

    def calculate_indicators(self, df: pd.DataFrame) -> pd.DataFrame:
        """Calculates EMA, SMA, RSI, and Volume indicators using pure pandas."""
        df = df.copy()
        if len(df) < 5:
            return df

        # Exponential Moving Averages (EMA 20 & EMA 50)
        df["EMA_20"] = df["close"].ewm(span=20, adjust=False).mean()
        df["EMA_50"] = df["close"].ewm(span=50, adjust=False).mean()
        df["SMA_20"] = df["close"].rolling(window=20, min_periods=1).mean()

        # Relative Strength Index (RSI 14)
        delta = df["close"].diff()
        gain = (delta.where(delta > 0, 0)).rolling(window=14, min_periods=1).mean()
        loss = (-delta.where(delta < 0, 0)).rolling(window=14, min_periods=1).mean()
        rs = gain / (loss.replace(0, np.nan))
        df["RSI_14"] = (100 - (100 / (1 + rs))).fillna(50)

        # Volume 20 SMA
        df["Volume_SMA_20"] = df["volume"].rolling(window=20, min_periods=1).mean()

        # Returns & Shifted Highs/Lows
        df["Change%"] = df["close"].pct_change() * 100
        df["High_Prev_1"] = df["high"].shift(1)
        df["Low_Prev_1"] = df["low"].shift(1)

        return df

    def evaluate_condition(self, df: pd.DataFrame, cond: Dict[str, Any]) -> bool:
        """Evaluates a technical rule against the latest candle of a stock."""
        if df.empty or len(df) < 5:
            return False

        latest = df.iloc[-1]
        
        ind_name = cond.get("indicator", "Close")
        period = int(cond.get("period", 14))
        op = cond.get("operator", ">")
        target_type = cond.get("target", "Value")
        target_period = int(cond.get("target_period", 20))
        target_val = float(cond.get("target_value", 0))
        multiplier = float(cond.get("multiplier", 1.0))

        # Left side value
        val_left = 0.0
        if ind_name == "Close":
            val_left = latest.get("close", 0)
        elif ind_name == "RSI":
            val_left = latest.get("RSI_14", 50)
        elif ind_name == "EMA":
            col = f"EMA_{period}"
            val_left = latest.get(col, latest.get("close", 0))
        elif ind_name == "Volume":
            val_left = latest.get("volume", 0)
        elif ind_name == "Change%":
            val_left = latest.get("Change%", 0)

        # Right side value
        val_right = 0.0
        if target_type == "Value":
            val_right = target_val
        elif target_type == "EMA":
            col = f"EMA_{target_period}"
            val_right = latest.get(col, latest.get("close", 0))
        elif target_type == "Volume_SMA":
            val_right = latest.get("Volume_SMA_20", 1) * multiplier
        elif target_type == "High_Prev":
            val_right = latest.get("High_Prev_1", latest.get("high", 0))

        # Compare
        if op == ">":
            return float(val_left) > float(val_right)
        elif op == ">=":
            return float(val_left) >= float(val_right)
        elif op == "<":
            return float(val_left) < float(val_right)
        elif op == "<=":
            return float(val_left) <= float(val_right)
        elif op == "==":
            return abs(float(val_left) - float(val_right)) < 0.01

        return False

    def _process_single_stock_screener(self, stock: Dict[str, Any], conditions: List[Dict[str, Any]], timeframe: str) -> Dict[str, Any]:
        """Worker thread function for running screener conditions on a single stock."""
        symbol = stock["symbol"]
        df = fyers_service.fetch_historical_candles(symbol, timeframe=timeframe, days=120)
        df_ind = self.calculate_indicators(df)

        if df_ind.empty:
            return None

        match = True
        for cond in conditions:
            if not self.evaluate_condition(df_ind, cond):
                match = False
                break

        latest = df_ind.iloc[-1]
        prev = df_ind.iloc[-2] if len(df_ind) > 1 else latest
        curr_price = round(float(latest["close"]), 2)
        change_pct = round(float(((curr_price - prev["close"]) / max(prev["close"], 0.01)) * 100), 2)
        rsi_val = round(float(latest.get("RSI_14", 50)), 1)
        vol = int(latest["volume"])

        return {
            "symbol": symbol,
            "name": stock["name"],
            "sector": stock["sector"],
            "price": curr_price,
            "changePct": change_pct,
            "volume": vol,
            "rsi": rsi_val,
            "matched": match,
            "signal": "BULLISH" if change_pct > 0 else "BEARISH"
        }

    def run_screener(self, conditions: List[Dict[str, Any]] = None, timeframe: str = "D") -> List[Dict[str, Any]]:
        """
        Multithreaded high-performance screener scan over all stocks in the universe.
        Uses 25 parallel worker threads for fast execution.
        """
        if not conditions:
            conditions = [
                {"timeframe": "D", "indicator": "Close", "operator": ">", "target": "EMA", "target_period": 20}
            ]

        cond_str = str(conditions)
        cache_key = f"screener_{timeframe}_{hash(cond_str)}"
        now = time.time()

        if cache_key in self._cache:
            cached_time, cached_data = self._cache[cache_key]
            if now - cached_time < 30 and cached_data:
                return cached_data

        universe = fyers_service.get_stock_universe()
        results = []

        max_workers = min(25, len(universe))
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            futures = [
                executor.submit(self._process_single_stock_screener, stock, conditions, timeframe)
                for stock in universe
            ]
            for future in as_completed(futures):
                try:
                    res = future.result()
                    if res:
                        results.append(res)
                except Exception:
                    pass

        results.sort(key=lambda x: (not x["matched"], -abs(x["changePct"])))
        self._cache[cache_key] = (now, results)
        return results



screener_engine = ScreenerEngine()
