import os
import threading
from pathlib import Path
from dotenv import load_dotenv, set_key

# Load .env file from backend directory or parent project root
ENV_PATHS = [
    Path(__file__).parent / ".env",
    Path(__file__).parent.parent / ".env"
]

env_file_found = None
for p in ENV_PATHS:
    if p.exists():
        load_dotenv(dotenv_path=p)
        env_file_found = p
        break

if not env_file_found:
    # Default to backend/.env for writing
    env_file_found = Path(__file__).parent / ".env"


def _persist_to_render(key: str, value: str):
    """
    Calls the Render API to update a single environment variable on the deployed service.
    This ensures the new token survives Render restarts/redeployments.
    Runs in a background thread so it never blocks the request.
    """
    render_api_key = os.getenv("RENDER_API_KEY", "")
    render_service_id = os.getenv("RENDER_SERVICE_ID", "")

    if not render_api_key or not render_service_id:
        print("[SecretManager] RENDER_API_KEY or RENDER_SERVICE_ID not set — skipping Render env var persistence.")
        return

    try:
        import urllib.request
        import json

        url = f"https://api.render.com/v1/services/{render_service_id}/env-vars"
        headers = {
            "Authorization": f"Bearer {render_api_key}",
            "Content-Type": "application/json",
            "Accept": "application/json"
        }

        # Step 1: GET all current env vars
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=10) as resp:
            existing = json.loads(resp.read().decode())

        # existing is a list of {"envVar": {"key": ..., "value": ...}} dicts
        env_list = []
        found = False
        for item in existing:
            ev = item.get("envVar", item)  # handle both response shapes
            k = ev.get("key", "")
            v = ev.get("value", "")
            if k == key:
                env_list.append({"key": k, "value": value})
                found = True
            elif k:  # skip entries with no key
                env_list.append({"key": k, "value": v})

        if not found:
            env_list.append({"key": key, "value": value})

        # Step 2: PUT updated list back
        body = json.dumps(env_list).encode("utf-8")
        put_req = urllib.request.Request(url, data=body, headers=headers, method="PUT")
        with urllib.request.urlopen(put_req, timeout=10) as resp:
            status = resp.status

        print(f"[SecretManager] Render env var '{key}' updated via API (HTTP {status}). Will persist across restarts.")

    except Exception as e:
        print(f"[SecretManager] Could not update Render env var '{key}': {e}")


class SecretManager:
    @staticmethod
    def get_fyers_app_id() -> str:
        return os.getenv("FYERS_APP_ID", "")

    @staticmethod
    def get_fyers_secret_key() -> str:
        return os.getenv("FYERS_SECRET_KEY", "")

    @staticmethod
    def get_fyers_access_token() -> str:
        return os.getenv("FYERS_ACCESS_TOKEN", "")

    @staticmethod
    def save_access_token(access_token: str):
        """
        1. Updates FYERS_ACCESS_TOKEN in current process environment (instant).
        2. Writes to local .env file (for local runs).
        3. Persists to Render environment variables via API (for production restarts).
        """
        # Step 1: immediate in-process update
        os.environ["FYERS_ACCESS_TOKEN"] = access_token

        # Step 2: write to local .env
        try:
            if not env_file_found.exists():
                env_file_found.touch()
            set_key(dotenv_path=str(env_file_found), key_to_set="FYERS_ACCESS_TOKEN", value_to_set=access_token)
            print(f"[SecretManager] Updated FYERS_ACCESS_TOKEN in {env_file_found}")
        except Exception as e:
            print(f"[SecretManager] Note: saved token to env memory (could not write .env: {e})")

        # Step 3: persist to Render env vars in background (non-blocking)
        threading.Thread(
            target=_persist_to_render,
            args=("FYERS_ACCESS_TOKEN", access_token),
            daemon=True
        ).start()

    @staticmethod
    def save_credentials(app_id: str, access_token: str, secret_key: str = ""):
        os.environ["FYERS_APP_ID"] = app_id
        os.environ["FYERS_ACCESS_TOKEN"] = access_token
        if secret_key:
            os.environ["FYERS_SECRET_KEY"] = secret_key

        try:
            if not env_file_found.exists():
                env_file_found.touch()
            set_key(dotenv_path=str(env_file_found), key_to_set="FYERS_APP_ID", value_to_set=app_id)
            set_key(dotenv_path=str(env_file_found), key_to_set="FYERS_ACCESS_TOKEN", value_to_set=access_token)
            if secret_key:
                set_key(dotenv_path=str(env_file_found), key_to_set="FYERS_SECRET_KEY", value_to_set=secret_key)
        except Exception as e:
            print(f"[SecretManager] Error saving credentials to .env: {e}")

        # Also persist to Render env vars (non-blocking)
        threading.Thread(target=_persist_to_render, args=("FYERS_APP_ID", app_id), daemon=True).start()
        threading.Thread(target=_persist_to_render, args=("FYERS_ACCESS_TOKEN", access_token), daemon=True).start()


secret_manager = SecretManager()
