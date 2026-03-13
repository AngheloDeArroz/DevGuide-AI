import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from dotenv import load_dotenv

load_dotenv()

# We need the sqlalchemy URI, e.g., postgresql://user:password@host:port/dbname
DATABASE_URL = os.getenv("SUPABASE_DB_URL")

if not DATABASE_URL:
    raise ValueError("SUPABASE_DB_URL is not set in the environment variables.")

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
