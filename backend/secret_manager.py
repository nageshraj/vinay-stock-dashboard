import os
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
        """Updates FYERS_ACCESS_TOKEN in current environment and .env file."""
        os.environ["FYERS_ACCESS_TOKEN"] = access_token
        try:
            if not env_file_found.exists():
                env_file_found.touch()
            set_key(dotenv_path=str(env_file_found), key_to_set="FYERS_ACCESS_TOKEN", value_to_set=access_token)
            print(f"Updated FYERS_ACCESS_TOKEN in {env_file_found}")
        except Exception as e:
            print(f"Note: Saved token to environment (could not write to .env: {e})")

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
            print(f"Error saving to .env: {e}")

secret_manager = SecretManager()
