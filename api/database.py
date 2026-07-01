from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import os

is_vercel = os.environ.get("VERCEL")
default_db = "sqlite:////tmp/researchbuilder.db" if is_vercel else "sqlite:///./data/researchbuilder.db"
DATABASE_URL = os.getenv("DATABASE_URL", default_db)

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False}  # SQLite only
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
