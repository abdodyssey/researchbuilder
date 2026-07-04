import os
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
import bcrypt
from sqlalchemy.orm import Session

from database import get_db
from models import User

SECRET_KEY = os.getenv("SECRET_KEY", "")
if not SECRET_KEY:
    import warnings
    warnings.warn("SECRET_KEY not set — using insecure default. Set SECRET_KEY env var in production!", stacklevel=2)
    SECRET_KEY = "dev-only-insecure-default-key"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 7 hari


bearer_scheme = HTTPBearer()


# ── Password ──────────────────────────────────────────────────────────────────
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()

def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode(), hashed.encode())


# ── JWT ───────────────────────────────────────────────────────────────────────
def create_access_token(user_id: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    return jwt.encode({"sub": user_id, "exp": expire}, SECRET_KEY, algorithm=ALGORITHM)

def decode_token(token: str) -> Optional[str]:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload.get("sub")
    except JWTError:
        return None


# ── Dependency ────────────────────────────────────────────────────────────────
def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    token = credentials.credentials
    user_id = decode_token(token)
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token tidak valid")

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User tidak ditemukan")
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Akun dinonaktifkan")

    return user

def get_current_user_optional(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(HTTPBearer(auto_error=False)),
    db: Session = Depends(get_db),
) -> Optional[User]:
    if not credentials:
        return None
    token = credentials.credentials
    user_id = decode_token(token)
    if not user_id:
        return None
    return db.query(User).filter(User.id == user_id).first()


# ── Token Check ──────────────────────────────────────────────────────────────
def check_token_limit(user: User, db: Session) -> None:
    from config.plans import get_plan
    from datetime import datetime, timezone

    # Cek trial expired
    if user.plan == "trial" and user.is_trial_expired():
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Trial 30 hari Anda telah habis. Silakan upgrade ke Basic atau Premium."
        )

    plan = get_plan(user.plan)
    tokens = plan["tokens"]

    # Reset bulanan
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    if user.tokens_reset_at and (now - user.tokens_reset_at).days >= 30:
        user.tokens_used = 0
        user.tokens_reset_at = now
        db.commit()

    # Cek limit
    if tokens != -1 and user.tokens_used >= tokens:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail=f"Token habis. Anda telah menggunakan {user.tokens_used}/{tokens} token bulan ini."
        )
