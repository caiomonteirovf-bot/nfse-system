import os

from fastapi import FastAPI, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session

from backend.database import init_db, get_db
from backend.models.tomador import Tomador
from backend.models.prestador import PrestadorConfig
from backend.routers import tomadores, nfses, emissao, prestador, empresas, xml_logs, captura, clientes, cnpj

app = FastAPI(title="NFS-e System API", version="1.0.0")

# CORS
_allowed_origins = os.getenv("ALLOWED_ORIGINS", "*")
_origins = [o.strip() for o in _allowed_origins.split(",")] if _allowed_origins != "*" else ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    return JSONResponse(
        status_code=500,
        content={"ok": False, "error": str(exc) or "Erro inesperado."},
    )


# --- Routers ---
app.include_router(tomadores.router, prefix="/api")
app.include_router(nfses.router, prefix="/api")
app.include_router(emissao.router, prefix="/api")
app.include_router(prestador.router, prefix="/api")
app.include_router(xml_logs.router, prefix="/api")
app.include_router(captura.router, prefix="/api")
app.include_router(clientes.router, prefix="/api")
app.include_router(cnpj.router, prefix="/api")
app.include_router(empresas.router, prefix="/api")


@app.get("/api/health")
def health():
    return {"ok": True, "service": "nfse-system", "version": "1.0.0", "status": "running"}


@app.get("/api/bootstrap")
def bootstrap(db: Session = Depends(get_db)):
    tomadores_list = db.query(Tomador).filter(Tomador.ativo == True).order_by(Tomador.razao_social).all()
    config = db.query(PrestadorConfig).first()
    return {
        "ok": True,
        "data": {
            "tomadores": [t.to_dict() for t in tomadores_list],
            "prestador": config.to_dict() if config else None,
        },
    }


@app.on_event("startup")
def on_startup():
    init_db()

    # Criar registro singleton de PrestadorConfig se nao existir
    from backend.database import SessionLocal
    db = SessionLocal()
    try:
        config = db.query(PrestadorConfig).first()
        if not config:
            from backend.config import (
                NFSE_PRESTADOR_CNPJ, NFSE_INSCRICAO_MUNICIPAL,
                NFSE_RAZAO_SOCIAL, NFSE_MUNICIPIO_CODIGO,
                NFSE_WEBSERVICE_URL, NFSE_AMBIENTE,
            )
            config = PrestadorConfig(
                cnpj=NFSE_PRESTADOR_CNPJ,
                inscricao_municipal=NFSE_INSCRICAO_MUNICIPAL,
                razao_social=NFSE_RAZAO_SOCIAL,
                codigo_municipio=NFSE_MUNICIPIO_CODIGO,
                webservice_url=NFSE_WEBSERVICE_URL,
                ambiente=NFSE_AMBIENTE,
                nuvem_fiscal_client_id=os.getenv("NUVEM_FISCAL_CLIENT_ID", ""),
                nuvem_fiscal_client_secret=os.getenv("NUVEM_FISCAL_CLIENT_SECRET", ""),
                nuvem_fiscal_ambiente=os.getenv("NUVEM_FISCAL_AMBIENTE", "homologacao"),
            )
            db.add(config)
            db.commit()
    finally:
        db.close()

    print("NFS-e System v1.0 inicializado. Tabelas criadas/verificadas.")


# --- Servir frontend buildado (producao) ---
_frontend_candidates = [
    os.path.join(os.path.dirname(__file__), "..", "frontend", "dist"),  # dev local
    os.path.join(os.path.dirname(__file__), "..", "frontend_dist"),     # Docker
]
_frontend_dist = next((p for p in _frontend_candidates if os.path.isdir(p)), None)
if _frontend_dist:
    app.mount("/", StaticFiles(directory=_frontend_dist, html=True), name="frontend")
