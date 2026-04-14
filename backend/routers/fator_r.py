"""Endpoints do pipeline Fator R."""
from datetime import date, datetime
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import and_, func

from backend.database import get_db
from backend.models.fator_r import FaturamentoMensal, FolhaMensal, FatorRHistorico
from backend.models.nfse import Nfse
from backend.services.fator_r_service import calcular_fator_r, salvar_historico

router = APIRouter(prefix="/fator-r", tags=["fator-r"])


def _parse_competencia(s: str) -> date:
    """Aceita 'YYYY-MM' ou 'YYYY-MM-DD'. Retorna primeiro dia do mês."""
    if not s:
        raise HTTPException(status_code=400, detail="Competência obrigatória (YYYY-MM).")
    try:
        if len(s) == 7:
            return datetime.strptime(s + "-01", "%Y-%m-%d").date()
        return datetime.strptime(s[:10], "%Y-%m-%d").date().replace(day=1)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Competência inválida: {s}")


def _clean_cnpj(cnpj: str) -> str:
    return (cnpj or "").replace(".", "").replace("/", "").replace("-", "").strip()


# ============================================
# FATURAMENTO MENSAL
# ============================================

@router.get("/faturamento")
def listar_faturamento(
    cnpj: str | None = None,
    cliente_id: int | None = None,
    ano: int | None = None,
    db: Session = Depends(get_db),
):
    q = db.query(FaturamentoMensal)
    if cnpj:
        q = q.filter(FaturamentoMensal.cnpj == _clean_cnpj(cnpj))
    if cliente_id:
        q = q.filter(FaturamentoMensal.cliente_gesthub_id == cliente_id)
    if ano:
        q = q.filter(func.extract("year", FaturamentoMensal.competencia) == ano)
    q = q.order_by(FaturamentoMensal.competencia.desc())
    return {"ok": True, "data": [r.to_dict() for r in q.all()]}


@router.post("/faturamento")
def upsert_faturamento(body: dict, db: Session = Depends(get_db)):
    cnpj = _clean_cnpj(body.get("cnpj"))
    if not cnpj:
        raise HTTPException(status_code=400, detail="CNPJ obrigatório.")
    competencia = _parse_competencia(body.get("competencia"))

    row = db.query(FaturamentoMensal).filter(
        FaturamentoMensal.cnpj == cnpj,
        FaturamentoMensal.competencia == competencia,
    ).first()

    if not row:
        row = FaturamentoMensal(cnpj=cnpj, competencia=competencia)
        db.add(row)

    row.cliente_gesthub_id = body.get("clienteGesthubId") or row.cliente_gesthub_id
    row.faturamento_bruto = float(body.get("faturamentoBruto") or 0)
    row.qtd_notas = int(body.get("qtdNotas") or 0)
    row.fonte = body.get("fonte") or "manual"
    row.status = body.get("status") or "ok"
    row.observacoes = body.get("observacoes") or ""

    db.commit()
    db.refresh(row)
    return {"ok": True, "data": row.to_dict()}


@router.delete("/faturamento/{id}")
def deletar_faturamento(id: int, db: Session = Depends(get_db)):
    row = db.query(FaturamentoMensal).filter(FaturamentoMensal.id == id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Não encontrado.")
    db.delete(row)
    db.commit()
    return {"ok": True}


@router.post("/faturamento/importar-nfses")
def importar_nfses(body: dict, db: Session = Depends(get_db)):
    """Agrega NFS-e emitidas pelo próprio sistema por CNPJ+mês.
    Útil para popular faturamento a partir das notas já emitidas.
    """
    cnpj = _clean_cnpj(body.get("cnpj"))
    if not cnpj:
        raise HTTPException(status_code=400, detail="CNPJ obrigatório.")

    # Agrupa valor_servicos por mês de emissão
    resultados = db.query(
        func.date_trunc("month", Nfse.data_emissao).label("mes"),
        func.sum(Nfse.valor_servicos).label("total"),
        func.count(Nfse.id).label("qtd"),
    ).filter(
        Nfse.prestador_cnpj == cnpj,
        Nfse.status == "EMITIDA",
        Nfse.data_emissao.isnot(None),
    ).group_by("mes").all()

    criados = 0
    atualizados = 0
    for r in resultados:
        mes = r.mes.date().replace(day=1) if hasattr(r.mes, "date") else r.mes.replace(day=1)
        row = db.query(FaturamentoMensal).filter(
            FaturamentoMensal.cnpj == cnpj,
            FaturamentoMensal.competencia == mes,
        ).first()
        if row:
            row.faturamento_bruto = float(r.total or 0)
            row.qtd_notas = int(r.qtd or 0)
            row.fonte = "nfse_emitida"
            atualizados += 1
        else:
            db.add(FaturamentoMensal(
                cnpj=cnpj, competencia=mes,
                faturamento_bruto=float(r.total or 0),
                qtd_notas=int(r.qtd or 0),
                fonte="nfse_emitida",
                cliente_gesthub_id=body.get("clienteGesthubId"),
            ))
            criados += 1
    db.commit()
    return {"ok": True, "data": {"criados": criados, "atualizados": atualizados}}


# ============================================
# FOLHA MENSAL
# ============================================

@router.get("/folha")
def listar_folha(
    cnpj: str | None = None,
    cliente_id: int | None = None,
    ano: int | None = None,
    db: Session = Depends(get_db),
):
    q = db.query(FolhaMensal)
    if cnpj:
        q = q.filter(FolhaMensal.cnpj == _clean_cnpj(cnpj))
    if cliente_id:
        q = q.filter(FolhaMensal.cliente_gesthub_id == cliente_id)
    if ano:
        q = q.filter(func.extract("year", FolhaMensal.competencia) == ano)
    q = q.order_by(FolhaMensal.competencia.desc())
    return {"ok": True, "data": [r.to_dict() for r in q.all()]}


@router.post("/folha")
def upsert_folha(body: dict, db: Session = Depends(get_db)):
    cnpj = _clean_cnpj(body.get("cnpj"))
    if not cnpj:
        raise HTTPException(status_code=400, detail="CNPJ obrigatório.")
    competencia = _parse_competencia(body.get("competencia"))

    row = db.query(FolhaMensal).filter(
        FolhaMensal.cnpj == cnpj,
        FolhaMensal.competencia == competencia,
    ).first()

    if not row:
        row = FolhaMensal(cnpj=cnpj, competencia=competencia)
        db.add(row)

    row.cliente_gesthub_id = body.get("clienteGesthubId") or row.cliente_gesthub_id
    row.pro_labore = float(body.get("proLabore") or 0)
    row.salarios = float(body.get("salarios") or 0)
    row.inss_patronal = float(body.get("inssPatronal") or 0)
    row.decimo_terceiro = float(body.get("decimoTerceiro") or 0)
    row.ferias = float(body.get("ferias") or 0)
    row.fonte = body.get("fonte") or "manual"
    row.observacoes = body.get("observacoes") or ""

    db.commit()
    db.refresh(row)
    return {"ok": True, "data": row.to_dict()}


@router.delete("/folha/{id}")
def deletar_folha(id: int, db: Session = Depends(get_db)):
    row = db.query(FolhaMensal).filter(FolhaMensal.id == id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Não encontrado.")
    db.delete(row)
    db.commit()
    return {"ok": True}


# ============================================
# CÁLCULO FATOR R
# ============================================

@router.post("/calcular")
def calcular(body: dict, db: Session = Depends(get_db)):
    """Calcula Fator R para um CNPJ numa competência e salva no histórico."""
    cnpj = _clean_cnpj(body.get("cnpj"))
    if not cnpj:
        raise HTTPException(status_code=400, detail="CNPJ obrigatório.")
    competencia = _parse_competencia(body.get("competencia") or date.today().replace(day=1).isoformat())
    cliente_id = body.get("clienteGesthubId")
    anexo_atual = body.get("anexoAtual") or ""

    resultado = calcular_fator_r(db, cnpj, competencia, cliente_id)
    historico = salvar_historico(db, cnpj, competencia, resultado, anexo_atual)

    return {"ok": True, "data": {**resultado, "historicoId": historico.id}}


@router.get("/historico")
def listar_historico(
    cnpj: str | None = None,
    cliente_id: int | None = None,
    db: Session = Depends(get_db),
):
    q = db.query(FatorRHistorico)
    if cnpj:
        q = q.filter(FatorRHistorico.cnpj == _clean_cnpj(cnpj))
    if cliente_id:
        q = q.filter(FatorRHistorico.cliente_gesthub_id == cliente_id)
    q = q.order_by(FatorRHistorico.competencia.desc())
    return {"ok": True, "data": [r.to_dict() for r in q.all()]}


@router.get("/resumo")
def resumo(db: Session = Depends(get_db)):
    """Dashboard: últimos cálculos por CNPJ, agregados."""
    subq = db.query(
        FatorRHistorico.cnpj,
        func.max(FatorRHistorico.competencia).label("max_comp"),
    ).group_by(FatorRHistorico.cnpj).subquery()

    rows = db.query(FatorRHistorico).join(
        subq,
        and_(
            FatorRHistorico.cnpj == subq.c.cnpj,
            FatorRHistorico.competencia == subq.c.max_comp,
        ),
    ).all()

    total_alerta = sum(1 for r in rows if (r.fator_r or 0) < 0.28)
    return {
        "ok": True,
        "data": {
            "totalClientes": len(rows),
            "clientesEmAlerta": total_alerta,
            "ultimosCalculos": [r.to_dict() for r in rows],
        },
    }
