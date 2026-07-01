import uuid
from datetime import datetime, timezone, timedelta
from sqlalchemy import Column, String, Integer, Boolean, DateTime, ForeignKey
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

    plan = Column(String, default="trial")  # trial | basic | premium
    credits_used = Column(Integer, default=0)
    credits_reset_at = Column(DateTime, default=utcnow)

    trial_started_at = Column(DateTime, default=utcnow)
    trial_ends_at = Column(DateTime, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(days=30))

    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=utcnow)

    payments = relationship("Payment", back_populates="user")

    def is_trial_expired(self) -> bool:
        if self.plan != "trial":
            return False
        return utcnow() > self.trial_ends_at

    def credits_remaining(self, plan_credits: int) -> int:
        if plan_credits == -1:
            return -1  # unlimited
        return max(0, plan_credits - self.credits_used)


class Payment(Base):
    __tablename__ = "payments"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    mayar_payment_id = Column(String, nullable=True)
    plan = Column(String, nullable=False)
    amount = Column(Integer, nullable=False)
    status = Column(String, default="pending")  # pending | paid | expired
    created_at = Column(DateTime, default=utcnow)

    user = relationship("User", back_populates="payments")
