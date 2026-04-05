import io
from datetime import datetime, date

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from sqlalchemy.orm import Session, joinedload

from backend.database import get_db
from backend.models.nfse import Nfse
from backend.services.nfse import nfse_service
from backend.services.importacao import importar_excel, importar_xml

router = APIRouter(prefix="/nfses", tags=["nfses"])


# ========== LISTAGEM ==========

@router.get("")
def listar_nfses(
    search: str = Query(None),
    status: str = Query(None),
    ano: int = Query(None),
    mes: int = Query(None),
    tomador_id: int = Query(None),
    cliente_id: int = Query(None),
    cliente_doc: str = Query(None),
    db: Session = Depends(get_db),
):
    query = db.query(Nfse).options(joinedload(Nfse.tomador))

    if cliente_doc:
        doc_limpo = cliente_doc.replace(".", "").replace("/", "").replace("-", "")
        from sqlalchemy import or_, func
        query = query.filter(
            or_(
                Nfse.cliente_gesthub_id == cliente_id if cliente_id else False,
                func.replace(func.replace(func.replace(Nfse.prestador_cnpj, ".", ""), "/", ""), "-", "") == doc_limpo,
                func.replace(func.replace(func.replace(Nfse.tomador_cpf_cnpj, ".", ""), "/", ""), "-", "") == doc_limpo,
            )
        )
    elif cliente_id:
        query = query.filter(Nfse.cliente_gesthub_id == cliente_id)
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
        from calendar import monthrange
        last_day = monthrange(ano, mes)[1]
        query = query.filter(
            Nfse.data_emissao >= date(ano, mes, 1),
            Nfse.data_emissao <= date(ano, mes, last_day),
        )
    elif ano:
        query = query.filter(
            Nfse.data_emissao >= date(ano, 1, 1),
            Nfse.data_emissao <= date(ano, 12, 31),
        )
    if tomador_id:
        query = query.filter(Nfse.tomador_id == tomador_id)

    items = query.order_by(Nfse.data_emissao.desc(), Nfse.numero.desc()).all()
    return {"ok": True, "data": [n.to_dict() for n in items]}


# ========== SUGESTOES PARA EMISSAO ==========

@router.get("/sugestoes/{cliente_doc}")
def sugestoes_emissao(cliente_doc: str, db: Session = Depends(get_db)):
    """Retorna últimas descrições e dados usados nas notas do prestador (cliente).

    Usado para auto-preencher o formulário de emissão com base no histórico.
    """
    doc_limpo = cliente_doc.replace(".", "").replace("/", "").replace("-", "")
    from sqlalchemy import func, or_

    # Buscar notas onde o cliente é o prestador (quem emite)
    query = db.query(Nfse).filter(
        or_(
            func.replace(func.replace(func.replace(
                Nfse.prestador_cnpj, ".", ""), "/", ""), "-", "") == doc_limpo,
            Nfse.cliente_gesthub_id == db.query(Nfse.cliente_gesthub_id).filter(
                func.replace(func.replace(func.replace(
                    Nfse.prestador_cnpj, ".", ""), "/", ""), "-", "") == doc_limpo
            ).limit(1).scalar_subquery(),
        )
    ).filter(
        Nfse.descricao_servico != "",
        Nfse.descricao_servico.isnot(None),
    ).order_by(Nfse.data_emissao.desc(), Nfse.id.desc()).limit(20)

    notas = query.all()

    # Descrições únicas (mantendo ordem da mais recente)
    descricoes_vistas = set()
    descricoes = []
    for n in notas:
        desc = (n.descricao_servico or "").strip()
        if desc and desc not in descricoes_vistas:
            descricoes_vistas.add(desc)
            descricoes.append({
                "descricao": desc,
                "valor": float(n.valor_servicos or 0),
                "aliquotaIss": float(n.aliquota_iss or 0),
                "tomador": n.tomador_razao_social or "",
                "data": n.data_emissao.isoformat() if n.data_emissao else "",
            })
        if len(descricoes) >= 5:
            break

    return {"ok": True, "data": descricoes}


# ========== DASHBOARD ==========

@router.get("/dashboard")
def dashboard_nfses(
    ano: int = Query(...),
    mes: int = Query(None),
    cliente_id: int = Query(None),
    cliente_doc: str = Query(None),
    db: Session = Depends(get_db),
):
    data = nfse_service.calcular_dashboard(db, ano, mes, cliente_id=cliente_id, cliente_doc=cliente_doc)
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
        content = await file.read()
        filename = (file.filename or "").lower()

        if filename.endswith(".xml"):
            result = importar_xml(db, content)
        else:
            import pandas as pd
            df = pd.read_excel(io.BytesIO(content))
            result = importar_excel(db, df, ano, mes)

        db.commit()
        return {"ok": True, "data": result}
    except Exception as e:
        db.rollback()
        return {"ok": False, "error": str(e)}
