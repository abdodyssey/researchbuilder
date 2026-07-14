"""
Database Setup — SQLAlchemy + PostgreSQL
======================================
Konfigurasi database untuk ResearchBuilder.

Environment:
- PostgreSQL (Neon) via DATABASE_URL env var.
- SQLite sudah dihapus sepenuhnya untuk mendukung production scale.
"""

from sqlalchemy import create_engine, event, text
from sqlalchemy.orm import sessionmaker, declarative_base
import os
from config.settings import settings

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

DATABASE_URL = settings.DATABASE_URL


def _normalize_pg_url(url: str) -> str:
    """Paksa driver psycopg (v3) untuk URL Postgres.
    Neon/Supabase memberi URL berformat `postgresql://...` yang secara default
    memakai psycopg2. Kita pakai psycopg3 → ubah scheme ke `postgresql+psycopg://`.
    """
    if url.startswith("postgresql+"):
        return url  # driver sudah eksplisit
    if url.startswith("postgresql://"):
        return url.replace("postgresql://", "postgresql+psycopg://", 1)
    if url.startswith("postgres://"):
        # Beberapa provider memakai skema lama `postgres://`
        return url.replace("postgres://", "postgresql+psycopg://", 1)
    return url


# PostgreSQL (Neon/Supabase): gunakan connection pooling.
# Neon pooled endpoint memakai PgBouncer (transaction mode) — prepared
# statement caching psycopg3 bisa bentrok, jadi kita nonaktifkan via
# prepare_threshold=None. pool_pre_ping mencegah pakai koneksi mati.
DATABASE_URL = _normalize_pg_url(DATABASE_URL)
engine = create_engine(
    DATABASE_URL,
    pool_size=5,
    max_overflow=10,
    pool_pre_ping=True,
    pool_recycle=300,
    connect_args={"prepare_threshold": None},
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    """FastAPI dependency: buat database session per-request, auto-close setelah selesai."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def init_db():
    """Buat semua tabel yang belum exist (dipanggil saat app startup)."""
    from models import User, Payment, ResearchJob
    Base.metadata.create_all(bind=engine)
