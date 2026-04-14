import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase

from backend.config import DATABASE_URL

# Criar pasta data se usar SQLite local
if DATABASE_URL.startswith("sqlite"):
    os.makedirs("data", exist_ok=True)

connect_args = {}
if DATABASE_URL.startswith("sqlite"):
    connect_args["check_same_thread"] = False

engine = create_engine(DATABASE_URL, connect_args=connect_args, echo=False)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    from backend.models import (  # noqa: F401
        Tomador, Nfse, PrestadorConfig, Empresa, XmlLog, Captura,
        FaturamentoMensal, FolhaMensal, FatorRHistorico,
    )
    Base.metadata.create_all(bind=engine)
