import io
from datetime import datetime, date

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from sqlalchemy.orm import Session, joinedload

from backend.database import get_db
from backend.models.nfse import Nfse
from backend.services.nfse import nfse_service
from backend.services.importacao import importar_excel

router = APIRouter(prefix="/nfses", tags=["nfses"])


# ========== LISTAGEM ==========

@router.get("")
def listar_nfses(
    search: str = Query(None),
    status: str = Query(None),
    ano: int = Query(None),
    mes: int = Query(None),
    tomador_id: int = Query(None),
    db: Session = Depends(get_db),
):
    query = db.query(Nfse).options(joinedload(Nfse.tomador))

    if search:
        pattern = f"%{search.strip()}%"
        query = query.filter(
            Nfse.numero.ilike(pattern)
            | Nfse.tomador_razao_social.ilike(pattern)
            | Nfse.descricao_servico.ilike(pattern)
            | Nfse.tomador_cpf_cnpj.ilike(pattern)
        )
    if status:
        query = query.filter(Nfse.status == status.strip().upper())
    if ano and mes:
        ref = date(ano, mes, 1)
        query = query.filter(Nfse.competencia == ref)
    elif ano:
        query = query.filter(
            Nfse.data_emissao >= date(ano, 1, 1),
            Nfse.data_emissao <= date(ano, 12, 31),
        )
    if tomador_id:
        query = query.filter(Nfse.tomador_id == tomador_id)

    items = query.order_by(Nfse.data_emissao.desc(), Nfse.numero.desc()).all()
    return {"ok": True, "data": [n.to_dict() for n in items]}


# ========== DASHBOARD ==========

@router.get("/dashboard")
def dashboard_nfses(
    ano: int = Query(...),
    mes: int = Query(None),
    db: Session = Depends(get_db),
):
    data = nfse_service.calcular_dashboard(db, ano, mes)
    return {"ok": True, "data": data}


# ========== CRUD ==========

@router.get("/{nfse_id}")
def obter_nfse(nfse_id: int, db: Session = Depends(get_db)):
    item = db.query(Nfse).options(joinedload(Nfse.tomador)).get(nfse_id)
    if not item:
        raise HTTPException(status_code=404, detail="NFS-e nao encontrada.")
    return {"ok": True, "data": item.to_dict()}


@router.post("", status_code=201)
def criar_nfse(body: dict, db: Session = Depends(get_db)):
    normalized = nfse_service.normalize_nfse(body)

    if not normalized.get("numero"):
        raise HTTPException(status_code=400, detail="Numero da NFS-e obrigatorio.")
    if not normalized.get("valor_servicos"):
        raise HTTPException(status_code=400, detail="Valor dos servicos obrigatorio.")

    nfse = Nfse(**normalized)
    nfse.base_calculo = nfse_service.calcular_base_calculo(nfse)
    nfse.valor_liquido = nfse_service.calcular_valor_liquido(nfse)
    if not nfse.valor_iss and nfse.aliquota_iss:
        nfse.valor_iss = nfse_service.calcular_iss(nfse)

    db.add(nfse)
    db.commit()
    db.refresh(nfse)
    return {"ok": True, "data": nfse.to_dict()}


@router.put("/{nfse_id}")
def atualizar_nfse(nfse_id: int, body: dict, db: Session = Depends(get_db)):
    item = db.get(Nfse, nfse_id)
    if not item:
        raise HTTPException(status_code=404, detail="NFS-e nao encontrada.")

    normalized = nfse_service.normalize_nfse(body)
    for key, value in normalized.items():
        setattr(item, key, value)

    item.base_calculo = nfse_service.calcular_base_calculo(item)
    item.valor_liquido = nfse_service.calcular_valor_liquido(item)
    if not item.valor_iss and item.aliquota_iss:
        item.valor_iss = nfse_service.calcular_iss(item)

    item.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(item)
    return {"ok": True, "data": item.to_dict()}


@router.delete("/{nfse_id}")
def excluir_nfse(nfse_id: int, db: Session = Depends(get_db)):
    item = db.get(Nfse, nfse_id)
    if not item:
        raise HTTPException(status_code=404, detail="NFS-e nao encontrada.")
    db.delete(item)
    db.commit()
    return {"ok": True}


# ========== IMPORTACAO EXCEL ==========

@router.post("/import")
async def importar_nfses(
    file: UploadFile = File(...),
    ano: int = Query(...),
    mes: int = Query(...),
    db: Session = Depends(get_db),
):
    try:
        import pandas as pd

        content = await file.read()
        df = pd.read_excel(io.BytesIO(content))
        result = importar_excel(db, df, ano, mes)
        db.commit()
        return {"ok": True, "data": result}
    except Exception as e:
        db.rollback()
        return {"ok": False, "error": str(e)}
