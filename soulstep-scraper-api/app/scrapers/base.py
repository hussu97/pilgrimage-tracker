import secrets
import time

import requests


def generate_code(prefix: str) -> str:
    """Generate a unique code with the given prefix."""
    return f"{prefix}_{secrets.token_hex(4)}"


def make_request_with_backoff(method: str, url: str, **kwargs) -> requests.Response | None:
    """Make HTTP request with exponential backoff on rate limits."""
    wait_time = 5
    retries = 0
    max_retries = 5
    while retries < max_retries:
        try:
            response = requests.request(method, url, **kwargs)
            if response.status_code == 429:
                print(f"Rate limit hit (429). Retrying in {wait_time}s...")
                time.sleep(wait_time)
                wait_time *= 2
                retries += 1
                continue
            return response
        except Exception as e:
            print(f"Request error: {e}")
            return None
    return None
