"""
ORM Models — SQLAlchemy
=========================
Definisi tabel database untuk ResearchBuilder.

Tabel:
- users:    Data pengguna, saldo token (PAYG top-up model)
- payments: Riwayat pembelian token (integrasi Mayar payment gateway)

Billing: Pay-As-You-Go — user beli token, pakai, beli lagi.
Balance = tokens_purchased - tokens_used.
"""

import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Integer, Boolean, DateTime, ForeignKey, UniqueConstraint, JSON, Index
from sqlalchemy.orm import relationship
from database import Base


def utcnow():
    return datetime.now(timezone.utc).replace(tzinfo=None)


class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    email = Column(String, unique=True, nullable=False, index=True)
    password_hash = Column(String, nullable=False)
    full_name = Column(String, nullable=True)
    role = Column(String, default="user")  # "user" | "admin"

    tokens_purchased = Column(Integer, default=0)
    tokens_used = Column(Integer, default=0)

    # Verifikasi email (magic link). User baru wajib verifikasi sebelum bisa login.
    email_verified = Column(Boolean, default=False)
    verification_token = Column(String, nullable=True, index=True)
    verification_sent_at = Column(DateTime, nullable=True)

    # Kolom legacy — tetap ada untuk compat. Hapus via Alembic migration nanti.
    plan             = Column(String,   default="active")
    tokens_reset_at  = Column(DateTime, nullable=True)
    trial_started_at = Column(DateTime, nullable=True)
    trial_ends_at    = Column(DateTime, nullable=True)

    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=utcnow)

    payments = relationship("Payment", back_populates="user")

    @property
    def is_admin(self) -> bool:
        return self.role == "admin"

    @property
    def tokens_balance(self) -> int:
        if self.is_admin:
            return 999_999_999
        return max(0, self.tokens_purchased - self.tokens_used)


class Payment(Base):
    __tablename__ = "payments"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    mayar_payment_id = Column(String, nullable=True, unique=True, index=True)  # unique: cegah double-process webhook retry
    package_key = Column(String, nullable=True)
    tokens_added = Column(Integer, default=0)
    amount = Column(Integer, nullable=False)
    status = Column(String, default="pending")  # pending | paid | expired
    created_at = Column(DateTime, default=utcnow)

    # Kolom ini tidak lagi digunakan. Tetap ada karena SQLite tidak support DROP COLUMN.
    # Hapus via Alembic migration saat pindah ke PostgreSQL.
    plan = Column(String, nullable=True)  # ex-subscription plan

    user = relationship("User", back_populates="payments")


class ResearchJob(Base):
    """
    State satu sesi riset interaktif (Topik → Judul → Outline → Penulisan → Hasil).

    Menggantikan penyimpanan berbasis file JSON (research_*.json + pipeline_state_*.json)
    agar state hidup di database — konsisten, bisa di-query per user, dan siap untuk
    horizontal scale saat pindah ke Neon Postgres.

    Desain: kolom yang sering di-query (user_id, status, step, created_at) dipromosikan
    jadi kolom asli untuk index; sisa state kompleks (title_options, pipeline stages, dst)
    disimpan sebagai JSON di kolom `data`. JSON = native di Postgres, TEXT di SQLite.
    """
    __tablename__ = "research_jobs"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)

    status = Column(String, default="generating_titles", index=True)
    step = Column(Integer, default=1)

    # Referensi ke pipeline penulisan (dulu pipeline_state_{id}.json).
    pipeline_id = Column(String, nullable=True, index=True)

    # Snapshot lengkap ResearchSession (Pydantic) sebagai JSON.
    session_data = Column(JSON, nullable=True)
    # Snapshot lengkap PipelineState (Pydantic) sebagai JSON.
    pipeline_data = Column(JSON, nullable=True)

    error = Column(String, nullable=True)
    created_at = Column(DateTime, default=utcnow, index=True)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)

    user = relationship("User")


# Index gabungan untuk query "daftar riset milik user, terbaru dulu".
Index("ix_research_jobs_user_created", ResearchJob.user_id, ResearchJob.created_at)
