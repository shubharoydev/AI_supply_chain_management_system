import os

def verify_api_key(api_key: str) -> bool:
    expected = os.getenv("API_KEY")
    if not expected:
        return False
    return api_key == expected
