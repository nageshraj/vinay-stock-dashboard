import os
import json
import math
import random
import http.server
import socketserver
import threading
import urllib.parse
from datetime import datetime, timedelta
import pandas as pd

from secret_manager import secret_manager

# Temporarily commented out full ~171 F&O universe
# FNO_SYMBOLS = set([
#     "AARTIIND", "ABB", "ABBOTINDIA", "ABCAPITAL", "ABFRL", "ACC", "ADANIENT", "ADANIPORTS",
#     "ALKEM", "AMBUJACEM", "APOLLOHOSP", "APOLLOTYRE", "ASHOKLEY", "ASIANPAINT", "ASTRAL",
#     "ATUL", "AUBANK", "AUROPHARMA", "AXISBANK", "BAJAJ-AUTO", "BAJAJFINSV", "BAJFINANCE",
#     "BALKRISIND", "BALRAMCHIN", "BANDHANBNK", "BANKBARODA", "BATAINDIA", "BEL", "BERGEPAINT",
#     "BHARATFORG", "BHARTIARTL", "BHEL", "BIOCON", "BSOFT", "BPCL", "BRITANNIA", "CANBK",
#     "CANFINHOME", "CHAMBLFERT", "CHOLAFIN", "CIPLA", "COALINDIA", "COFORGE", "COLPAL",
#     "CONCOR", "COROMANDEL", "CROMPTON", "CUMMINSIND", "DABUR", "DALBHARAT", "DEEPAKNTR",
#     "DIVISLAB", "DIXON", "DLF", "DRREDDY", "EICHERMOT", "ESCORTS", "EXIDEIND", "FEDERALBNK",
#     "GAIL", "GLENMARK", "GMRAIRPORT", "GNFC", "GODREJPROP", "GRANULES", "GRASIM", "GUJGASLTD",
#     "HAL", "HAVELLS", "HCLTECH", "HDFCBANK", "HDFCLIFE", "HEROMOTOCO", "HINDALCO", "HINDCOPPER",
#     "HINDPETRO", "HINDUNILVR", "ICICIBANK", "ICICIGI", "ICICIPRULI", "IDEA", "IDFCFIRSTB",
#     "IEX", "IGL", "INDHOTEL", "INDIAMART", "INDIACEM", "INDIGO", "INDUSINDBK", "INDUSTOWER",
#     "INFY", "IOC", "IPCALAB", "IRCTC", "ITC", "JINDALSTEL", "JKCEMENT", "JSWSTEEL", "JUBLFOOD",
#     "KALYANKJIL", "KEI", "KOTAKBANK", "LALPATHLAB", "LAURUSLABS", "LICHSGFIN", "LTIM", "LT",
#     "LTTS", "LUPIN", "M&M", "M&MFIN", "MANAPPURAM", "MARUTI", "MCDOWELL-N", "MCX", "METROPOLIS",
#     "MFSL", "MGL", "MOTHERSON", "MPHASIS", "MRF", "MUTHOOTFIN", "NATIONALUM", "NAVINFLUOR",
#     "NESTLEIND", "NMDC", "NTPC", "OBEROIRLTY", "OFSS", "OIL", "ONGC", "PAGEIND", "PERSISTENT",
#     "PETRONET", "PFC", "PIDILITIND", "PIIND", "PNB", "POLYCAB", "POWERGRID", "PVRINOX",
#     "RAMCOCEM", "RBLBANK", "RECLTD", "RELIANCE", "SAIL", "SBICARD", "SBILIFE", "SBIN",
#     "SHREECEM", "SHRIRAMFIN", "SIEMENS", "SRF", "SUNPHARMA", "SUNTV", "SYNGENE", "TATACOMM",
#     "TATACONSUM", "TATAELXSI", "TATAMOTORS", "TATAPOWER", "TATASTEEL", "TCS", "TECHM",
#     "TITAN", "TORNTPHARM", "TORNTPOWER", "TRENT", "TVSMOTOR", "UBL", "ULTRACEMCO", "UPL",
#     "VEDL", "VOLTAS", "WIPRO", "ZEEL", "ZYDUSLIFE"
# ])

# Reduced FNO Symbols set to official 50 NIFTY 50 constituents
FNO_SYMBOLS = set([
    "ADANIENT", "ADANIPORTS", "APOLLOHOSP", "ASIANPAINT", "AXISBANK", "BAJAJ-AUTO",
    "BAJAJFINSV", "BAJFINANCE", "BEL", "BHARTIARTL", "BPCL", "BRITANNIA", "CIPLA",
    "COALINDIA", "DRREDDY", "EICHERMOT", "GRASIM", "HCLTECH", "HDFCBANK", "HDFCLIFE",
    "HEROMOTOCO", "HINDALCO", "HINDUNILVR", "ICICIBANK", "INDUSINDBK", "INFY", "ITC",
    "JSWSTEEL", "KOTAKBANK", "LT", "M&M", "MARUTI", "NESTLEIND", "NTPC", "ONGC",
    "POWERGRID", "RELIANCE", "SBILIFE", "SBIN", "SHRIRAMFIN", "SUNPHARMA", "TATACONSUM",
    "TATAMOTORS", "TATASTEEL", "TCS", "TECHM", "TITAN", "TRENT", "ULTRACEMCO", "WIPRO"
])

class FyersService:
    def __init__(self):
        self.load_credentials()

        # Start port 3001 callback listener to match registered FYERS App redirect_uri
        self.start_callback_listener()

    def load_credentials(self):
        self.app_id = secret_manager.get_fyers_app_id()
        self.secret_key = secret_manager.get_fyers_secret_key()
        self.access_token = secret_manager.get_fyers_access_token()
        self._api_semaphore = threading.Semaphore(8) # Throttles to max 8 parallel FYERS API calls

        if self.app_id and self.access_token:
            self.init_fyers()

        # Start port 3001 callback listener to match registered FYERS App redirect_uri
        self.start_callback_listener()

    def start_callback_listener(self):
        service_self = self
        class CallbackHandler(http.server.BaseHTTPRequestHandler):
            def do_GET(self):
                parsed = urllib.parse.urlparse(self.path)
                if parsed.path == "/callback":
                    params = urllib.parse.parse_qs(parsed.query)
                    auth_code = params.get("auth_code", [None])[0]
                    if auth_code:
                        res = service_self.validate_and_save_auth_code(auth_code)
                        self.send_response(200)
                        self.send_header("Content-Type", "text/html")
                        self.end_headers()
                        html = """
                        <html>
                          <body style="font-family: sans-serif; background: #0b0e14; color: #00f090; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh;">
                            <h1>✅ FYERS Auto-Login SUCCESS!</h1>
                            <p style="color: #fff;">New Access Token generated & saved to config.json automatically.</p>
                            <script>setTimeout(() => window.close(), 1500);</script>
                          </body>
                        </html>
                        """
                        self.wfile.write(html.encode("utf-8"))
                    else:
                        self.send_response(400)
                        self.end_headers()
                else:
                    self.send_response(404)
                    self.end_headers()

            def log_message(self, format, *args):
                pass

        def run_server():
            try:
                with socketserver.TCPServer(("localhost", 3001), CallbackHandler) as httpd:
                    print("Started port 3001 FYERS callback listener")
                    httpd.serve_forever()
            except Exception as e:
                pass

        t = threading.Thread(target=run_server, daemon=True)
        t.start()

    def get_login_url(self):
        # Use Render production URL. Must match exactly what's in FYERS Developer Portal.
        redirect_uri = "https://vinay-stock-dashboard.onrender.com/api/auth/callback"
        return f"https://api-t1.fyers.in/api/v3/generate-authcode?client_id={self.app_id}&redirect_uri={redirect_uri}&response_type=code&state=auth"

    def load_from_config(self):
        config_paths = [
            r"C:\Users\nages\OneDrive\Desktop\Projects\Stock\New folder\config.json",
            os.path.join(os.path.dirname(__file__), "config.json"),
            os.path.join(os.path.dirname(__file__), "..", "config.json")
        ]
        for path in config_paths:
            if os.path.exists(path):
                try:
                    with open(path, "r", encoding="utf-8") as f:
                        cfg = json.load(f)
                    fyers_cfg = cfg.get("FYERS", {})
                    app_id = fyers_cfg.get("APP_ID", "")
                    secret_key = fyers_cfg.get("SECRET_KEY", "")
                    access_token = fyers_cfg.get("ACCESS_TOKEN", "")
                    if app_id and access_token:
                        self.app_id = app_id
                        self.secret_key = secret_key
                        self.access_token = access_token
                        print(f"Loaded FYERS credentials from config file: {path}")
                        break
                except Exception as e:
                    print(f"Error reading config from {path}: {e}")

    def set_credentials(self, app_id: str, access_token: str, secret_key: str = ""):
        self.app_id = app_id
        self.access_token = access_token
        if secret_key:
            self.secret_key = secret_key
        secret_manager.save_credentials(app_id, access_token, secret_key)
        return self.init_fyers()

    def validate_and_save_auth_code(self, auth_code: str):
        """Exchanges FYERS auth_code for access_token and updates .env file."""
        import hashlib
        import requests
        
        if not self.app_id or not self.secret_key:
            return {"status": "error", "message": "App ID and Secret Key are required in .env / Environment Variables"}

        hash_input = f"{self.app_id}:{self.secret_key}".encode("utf-8")
        app_id_hash = hashlib.sha256(hash_input).hexdigest()

        payload = {
            "grant_type": "authorization_code",
            "appIdHash": app_id_hash,
            "code": auth_code
        }

        try:
            res = requests.post("https://api-t1.fyers.in/api/v3/validate-authcode", json=payload, timeout=10)
            if res.status_code != 200:
                res = requests.post("https://api.fyers.in/api/v3/validate-authcode", json=payload, timeout=10)
            data = res.json()
            if data.get("s") == "ok" and "access_token" in data:
                new_token = data["access_token"]
                self.access_token = new_token
                
                # Save to .env and environment
                secret_manager.save_access_token(new_token)
                
                # Init FYERS
                init_res = self.init_fyers()
                return {"status": "success", "message": "Auto-Login Success! New token saved to .env securely.", "data": init_res}
            else:
                return {"status": "error", "message": data.get("message", "Failed to validate auth code")}
        except Exception as e:
            return {"status": "error", "message": str(e)}

    def save_to_config(self, access_token: str):
        config_paths = [
            r"C:\Users\nages\OneDrive\Desktop\Projects\Stock\New folder\config.json",
            os.path.join(os.path.dirname(__file__), "config.json"),
            os.path.join(os.path.dirname(__file__), "..", "config.json")
        ]
        for path in config_paths:
            if os.path.exists(path):
                try:
                    with open(path, "r", encoding="utf-8") as f:
                        cfg = json.load(f)
                    if "FYERS" not in cfg:
                        cfg["FYERS"] = {}
                    cfg["FYERS"]["ACCESS_TOKEN"] = access_token
                    with open(path, "w", encoding="utf-8") as f:
                        json.dump(cfg, f, indent=2)
                    print(f"Saved new Access Token to config file: {path}")
                except Exception as e:
                    print(f"Error writing config to {path}: {e}")

    def init_fyers(self):
        try:
            from fyers_apiv3 import fyersModel
            token_string = self.access_token

            self.fyers_model = fyersModel.FyersModel(
                client_id=self.app_id,
                token=token_string,
                is_async=False,
                log_path=""
            )
            # Profile test call
            profile = self.fyers_model.get_profile()
            if profile.get("s") == "ok":
                self.is_connected = True
                user_name = profile.get("data", {}).get("name", "FYERS User")
                print(f"FYERS API Connected! User: {user_name}")
                return {"status": "success", "user": user_name}
            else:
                self.is_connected = False
                print(f"FYERS Profile Check Failed: {profile}")
                return {"status": "error", "message": profile.get("message", "Authentication failed")}
                return {"status": "error", "message": profile.get("message", "Authentication failed")}
        except Exception as e:
            self.is_connected = False
            return {"status": "error", "message": str(e)}

    def get_stock_universe(self, fno_only: bool = True):
        """Returns stock universe (filtered to ~171 NSE FNO liquid stocks by default when fno_only is True)."""
        if fno_only:
            sector_map = {}
            sectors_file = os.path.join(os.path.dirname(__file__), "chartink-sectors.json")
            if os.path.exists(sectors_file):
                try:
                    with open(sectors_file, "r", encoding="utf-8") as sf:
                        sector_map = json.load(sf)
                except Exception:
                    pass
            universe = []
            for clean_sym in sorted(list(FNO_SYMBOLS)):
                fyers_symbol = "NSE:TMPV-EQ" if clean_sym == "TATAMOTORS" else f"NSE:{clean_sym}-EQ"
                sec = sector_map.get(clean_sym, "NIFTY FNO").upper()
                universe.append({
                    "symbol": fyers_symbol,
                    "name": clean_sym,
                    "sector": sec,
                    "base_price": 500.0
                })
            return universe

        cache_file = os.path.join(os.path.dirname(__file__), "nifty500-cache.json")
        sectors_file = os.path.join(os.path.dirname(__file__), "chartink-sectors.json")

        if os.path.exists(cache_file):
            try:
                with open(cache_file, "r", encoding="utf-8") as f:
                    n500_data = json.load(f)
                
                sector_map = {}
                if os.path.exists(sectors_file):
                    with open(sectors_file, "r", encoding="utf-8") as sf:
                        sector_map = json.load(sf)

                symbols = n500_data.get("symbols", [])
                if symbols:
                    universe = []
                    for sym in symbols:
                        clean_sym = sym.strip().upper()
                        fyers_symbol = f"NSE:{clean_sym}-EQ"
                        sec = sector_map.get(clean_sym, "NIFTY FNO").upper()
                        universe.append({
                            "symbol": fyers_symbol,
                            "name": clean_sym,
                            "sector": sec,
                            "base_price": 500.0
                        })
                    return universe
            except Exception as e:
                print(f"Error loading nifty500-cache.json: {e}")

        return [
            # NIFTY BANK
            {"symbol": "NSE:HDFCBANK-EQ", "name": "HDFC Bank", "sector": "NIFTY BANK", "base_price": 1650.0},
            {"symbol": "NSE:ICICIBANK-EQ", "name": "ICICI Bank", "sector": "NIFTY BANK", "base_price": 1180.0},
            {"symbol": "NSE:SBIN-EQ", "name": "State Bank of India", "sector": "NIFTY BANK", "base_price": 840.0},
            {"symbol": "NSE:KOTAKBANK-EQ", "name": "Kotak Mahindra Bank", "sector": "NIFTY BANK", "base_price": 1780.0},
            {"symbol": "NSE:AXISBANK-EQ", "name": "Axis Bank", "sector": "NIFTY BANK", "base_price": 1220.0},
            
            # NIFTY IT
            {"symbol": "NSE:TCS-EQ", "name": "Tata Consultancy Services", "sector": "NIFTY IT", "base_price": 4250.0},
            {"symbol": "NSE:INFY-EQ", "name": "Infosys", "sector": "NIFTY IT", "base_price": 1820.0},
            {"symbol": "NSE:HCLTECH-EQ", "name": "HCL Technologies", "sector": "NIFTY IT", "base_price": 1580.0},
            {"symbol": "NSE:WIPRO-EQ", "name": "Wipro", "sector": "NIFTY IT", "base_price": 520.0},
            {"symbol": "NSE:TECHM-EQ", "name": "Tech Mahindra", "sector": "NIFTY IT", "base_price": 1460.0},
            
            # NIFTY AUTO
            {"symbol": "NSE:TATAMOTORS-EQ", "name": "Tata Motors", "sector": "NIFTY AUTO", "base_price": 1050.0},
            {"symbol": "NSE:M&M-EQ", "name": "Mahindra & Mahindra", "sector": "NIFTY AUTO", "base_price": 2890.0},
            {"symbol": "NSE:MARUTI-EQ", "name": "Maruti Suzuki", "sector": "NIFTY AUTO", "base_price": 12400.0},
            {"symbol": "NSE:BAJAJ-AUTO-EQ", "name": "Bajaj Auto", "sector": "NIFTY AUTO", "base_price": 9650.0},
            
            # NIFTY PHARMA
            {"symbol": "NSE:SUNPHARMA-EQ", "name": "Sun Pharma", "sector": "NIFTY PHARMA", "base_price": 1720.0},
            {"symbol": "NSE:CIPLA-EQ", "name": "Cipla", "sector": "NIFTY PHARMA", "base_price": 1540.0},
            {"symbol": "NSE:DRREDDY-EQ", "name": "Dr Reddy's Labs", "sector": "NIFTY PHARMA", "base_price": 6850.0},
            {"symbol": "NSE:DIVISLAB-EQ", "name": "Divis Laboratories", "sector": "NIFTY PHARMA", "base_price": 4620.0},
            
            # NIFTY METAL & ENERGY
            {"symbol": "NSE:RELIANCE-EQ", "name": "Reliance Industries", "sector": "NIFTY ENERGY", "base_price": 2980.0},
            {"symbol": "NSE:TATASTEEL-EQ", "name": "Tata Steel", "sector": "NIFTY METAL", "base_price": 168.0},
            {"symbol": "NSE:JINDALSTEL-EQ", "name": "Jindal Steel & Power", "sector": "NIFTY METAL", "base_price": 980.0},
            {"symbol": "NSE:HINDALCO-EQ", "name": "Hindalco Industries", "sector": "NIFTY METAL", "base_price": 640.0},
            {"symbol": "NSE:COALINDIA-EQ", "name": "Coal India", "sector": "NIFTY ENERGY", "base_price": 490.0},
            {"symbol": "NSE:NTPC-EQ", "name": "NTPC", "sector": "NIFTY ENERGY", "base_price": 385.0},
            
            # NIFTY FMCG & CONSUMPTION
            {"symbol": "NSE:ITC-EQ", "name": "ITC", "sector": "NIFTY FMCG", "base_price": 485.0},
            {"symbol": "NSE:HINDUNILVR-EQ", "name": "Hindustan Unilever", "sector": "NIFTY FMCG", "base_price": 2640.0},
            {"symbol": "NSE:TITAN-EQ", "name": "Titan Company", "sector": "NIFTY CONSUMPTION", "base_price": 3480.0},
            {"symbol": "NSE:BHARTIARTL-EQ", "name": "Bharti Airtel", "sector": "NIFTY TELECOM", "base_price": 1460.0},
            {"symbol": "NSE:LT-EQ", "name": "Larsen & Toubro", "sector": "NIFTY INFRA", "base_price": 3620.0}
        ]

    def get_indices_summary(self):
        """Returns market overview indices (NIFTY 50, BANKNIFTY, SENSEX, NIFTY IT) from live FYERS API."""
        default_indices = [
            {"name": "NIFTY 50", "symbol": "NSE:NIFTY50-INDEX", "value": 24820.50, "change": 145.20, "pChange": 0.59},
            {"name": "NIFTY BANK", "symbol": "NSE:NIFTYBANK-INDEX", "value": 51640.80, "change": -85.40, "pChange": -0.17},
            {"name": "SENSEX", "symbol": "BSE:SENSEX-INDEX", "value": 81350.10, "change": 480.30, "pChange": 0.59},
            {"name": "NIFTY IT", "symbol": "NSE:NIFTYIT-INDEX", "value": 41200.25, "change": 620.15, "pChange": 1.53}
        ]

        if self.is_connected and self.fyers_model:
            try:
                symbols_str = "NSE:NIFTY50-INDEX,NSE:NIFTYBANK-INDEX,BSE:SENSEX-INDEX,NSE:NIFTYIT-INDEX"
                quotes = self.fyers_model.quotes({"symbols": symbols_str})
                if quotes.get("s") == "ok" and "d" in quotes:
                    live_indices = []
                    name_map = {
                        "NSE:NIFTY50-INDEX": "NIFTY 50",
                        "NSE:NIFTYBANK-INDEX": "NIFTY BANK",
                        "BSE:SENSEX-INDEX": "SENSEX",
                        "NSE:NIFTYIT-INDEX": "NIFTY IT"
                    }
                    for item in quotes["d"]:
                        sym = item.get("n", "")
                        v = item.get("v", {})
                        lp = v.get("lp", 0.0)
                        ch = v.get("ch", 0.0)
                        chp = v.get("chp", 0.0)
                        if sym in name_map:
                            live_indices.append({
                                "name": name_map[sym],
                                "symbol": sym,
                                "value": round(float(lp), 2),
                                "change": round(float(ch), 2),
                                "pChange": round(float(chp), 2)
                            })
                    if live_indices:
                        return live_indices
            except Exception as e:
                print(f"Notice fetching live quotes: {e}")

        return default_indices

    def fetch_historical_candles(self, symbol: str, timeframe: str = "D", days: int = 120):
        """Fetches live OHLCV dataframe directly from FYERS API with rate limiting & retries."""
        if self.is_connected and self.fyers_model:
            today = datetime.now()
            from_date = (today - timedelta(days=days)).strftime("%Y-%m-%d")
            to_date = today.strftime("%Y-%m-%d")
            
            resolution_map = {"1m": "1", "5m": "5", "15m": "15", "1h": "60", "D": "D", "W": "W"}
            res = resolution_map.get(timeframe, "D")

            data = {
                "symbol": symbol,
                "resolution": res,
                "date_format": "1",
                "range_from": from_date,
                "range_to": to_date,
                "cont_flag": "1"
            }

            for attempt in range(3):
                with self._api_semaphore:
                    try:
                        res_data = self.fyers_model.history(data=data)
                        if res_data.get("s") == "ok" and "candles" in res_data:
                            candles = res_data["candles"]
                            if candles:
                                df = pd.DataFrame(candles, columns=["timestamp", "open", "high", "low", "close", "volume"])
                                df["date"] = pd.to_datetime(df["timestamp"], unit="s")
                                return df
                        elif res_data.get("code") == -429:
                            time.sleep(0.35 * (attempt + 1))
                            continue
                    except Exception as e:
                        time.sleep(0.2)
                        continue

        return pd.DataFrame()

fyers_service = FyersService()
