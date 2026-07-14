"""
Admin Router — User management (admin-only).
"""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from auth import require_admin
from config.settings import settings
from database import get_db
from models import User

router = APIRouter(prefix="/api/admin", tags=["admin"])


@router.get("/users")
async def admin_list_users(
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    users = db.query(User).order_by(User.created_at.desc()).all()
    return [
        {
            "id": u.id,
            "email": u.email,
            "full_name": u.full_name,
            "role": u.role,
            "tokens_balance": u.tokens_balance,
            "tokens_used": u.tokens_used,
            "tokens_purchased": u.tokens_purchased,
            "is_active": u.is_active,
            "created_at": u.created_at.isoformat() if u.created_at else None,
        }
        for u in users
    ]


class AdminUpdateUserRequest(BaseModel):
    role: Optional[str] = None
    is_active: Optional[bool] = None
    tokens_purchased: Optional[int] = None


@router.patch("/users/{user_id}")
async def admin_update_user(
    user_id: str,
    req: AdminUpdateUserRequest,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    target = db.query(User).filter(User.id == user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if req.role is not None:
        target.role = req.role
    if req.is_active is not None:
        target.is_active = req.is_active
    if req.tokens_purchased is not None:
        target.tokens_purchased = req.tokens_purchased
    db.commit()
    db.refresh(target)
    return {
        "id": target.id,
        "email": target.email,
        "full_name": target.full_name,
        "role": target.role,
        "tokens_balance": target.tokens_balance,
        "tokens_used": target.tokens_used,
        "tokens_purchased": target.tokens_purchased,
        "is_active": target.is_active,
    }


@router.delete("/users/{user_id}")
async def admin_delete_user(
    user_id: str,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    if user_id == admin.id:
        raise HTTPException(status_code=400, detail="Tidak bisa menghapus akun sendiri")
    target = db.query(User).filter(User.id == user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
        
    # Manual cascade delete to avoid IntegrityError on PostgreSQL
    from models import ResearchJob, Payment
    db.query(ResearchJob).filter(ResearchJob.user_id == user_id).delete(synchronize_session=False)
    db.query(Payment).filter(Payment.user_id == user_id).delete(synchronize_session=False)
    
    db.delete(target)
    db.commit()
    return {"detail": "User dan seluruh data terkait berhasil dihapus"}


@router.get("/stats")
async def admin_stats(
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    from sqlalchemy import func
    from models import ResearchJob
    import os
    
    total_users = db.query(func.count(User.id)).scalar()
    total_tokens = db.query(func.sum(User.tokens_used)).scalar() or 0
    total_docs = db.query(func.count(ResearchJob.id)).filter(ResearchJob.pipeline_data.isnot(None)).scalar()
    
    groq_key = settings.GROQ_API_KEY if settings.GROQ_API_KEY != "missing_api_key_on_vercel" else None
    ss_key = settings.SEMANTIC_SCHOLAR_API_KEY
    
    return {
        "total_users": total_users,
        "total_tokens_used": total_tokens,
        "total_documents": total_docs,
        "apis": {
            "groq": "Terkoneksi" if groq_key else "Tidak Terkoneksi",
            "semantic_scholar": "Terkoneksi (Premium)" if ss_key else "Mode Publik (Rate-Limited)",
        }
    }
