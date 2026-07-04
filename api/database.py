from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
import os

is_vercel = os.environ.get("VERCEL")
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

default_db = "sqlite:////tmp/researchbuilder.db" if is_vercel else f"sqlite:///{os.path.join(BASE_DIR, 'data', 'researchbuilder.db')}"
DATABASE_URL = os.getenv("DATABASE_URL", default_db)

_is_sqlite = DATABASE_URL.startswith("sqlite")

if _is_sqlite:
    os.makedirs(os.path.join(BASE_DIR, "data"), exist_ok=True)
    engine = create_engine(
        DATABASE_URL,
        connect_args={"check_same_thread": False},
    )
else:
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
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def init_db():
    from models import User, Payment
    Base.metadata.create_all(bind=engine)
