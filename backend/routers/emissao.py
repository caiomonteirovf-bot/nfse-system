from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.services.abrasf import (
    get_prestador_config, enviar_lote, consultar_lote, cancelar_nfse_abrasf,
)

router = APIRouter(prefix="/emissao", tags=["emissao"])


@router.post("/enviar-lote")
async def emitir_nfse(body: dict, db: Session = Depends(get_db)):
    """Envia lote de RPS para emissao via ABRASF."""
    ids = body.get("ids", [])
    if not ids:
        raise HTTPException(status_code=400, detail="Nenhuma NFS-e selecionada.")

    config = get_prestador_config(db)
    # Permitir override de config via body
    for key in ("webservice_url", "prestador_cnpj", "inscricao_municipal", "razao_social", "municipio_codigo"):
        if body.get(key):
            config[key] = body[key]

    result = await enviar_lote(db, ids, config)
    return result


@router.get("/consultar-lote/{protocolo}")
async def consultar_lote_endpoint(protocolo: str, db: Session = Depends(get_db)):
    config = get_prestador_config(db)
    result = await consultar_lote(db, protocolo, config)
    return result


@router.post("/{nfse_id}/cancelar")
async def cancelar_nfse(nfse_id: int, body: dict = None, db: Session = Depends(get_db)):
    """Cancela NFS-e via ABRASF ou localmente."""
    config = get_prestador_config(db)
    result = await cancelar_nfse_abrasf(db, nfse_id, config)
    if not result.get("ok"):
        raise HTTPException(status_code=400, detail=result.get("error", "Erro ao cancelar."))
    return result
