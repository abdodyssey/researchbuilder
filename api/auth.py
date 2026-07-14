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

from config.settings import settings

SECRET_KEY = settings.SECRET_KEY
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


def check_token_limit(user: User, db: Session, required: int = 1, operation: str = "") -> None:
    """
    Pastikan user punya cukup saldo token SEBELUM memulai operasi.

    Admin selalu lolos (saldo unlimited). Untuk user biasa, kita cek apakah
    `tokens_balance >= required` — bukan sekadar `> 0` — agar user tidak bisa
    memulai proses mahal (mis. penulisan artikel ~25k token) dengan sisa saldo
    kecil, yang pasti gagal / mengering di tengah jalan.

    Raises:
        HTTPException 402 dengan detail terstruktur (balance, required, shortfall)
        agar frontend bisa menampilkan pesan tepat + CTA beli token.
    """
    if user.is_admin:
        return

    balance = user.tokens_balance
    if balance < required:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail={
                "message": (
                    "Saldo token habis. Silakan beli token untuk melanjutkan."
                    if balance <= 0
                    else "Saldo token tidak cukup untuk memulai proses ini. "
                    "Silakan beli token tambahan."
                ),
                "code": "insufficient_tokens",
                "balance": balance,
                "required": required,
                "shortfall": max(0, required - balance),
                "operation": operation,
            },
        )


def require_admin(current_user: User = Depends(get_current_user)) -> User:
    if not current_user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin only")
    return current_user
