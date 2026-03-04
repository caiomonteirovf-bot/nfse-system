from fastapi import APIRouter, Depends
from fastapi.responses import Response
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.models.captura import Captura
from backend.services.captura import executar_captura, consultar_nfse_por_chave, baixar_danfse
from backend.services.certificado import upload_certificado, verificar_validade

router = APIRouter(prefix="/captura", tags=["captura"])


@router.post("/executar")
async def executar(db: Session = Depends(get_db)):
    """Executa captura manual de NFS-e via ADN."""
    result = await executar_captura(db)
    return result


@router.get("/historico")
def historico(limit: int = 20, db: Session = Depends(get_db)):
    """Lista historico de capturas."""
    capturas = (
        db.query(Captura)
        .order_by(Captura.id.desc())
        .limit(limit)
        .all()
    )
    return {"ok": True, "data": [c.to_dict() for c in capturas]}


@router.get("/status")
def status(db: Session = Depends(get_db)):
    """Retorna status da ultima captura e certificado."""
    ultima = db.query(Captura).order_by(Captura.id.desc()).first()
    cert_status = verificar_validade(db)
    return {
        "ok": True,
        "data": {
            "ultimaCaptura": ultima.to_dict() if ultima else None,
            "certificadoStatus": cert_status or "",
        },
    }


@router.get("/nfse/{chave_acesso}")
async def consultar_chave(chave_acesso: str, db: Session = Depends(get_db)):
    """Consulta NFS-e por chave de acesso via ADN."""
    result = await consultar_nfse_por_chave(db, chave_acesso)
    return result


@router.get("/nfse/{chave_acesso}/danfse")
async def danfse(chave_acesso: str, db: Session = Depends(get_db)):
    """Baixa PDF (DANFSE) de uma NFS-e."""
    pdf_bytes = await baixar_danfse(db, chave_acesso)
    if not pdf_bytes:
        return {"ok": False, "error": "Nao foi possivel gerar o DANFSE."}
    return Response(content=pdf_bytes, media_type="application/pdf", headers={
        "Content-Disposition": f"inline; filename=danfse_{chave_acesso}.pdf"
    })


@router.post("/certificado/upload")
async def upload_cert(body: dict, db: Session = Depends(get_db)):
    """Upload de certificado digital A1 (.pfx) via base64."""
    import base64
    pfx_b64 = body.get("pfxBase64", "")
    senha = body.get("senha", "")
    if not pfx_b64:
        return {"ok": False, "error": "Arquivo .pfx nao enviado."}
    try:
        pfx_bytes = base64.b64decode(pfx_b64)
    except Exception:
        return {"ok": False, "error": "Arquivo .pfx invalido (base64)."}
    result = upload_certificado(db, pfx_bytes, senha)
    return result
