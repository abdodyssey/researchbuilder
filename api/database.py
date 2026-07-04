"""
Database Setup — SQLAlchemy + SQLite
======================================
Konfigurasi database untuk ResearchBuilder.

Environment:
- Vercel (serverless): SQLite di /tmp (ephemeral, reset tiap cold start)
- VPS (production):    SQLite di api/data/researchbuilder.db (persistent)
- Optional:            PostgreSQL via DATABASE_URL env var (future scaling)

Note: SQLite digunakan karena VPS tidak punya sudo access untuk install PostgreSQL.
Untuk skala besar nanti, tinggal ganti DATABASE_URL ke PostgreSQL.
"""

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
import os

is_vercel = os.environ.get("VERCEL")
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# Path database: /tmp untuk Vercel (serverless), api/data/ untuk VPS
default_db = "sqlite:////tmp/researchbuilder.db" if is_vercel else f"sqlite:///{os.path.join(BASE_DIR, 'data', 'researchbuilder.db')}"
DATABASE_URL = os.getenv("DATABASE_URL", default_db)

_is_sqlite = DATABASE_URL.startswith("sqlite")

if _is_sqlite:
    # SQLite: buat folder data/ jika belum ada, disable thread check
    os.makedirs(os.path.join(BASE_DIR, "data"), exist_ok=True)
    engine = create_engine(
        DATABASE_URL,
        connect_args={"check_same_thread": False},
    )
else:
    # PostgreSQL/lainnya: gunakan connection pooling
    engine = create_engine(
        DATABASE_URL,
        pool_size=5,
        max_overflow=10,
        pool_pre_ping=True,
        pool_recycle=300,
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
    from models import User, Payment
    Base.metadata.create_all(bind=engine)
