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
from sqlalchemy import Column, String, Integer, Boolean, DateTime, ForeignKey, UniqueConstraint
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

    tokens_purchased = Column(Integer, default=0)
    tokens_used = Column(Integer, default=0)

    # Legacy columns kept for SQLite compat — not used by app logic
    plan = Column(String, default="active")
    tokens_reset_at = Column(DateTime, nullable=True)
    trial_started_at = Column(DateTime, nullable=True)
    trial_ends_at = Column(DateTime, nullable=True)

    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=utcnow)

    payments = relationship("Payment", back_populates="user")

    @property
    def tokens_balance(self) -> int:
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

    # Legacy column — not used by app logic
    plan = Column(String, nullable=True)

    user = relationship("User", back_populates="payments")
