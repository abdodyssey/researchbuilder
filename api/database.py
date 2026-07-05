"""
Database Setup — SQLAlchemy + SQLite
======================================
Konfigurasi database untuk ResearchBuilder.

Environment:
- VPS (production): SQLite di api/data/researchbuilder.db (persistent, di dalam direktori proyek)
- Optional:         PostgreSQL via DATABASE_URL env var (future scaling)

WAL Mode (Write-Ahead Logging):
- Diaktifkan pada setiap koneksi SQLite via event listener.
- Memungkinkan read concurrent tanpa blocking saat webhook sedang menulis data
  (misalnya: webhook Mayar mengkredit token sementara user polling status).
- synchronous=NORMAL: aman dari korups data, lebih cepat dari FULL mode default.

Note: SQLite dipilih karena cukup untuk SaaS MVP skala mahasiswa dan
data tersimpan persisten di VPS tanpa ketergantungan layanan eksternal.
"""

from sqlalchemy import create_engine, event, text
from sqlalchemy.orm import sessionmaker, declarative_base
import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# Path database: selalu ke direktori proyek di VPS (persistent)
# Override via DATABASE_URL env var jika diperlukan (mis. PostgreSQL di masa depan)
default_db = f"sqlite:///{os.path.join(BASE_DIR, 'data', 'researchbuilder.db')}"
DATABASE_URL = os.getenv("DATABASE_URL", default_db)

_is_sqlite = DATABASE_URL.startswith("sqlite")

if _is_sqlite:
    # SQLite: buat folder data/ jika belum ada, disable thread check
    os.makedirs(os.path.join(BASE_DIR, "data"), exist_ok=True)
    engine = create_engine(
        DATABASE_URL,
        connect_args={"check_same_thread": False},
    )

    # ── WAL Mode: aktifkan di setiap koneksi baru ──────────────────────────────
    # Harus via event listener (bukan sekali saja) agar berlaku untuk semua
    # koneksi dari connection pool, termasuk koneksi baru setelah idle timeout.
    @event.listens_for(engine, "connect")
    def set_sqlite_wal(dbapi_conn, connection_record):
        cursor = dbapi_conn.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")       # concurrent read-write
        cursor.execute("PRAGMA synchronous=NORMAL")     # aman + lebih cepat dari FULL
        cursor.close()

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
