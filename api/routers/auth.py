"""
Auth Router — Register, Login, Profile management.
"""

import secrets
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.orm import Session

from auth import get_current_user, hash_password, verify_password, create_access_token
from config.plans import FREE_TOKENS
from database import get_db
from models import User
from utils.mailer import send_verification_email

router = APIRouter(prefix="/api/auth", tags=["auth"])

# Magic link berlaku 24 jam.
VERIFICATION_TTL = timedelta(hours=24)
# Batas frekuensi kirim ulang email verifikasi (anti-spam).
RESEND_COOLDOWN = timedelta(seconds=60)


def _naive_utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    full_name: str = ""


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


@router.post("/register")
async def api_register(req: RegisterRequest, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.email == req.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email sudah terdaftar")
    token = secrets.token_urlsafe(32)
    user = User(
        email=req.email,
        password_hash=hash_password(req.password),
        full_name=req.full_name,
        tokens_purchased=FREE_TOKENS,
        email_verified=False,
        verification_token=token,
        verification_sent_at=_naive_utcnow(),
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    send_verification_email(user.email, user.full_name or "", token)

    # Tidak auto-login: user wajib verifikasi email dulu (login diblokir sampai verified).
    return {
        "detail": "Pendaftaran berhasil. Cek email Anda untuk verifikasi akun.",
        "email": user.email,
        "requires_verification": True,
    }


@router.post("/login")
async def api_login(req: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == req.email).first()
    if not user or not verify_password(req.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Email atau password salah")
    if not user.email_verified:
        raise HTTPException(
            status_code=403,
            detail="Email belum diverifikasi. Cek inbox Anda atau minta kirim ulang tautan verifikasi.",
        )
    token = create_access_token(user.id)
    return {"token": token, "user": {"id": user.id, "email": user.email, "role": user.role, "tokens_balance": user.tokens_balance}}


class VerifyRequest(BaseModel):
    token: str


@router.post("/verify")
async def api_verify(req: VerifyRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.verification_token == req.token).first()
    if not user:
        raise HTTPException(status_code=400, detail="Tautan verifikasi tidak valid atau sudah digunakan.")

    if user.email_verified:
        # Idempotent: sudah verified, langsung terbitkan token login.
        access = create_access_token(user.id)
        return {"token": access, "user": {"id": user.id, "email": user.email, "role": user.role, "tokens_balance": user.tokens_balance}}

    sent_at = user.verification_sent_at
    if sent_at and _naive_utcnow() - sent_at > VERIFICATION_TTL:
        raise HTTPException(status_code=400, detail="Tautan verifikasi kedaluwarsa. Silakan minta kirim ulang.")

    user.email_verified = True
    user.verification_token = None  # sekali pakai
    db.commit()
    db.refresh(user)

    # Auto-login setelah verifikasi berhasil.
    access = create_access_token(user.id)
    return {"token": access, "user": {"id": user.id, "email": user.email, "role": user.role, "tokens_balance": user.tokens_balance}}


class ResendRequest(BaseModel):
    email: EmailStr


@router.post("/resend-verification")
async def api_resend_verification(req: ResendRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == req.email).first()
    # Respons selalu sama walau user tidak ada — cegah enumerasi email.
    generic = {"detail": "Jika email terdaftar dan belum diverifikasi, tautan baru telah dikirim."}
    if not user or user.email_verified:
        return generic

    now = _naive_utcnow()
    if user.verification_sent_at and now - user.verification_sent_at < RESEND_COOLDOWN:
        raise HTTPException(status_code=429, detail="Terlalu sering. Tunggu sebentar sebelum minta kirim ulang.")

    token = secrets.token_urlsafe(32)
    user.verification_token = token
    user.verification_sent_at = now
    db.commit()
    send_verification_email(user.email, user.full_name or "", token)
    return generic


@router.get("/me")
async def api_me(current_user: User = Depends(get_current_user)):
    return {
        "id": current_user.id,
        "email": current_user.email,
        "full_name": current_user.full_name,
        "role": current_user.role,
        "tokens_balance": current_user.tokens_balance,
        "tokens_used": current_user.tokens_used,
        "tokens_purchased": current_user.tokens_purchased,
        "created_at": current_user.created_at.isoformat() if current_user.created_at else None,
    }


class UpdateProfileRequest(BaseModel):
    full_name: str = Field(min_length=1, max_length=100)


@router.patch("/me")
async def api_update_profile(
    req: UpdateProfileRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    current_user.full_name = req.full_name.strip()
    db.commit()
    db.refresh(current_user)
    return {
        "id": current_user.id,
        "email": current_user.email,
        "full_name": current_user.full_name,
        "role": current_user.role,
        "tokens_balance": current_user.tokens_balance,
        "tokens_used": current_user.tokens_used,
        "tokens_purchased": current_user.tokens_purchased,
        "created_at": current_user.created_at.isoformat() if current_user.created_at else None,
    }


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8)


@router.post("/change-password")
async def api_change_password(
    req: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not verify_password(req.current_password, current_user.password_hash):
        raise HTTPException(status_code=400, detail="Kata sandi saat ini salah")
    current_user.password_hash = hash_password(req.new_password)
    db.commit()
    return {"detail": "Kata sandi berhasil diperbarui"}
