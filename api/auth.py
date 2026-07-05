"""
Auth Module — JWT Authentication & Authorization
===================================================
Menangani autentikasi dan otorisasi untuk ResearchBuilder API.

Komponen:
- Password hashing (bcrypt)
- JWT token creation & validation (python-jose)
- FastAPI dependencies: get_current_user, check_token_limit
- Token balance enforcement: cek apakah user masih punya saldo
"""

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

_raw_secret = os.getenv("SECRET_KEY", "")
if not _raw_secret:
    # Di development: generate key acak per-process (tidak persisten, JWT hangus saat restart).
    # Di produksi: wajib set SECRET_KEY di environment — jika tidak, server tidak boleh jalan.
    import secrets as _secrets
    _is_production = os.getenv("ENVIRONMENT", "development").lower() == "production"
    if _is_production:
        raise RuntimeError(
            "SECRET_KEY environment variable wajib di-set di produksi. "
            "Generate dengan: python -c \"import secrets; print(secrets.token_hex(32))\""
        )
    import warnings
    warnings.warn(
        "SECRET_KEY tidak di-set — menggunakan key acak sementara (dev only). "
        "JWT akan hangus setiap restart server. Set SECRET_KEY di .env untuk menghindari ini.",
        stacklevel=2,
    )
    _raw_secret = _secrets.token_hex(32)

SECRET_KEY = _raw_secret
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7


bearer_scheme = HTTPBearer()


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()

def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode(), hashed.encode())


def create_access_token(user_id: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    return jwt.encode({"sub": user_id, "exp": expire}, SECRET_KEY, algorithm=ALGORITHM)

def decode_token(token: str) -> Optional[str]:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload.get("sub")
    except JWTError:
        return None


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


def check_token_limit(user: User, db: Session) -> None:
    if user.tokens_balance <= 0:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail="Saldo token habis. Silakan beli token untuk melanjutkan."
        )
