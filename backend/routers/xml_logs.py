from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload

from backend.database import get_db
from backend.models.xml_log import XmlLog

router = APIRouter(prefix="/xml-logs", tags=["xml-logs"])


@router.get("")
def listar_logs(
    nfse_id: int = Query(None),
    tipo: str = Query(None),
    limit: int = Query(50),
    offset: int = Query(0),
    db: Session = Depends(get_db),
):
    query = db.query(XmlLog).options(joinedload(XmlLog.nfse))

    if nfse_id:
        query = query.filter(XmlLog.nfse_id == nfse_id)
    if tipo:
        query = query.filter(XmlLog.tipo_operacao == tipo.strip().upper())

    total = query.count()
    items = query.order_by(XmlLog.created_at.desc()).offset(offset).limit(limit).all()

    return {
        "ok": True,
        "data": [log.to_dict_summary() for log in items],
        "total": total,
    }


@router.get("/{log_id}")
def obter_log(log_id: int, db: Session = Depends(get_db)):
    item = db.query(XmlLog).options(joinedload(XmlLog.nfse)).get(log_id)
    if not item:
        raise HTTPException(status_code=404, detail="Log nao encontrado.")
    return {"ok": True, "data": item.to_dict()}
