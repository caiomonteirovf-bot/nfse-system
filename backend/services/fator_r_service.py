"""Serviço de cálculo do Fator R.

Regra Simples Nacional (LC 123/2006 art. 18 §5-J / §5-M):
  Fator R = Folha de Pagamento 12 meses / Receita Bruta 12 meses
  Se Fator R >= 0,28 → atividade tributada pelo Anexo III (alíquotas menores)
  Se Fator R < 0,28  → atividade tributada pelo Anexo V (alíquotas maiores)

A folha inclui: pró-labore + salários + encargos (INSS patronal) + 13º + férias.
"""
from datetime import date, timedelta
from sqlalchemy.orm import Session
from sqlalchemy import and_

from backend.models.fator_r import FaturamentoMensal, FolhaMensal, FatorRHistorico

FATOR_R_THRESHOLD = 0.28

# Alíquotas nominais médias para estimar economia (simplificação).
# Fonte: LC 123/2006 anexos. Valores efetivos dependem da faixa de receita.
ALIQUOTA_MEDIA_ANEXO_III = 0.11  # ~6% a 16% dependendo da faixa
ALIQUOTA_MEDIA_ANEXO_V = 0.16    # ~15,5% a 30,5% dependendo da faixa


def _12m_range(competencia: date) -> tuple[date, date]:
    """Retorna (início, fim) dos 12 meses que terminam na competência dada."""
    fim = date(competencia.year, competencia.month, 1)
    # 11 meses para trás (inclui o mês corrente = 12 meses totais)
    ano = fim.year
    mes = fim.month - 11
    while mes <= 0:
        mes += 12
        ano -= 1
    inicio = date(ano, mes, 1)
    return inicio, fim


def calcular_fator_r(db: Session, cnpj: str, competencia: date,
                     cliente_gesthub_id: int | None = None) -> dict:
    """Calcula o Fator R para o CNPJ na competência (RBT12)."""
    cnpj = (cnpj or "").replace(".", "").replace("/", "").replace("-", "")
    inicio, fim = _12m_range(competencia)

    # Buscar faturamento 12 meses
    fats = db.query(FaturamentoMensal).filter(
        and_(
            FaturamentoMensal.cnpj == cnpj,
            FaturamentoMensal.competencia >= inicio,
            FaturamentoMensal.competencia <= fim,
        )
    ).all()
    receita_12m = sum(float(f.faturamento_bruto or 0) for f in fats)

    # Buscar folha 12 meses
    folhas = db.query(FolhaMensal).filter(
        and_(
            FolhaMensal.cnpj == cnpj,
            FolhaMensal.competencia >= inicio,
            FolhaMensal.competencia <= fim,
        )
    ).all()
    folha_12m = sum(f.total for f in folhas)

    meses_com_dados = len(set(f.competencia for f in fats))

    fator_r = (folha_12m / receita_12m) if receita_12m > 0 else 0.0
    anexo_ideal = "III" if fator_r >= FATOR_R_THRESHOLD else "V"

    # Pró-labore ideal para alcançar Fator R = 28% (se ainda não alcançou)
    folha_ideal_12m = receita_12m * FATOR_R_THRESHOLD
    deficit_folha = max(0.0, folha_ideal_12m - folha_12m)
    # Distribuir déficit em 12 meses como pró-labore adicional
    pro_labore_ideal_mensal = deficit_folha / 12 if deficit_folha > 0 else 0.0

    # Economia estimada se migrar de V → III
    economia_anual = 0.0
    if anexo_ideal == "III":
        diff_aliquota = ALIQUOTA_MEDIA_ANEXO_V - ALIQUOTA_MEDIA_ANEXO_III
        economia_anual = receita_12m * diff_aliquota

    return {
        "cnpj": cnpj,
        "competencia": competencia.isoformat(),
        "rangeInicio": inicio.isoformat(),
        "rangeFim": fim.isoformat(),
        "receita12m": round(receita_12m, 2),
        "folha12m": round(folha_12m, 2),
        "fatorR": round(fator_r, 4),
        "fatorRPct": round(fator_r * 100, 2),
        "threshold": FATOR_R_THRESHOLD,
        "anexoIdeal": anexo_ideal,
        "proLaboreIdealMensal": round(pro_labore_ideal_mensal, 2),
        "deficitFolha12m": round(deficit_folha, 2),
        "economiaAnualEstimada": round(economia_anual, 2),
        "mesesComDados": meses_com_dados,
        "cobertura": f"{meses_com_dados}/12 meses",
        "clienteGesthubId": cliente_gesthub_id,
    }


def salvar_historico(db: Session, cnpj: str, competencia: date,
                     resultado: dict, anexo_atual: str = "") -> FatorRHistorico:
    """Persiste o cálculo no histórico (upsert por cnpj+competência)."""
    existente = db.query(FatorRHistorico).filter(
        FatorRHistorico.cnpj == cnpj,
        FatorRHistorico.competencia == competencia,
    ).first()

    if existente:
        row = existente
    else:
        row = FatorRHistorico(cnpj=cnpj, competencia=competencia)
        db.add(row)

    row.cliente_gesthub_id = resultado.get("clienteGesthubId")
    row.receita_12m = resultado["receita12m"]
    row.folha_12m = resultado["folha12m"]
    row.fator_r = resultado["fatorR"]
    row.anexo_atual = anexo_atual or row.anexo_atual or ""
    row.anexo_ideal = resultado["anexoIdeal"]
    row.pro_labore_ideal = resultado["proLaboreIdealMensal"]
    row.economia_anual_estimada = resultado["economiaAnualEstimada"]
    row.meses_com_dados = resultado["mesesComDados"]

    db.commit()
    db.refresh(row)
    return row
