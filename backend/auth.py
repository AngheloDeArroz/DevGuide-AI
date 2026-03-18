"""
Authentication module for DevGuide AI.
Verifies Supabase JWT tokens (ES256) and extracts user_id.
"""
import os
import jwt
import httpx
import logging
from jwt.algorithms import ECAlgorithm
from fastapi import HTTPException, Security
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

SUPABASE_URL = os.getenv("SUPABASE_URL")

if not SUPABASE_URL:
    raise ValueError("SUPABASE_URL is not set in the environment variables.")

JWKS_URL = f"{SUPABASE_URL}/auth/v1/.well-known/jwks.json"


def _fetch_public_key():
    """Fetch Supabase ES256 public key from JWKS endpoint at startup."""
    try:
        response = httpx.get(JWKS_URL, timeout=10)
        response.raise_for_status()
        jwks = response.json()
        key_data = jwks["keys"][0]
        public_key = ECAlgorithm.from_jwk(key_data)
        logger.info("[auth] Successfully loaded Supabase ES256 public key from JWKS")
        return public_key
    except Exception as e:
        logger.error(f"[auth] Failed to fetch JWKS public key: {e}")
        raise RuntimeError(f"Could not fetch Supabase public key: {e}")


PUBLIC_KEY = _fetch_public_key()

security = HTTPBearer()


async def get_current_user(credentials: HTTPAuthorizationCredentials = Security(security)) -> str:
    """
    FastAPI dependency that verifies the Supabase JWT token (ES256)
    and returns the user_id (sub claim).
    """
    token = credentials.credentials

    try:
        payload = jwt.decode(
            token,
            PUBLIC_KEY,
            algorithms=["ES256"],
            audience="authenticated"
        )
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token: no user ID found")

        logger.info(f"[auth] Verified user_id={user_id}")
        return user_id

    except jwt.ExpiredSignatureError:
        logger.warning("[auth] Token expired")
        raise HTTPException(status_code=401, detail="Token has expired. Please sign in again.")
    except jwt.InvalidTokenError as e:
        logger.warning(f"[auth] Invalid token: {e}")
        raise HTTPException(status_code=401, detail="Invalid authentication token.")
