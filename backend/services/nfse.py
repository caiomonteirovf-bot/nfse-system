from datetime import date
from typing import Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from backend.models.nfse import Nfse
from backend.utils.normalize import normalize_text, normalize_number


MESES_LABEL = [
    "", "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
    "Jul", "Ago", "Set", "Out", "Nov", "Dez",
]


class NfseService:

    # ========== NORMALIZACAO ==========

    def normalize_nfse(self, data: dict) -> dict:
        """Converte payload camelCase do frontend para snake_case do modelo."""

        def _date(val):
            if not val:
                return None
            try:
                return date.fromisoformat(str(val)[:10])
            except (ValueError, TypeError):
                return None

        def _bool(val):
            if isinstance(val, bool):
                return val
            if isinstance(val, str):
                return val.upper() in ("SIM", "TRUE", "1", "S")
            return bool(val) if val else False

        data_emissao = _date(data.get("dataEmissao"))
        competencia = _date(data.get("competencia"))
        if data_emissao and not competencia:
            competencia = date(data_emissao.year, data_emissao.month, 1)

        return {
            "numero": normalize_text(data.get("numero")),
            "serie": normalize_text(data.get("serie"), "1"),
            "codigo_verificacao": normalize_text(data.get("codigoVerificacao")),
            # Prestador
            "prestador_cnpj": normalize_text(data.get("prestadorCnpj")),
            "prestador_inscricao_municipal": normalize_text(data.get("prestadorInscricaoMunicipal")),
            "prestador_razao_social": normalize_text(data.get("prestadorRazaoSocial")),
            # Tomador
            "tomador_id": data.get("tomadorId") or None,
            "tomador_cpf_cnpj": normalize_text(data.get("tomadorCpfCnpj")),
            "tomador_razao_social": normalize_text(data.get("tomadorRazaoSocial")),
            "tomador_email": normalize_text(data.get("tomadorEmail")),
            # Servico
            "descricao_servico": normalize_text(data.get("descricaoServico")),
            "item_lista_servico": normalize_text(data.get("itemListaServico")),
            "codigo_tributacao_municipio": normalize_text(data.get("codigoTributacaoMunicipio")),
            "codigo_cnae": normalize_text(data.get("codigoCnae")),
            # Valores
            "valor_servicos": normalize_number(data.get("valorServicos")),
            "valor_deducoes": normalize_number(data.get("valorDeducoes")),
            "aliquota_iss": normalize_number(data.get("aliquotaIss")),
            "valor_iss": normalize_number(data.get("valorIss")),
            "valor_iss_retido": normalize_number(data.get("valorIssRetido")),
            "iss_retido": _bool(data.get("issRetido")),
            "valor_pis": normalize_number(data.get("valorPis")),
            "valor_cofins": normalize_number(data.get("valorCofins")),
            "valor_inss": normalize_number(data.get("valorInss")),
            "valor_ir": normalize_number(data.get("valorIr")),
            "valor_csll": normalize_number(data.get("valorCsll")),
            "outras_retencoes": normalize_number(data.get("outrasRetencoes")),
            "desconto_incondicionado": normalize_number(data.get("descontoIncondicionado")),
            "desconto_condicionado": normalize_number(data.get("descontoCondicionado")),
            # Datas
            "data_emissao": data_emissao,
            "competencia": competencia,
            # RPS
            "rps_numero": normalize_text(data.get("rpsNumero")),
            "rps_serie": normalize_text(data.get("rpsSerie")),
            "rps_tipo": int(data.get("rpsTipo") or 1),
            # Status
            "status": normalize_text(data.get("status"), "EMITIDA").upper(),
            "natureza_operacao": int(data.get("naturezaOperacao") or 1),
            "regime_especial": int(data.get("regimeEspecial") or 0),
            "optante_simples": _bool(data.get("optanteSimples")),
            "incentivo_fiscal": _bool(data.get("incentivoFiscal")),
            # Municipio
            "municipio_incidencia": normalize_text(data.get("municipioIncidencia")),
            "municipio_prestacao": normalize_text(data.get("municipioPrestacao")),
            # Observacoes
            "observacoes": normalize_text(data.get("observacoes")),
        }

    # ========== CALCULO VALOR LIQUIDO ==========

    def calcular_valor_liquido(self, nfse) -> float:
        vs = float(nfse.valor_servicos or 0)
        deducoes = float(nfse.valor_deducoes or 0)
        desc_inc = float(nfse.desconto_incondicionado or 0)
        desc_cond = float(nfse.desconto_condicionado or 0)
        pis = float(nfse.valor_pis or 0)
        cofins = float(nfse.valor_cofins or 0)
        inss = float(nfse.valor_inss or 0)
        ir = float(nfse.valor_ir or 0)
        csll = float(nfse.valor_csll or 0)
        outras = float(nfse.outras_retencoes or 0)
        iss_ret = float(nfse.valor_iss_retido or 0) if nfse.iss_retido else 0
        return round(vs - deducoes - desc_inc - desc_cond - pis - cofins - inss - ir - csll - outras - iss_ret, 2)

    def calcular_base_calculo(self, nfse) -> float:
        vs = float(nfse.valor_servicos or 0)
        deducoes = float(nfse.valor_deducoes or 0)
        desc_inc = float(nfse.desconto_incondicionado or 0)
        return round(vs - deducoes - desc_inc, 2)

    def calcular_iss(self, nfse) -> float:
        base = self.calcular_base_calculo(nfse)
        aliquota = float(nfse.aliquota_iss or 0) / 100
        return round(base * aliquota, 2)

    # ========== DASHBOARD ==========

    def calcular_dashboard(self, db: Session, ano: int, mes: Optional[int]) -> dict:
        return {
            "kpis": self._calcular_kpis(db, ano, mes),
            "evolucaoMensal": self._evolucao_mensal(db, ano),
            "comparativoMes": self._comparativo_mes(db, ano, mes) if mes else None,
            "rankingTomadores": self._ranking_tomadores(db, ano, mes),
            "analiseTributaria": self._analise_tributaria(db, ano, mes),
        }

    def _query_base(self, db: Session, ano: int, mes: Optional[int]):
        q = db.query(Nfse).filter(Nfse.status != "CANCELADA")
        if ano and mes:
            ref = date(ano, mes, 1)
            q = q.filter(Nfse.competencia == ref)
        elif ano:
            q = q.filter(
                Nfse.data_emissao >= date(ano, 1, 1),
                Nfse.data_emissao <= date(ano, 12, 31),
            )
        return q

    def _calcular_kpis(self, db: Session, ano: int, mes: Optional[int]) -> dict:
        q = self._query_base(db, ano, mes)
        notas = q.all()

        total_notas = len(notas)
        total_faturado = sum(float(n.valor_servicos or 0) for n in notas)
        total_liquido = sum(float(n.valor_liquido or 0) for n in notas)

        total_impostos = sum(
            float(n.valor_iss or 0) + float(n.valor_pis or 0) +
            float(n.valor_cofins or 0) + float(n.valor_inss or 0) +
            float(n.valor_ir or 0) + float(n.valor_csll or 0)
            for n in notas
        )

        canceladas = db.query(func.count(Nfse.id)).filter(Nfse.status == "CANCELADA")
        if ano and mes:
            canceladas = canceladas.filter(Nfse.competencia == date(ano, mes, 1))
        elif ano:
            canceladas = canceladas.filter(
                Nfse.data_emissao >= date(ano, 1, 1),
                Nfse.data_emissao <= date(ano, 12, 31),
            )
        notas_canceladas = canceladas.scalar() or 0

        return {
            "totalNotas": total_notas,
            "totalFaturado": round(total_faturado, 2),
            "ticketMedio": round(total_faturado / total_notas, 2) if total_notas else 0,
            "totalImpostos": round(total_impostos, 2),
            "cargaTributariaMedia": round(total_impostos / total_faturado * 100, 1) if total_faturado else 0,
            "notasCanceladas": notas_canceladas,
            "totalLiquido": round(total_liquido, 2),
        }

    def _evolucao_mensal(self, db: Session, ano: int) -> list:
        result = []
        for m in range(1, 13):
            ref = date(ano, m, 1)
            notas = db.query(Nfse).filter(
                Nfse.competencia == ref,
                Nfse.status != "CANCELADA",
            ).all()

            total_fat = sum(float(n.valor_servicos or 0) for n in notas)
            total_imp = sum(
                float(n.valor_iss or 0) + float(n.valor_pis or 0) +
                float(n.valor_cofins or 0) + float(n.valor_inss or 0) +
                float(n.valor_ir or 0) + float(n.valor_csll or 0)
                for n in notas
            )
            total_liq = sum(float(n.valor_liquido or 0) for n in notas)

            result.append({
                "mes": f"{ano}-{m:02d}",
                "mesLabel": MESES_LABEL[m],
                "totalNotas": len(notas),
                "totalFaturado": round(total_fat, 2),
                "totalImpostos": round(total_imp, 2),
                "totalLiquido": round(total_liq, 2),
            })
        return result

    def _comparativo_mes(self, db: Session, ano: int, mes: int) -> dict:
        def _totais(a, m):
            ref = date(a, m, 1)
            notas = db.query(Nfse).filter(
                Nfse.competencia == ref, Nfse.status != "CANCELADA"
            ).all()
            fat = sum(float(n.valor_servicos or 0) for n in notas)
            liq = sum(float(n.valor_liquido or 0) for n in notas)
            return {"totalNotas": len(notas), "totalFaturado": round(fat, 2), "totalLiquido": round(liq, 2)}

        atual = _totais(ano, mes)

        ma = mes - 1
        aa = ano
        if ma < 1:
            ma = 12
            aa -= 1
        anterior = _totais(aa, ma)

        def _var(a, b):
            return round((a - b) / b * 100, 1) if b else 0

        return {
            "mesAtual": atual,
            "mesAnterior": anterior,
            "variacao": {
                "notas": _var(atual["totalNotas"], anterior["totalNotas"]),
                "faturado": _var(atual["totalFaturado"], anterior["totalFaturado"]),
                "liquido": _var(atual["totalLiquido"], anterior["totalLiquido"]),
            },
        }

    def _ranking_tomadores(self, db: Session, ano: int, mes: Optional[int], limit: int = 10) -> list:
        q = self._query_base(db, ano, mes)
        notas = q.all()

        por_tomador = {}
        for n in notas:
            tid = n.tomador_id or 0
            nome = n.tomador.razao_social if n.tomador else n.tomador_razao_social or "Sem tomador"
            if tid not in por_tomador:
                por_tomador[tid] = {"tomadorId": tid, "tomadorNome": nome, "totalNotas": 0, "totalFaturado": 0}
            por_tomador[tid]["totalNotas"] += 1
            por_tomador[tid]["totalFaturado"] += float(n.valor_servicos or 0)

        ranking = sorted(por_tomador.values(), key=lambda x: x["totalFaturado"], reverse=True)[:limit]
        total_geral = sum(r["totalFaturado"] for r in ranking) or 1

        for r in ranking:
            r["totalFaturado"] = round(r["totalFaturado"], 2)
            r["percentual"] = round(r["totalFaturado"] / total_geral * 100, 1)

        return ranking

    def _analise_tributaria(self, db: Session, ano: int, mes: Optional[int]) -> dict:
        q = self._query_base(db, ano, mes)
        notas = q.all()

        total_iss = sum(float(n.valor_iss or 0) for n in notas)
        total_pis = sum(float(n.valor_pis or 0) for n in notas)
        total_cofins = sum(float(n.valor_cofins or 0) for n in notas)
        total_inss = sum(float(n.valor_inss or 0) for n in notas)
        total_ir = sum(float(n.valor_ir or 0) for n in notas)
        total_csll = sum(float(n.valor_csll or 0) for n in notas)
        total_iss_retido = sum(float(n.valor_iss_retido or 0) for n in notas)
        total_outras = sum(float(n.outras_retencoes or 0) for n in notas)

        total_impostos = total_iss + total_pis + total_cofins + total_inss + total_ir + total_csll
        total_faturado = sum(float(n.valor_servicos or 0) for n in notas)

        por_aliquota = {}
        for n in notas:
            aliq = float(n.aliquota_iss or 0)
            key = str(aliq)
            if key not in por_aliquota:
                por_aliquota[key] = {"aliquota": aliq, "count": 0, "total": 0}
            por_aliquota[key]["count"] += 1
            por_aliquota[key]["total"] += float(n.valor_servicos or 0)

        por_aliquota_list = sorted(por_aliquota.values(), key=lambda x: x["total"], reverse=True)
        for item in por_aliquota_list:
            item["total"] = round(item["total"], 2)

        return {
            "totalIss": round(total_iss, 2),
            "totalPis": round(total_pis, 2),
            "totalCofins": round(total_cofins, 2),
            "totalInss": round(total_inss, 2),
            "totalIr": round(total_ir, 2),
            "totalCsll": round(total_csll, 2),
            "totalIssRetido": round(total_iss_retido, 2),
            "totalOutrasRetencoes": round(total_outras, 2),
            "totalImpostos": round(total_impostos, 2),
            "cargaEfetiva": round(total_impostos / total_faturado * 100, 1) if total_faturado else 0,
            "porAliquota": por_aliquota_list,
            "issRetidoVsDevido": {
                "retido": round(total_iss_retido, 2),
                "devido": round(total_iss - total_iss_retido, 2),
            },
        }


nfse_service = NfseService()
