from datetime import date, datetime

from sqlalchemy.orm import Session

from backend.models.nfse import Nfse
from backend.models.tomador import Tomador
from backend.services.nfse import nfse_service
from backend.utils.normalize import normalize_number as nn


def importar_excel(db: Session, df, ano: int, mes: int) -> dict:
    """Importa NFS-e de DataFrame (planilha Excel)."""
    competencia = date(ano, mes, 1)
    criadas = 0
    atualizadas = 0
    erros = []

    for idx, row in df.iterrows():
        numero = str(row.get("Numero", row.get("NUMERO", row.get("numero", "")))).strip()
        if not numero or numero == "nan":
            erros.append(f"Linha {idx + 2}: Numero vazio")
            continue

        serie = str(row.get("Serie", row.get("SERIE", row.get("serie", "1")))).strip()
        if serie == "nan":
            serie = "1"

        valor_raw = row.get("Valor", row.get("VALOR", row.get("ValorServicos", row.get("valor_servicos", 0))))
        try:
            valor = float(valor_raw) if valor_raw and str(valor_raw) != "nan" else 0.0
        except (ValueError, TypeError):
            valor = 0.0

        # Dados opcionais
        cliente_nome = str(row.get("Cliente", row.get("CLIENTE", row.get("Tomador", "")))).strip()
        if cliente_nome == "nan":
            cliente_nome = ""
        cnpj = str(row.get("CNPJ", row.get("cnpj", row.get("CpfCnpj", "")))).strip()
        if cnpj == "nan":
            cnpj = ""
        descricao = str(row.get("Descricao", row.get("DESCRICAO", row.get("descricao", "")))).strip()
        if descricao == "nan":
            descricao = ""
        status = str(row.get("Status", row.get("STATUS", "EMITIDA"))).strip().upper()
        if status == "NAN":
            status = "EMITIDA"

        data_raw = row.get("Data", row.get("DATA", row.get("DataEmissao", "")))
        data_emissao = None
        if data_raw and str(data_raw) != "nan":
            try:
                data_emissao = date.fromisoformat(str(data_raw)[:10])
            except (ValueError, TypeError):
                pass

        aliquota = nn(row.get("Aliquota", row.get("ALIQUOTA", row.get("aliquota", 0))))
        iss = nn(row.get("ISS", row.get("iss", row.get("ValorIss", 0))))

        # Match tomador por CNPJ
        tomador_id = None
        if cnpj:
            cnpj_limpo = cnpj.replace(".", "").replace("/", "").replace("-", "").strip()
            tom = db.query(Tomador).filter(Tomador.cpf_cnpj == cnpj_limpo).first()
            if tom:
                tomador_id = tom.id

        # Upsert por (numero, serie)
        existing = db.query(Nfse).filter(Nfse.numero == numero, Nfse.serie == serie).first()
        if existing:
            existing.valor_servicos = valor
            existing.tomador_razao_social = cliente_nome or existing.tomador_razao_social
            existing.tomador_cpf_cnpj = cnpj or existing.tomador_cpf_cnpj
            existing.descricao_servico = descricao or existing.descricao_servico
            existing.status = status
            existing.data_emissao = data_emissao or existing.data_emissao
            existing.competencia = competencia
            existing.aliquota_iss = aliquota or existing.aliquota_iss
            existing.valor_iss = iss or existing.valor_iss
            existing.tomador_id = tomador_id or existing.tomador_id
            existing.valor_liquido = nfse_service.calcular_valor_liquido(existing)
            existing.base_calculo = nfse_service.calcular_base_calculo(existing)
            existing.updated_at = datetime.utcnow()
            atualizadas += 1
        else:
            nfse = Nfse(
                numero=numero,
                serie=serie,
                valor_servicos=valor,
                tomador_razao_social=cliente_nome,
                tomador_cpf_cnpj=cnpj,
                descricao_servico=descricao,
                status=status,
                data_emissao=data_emissao or date.today(),
                competencia=competencia,
                aliquota_iss=aliquota,
                valor_iss=iss,
                tomador_id=tomador_id,
            )
            nfse.base_calculo = nfse_service.calcular_base_calculo(nfse)
            nfse.valor_liquido = nfse_service.calcular_valor_liquido(nfse)
            if not nfse.valor_iss and nfse.aliquota_iss:
                nfse.valor_iss = nfse_service.calcular_iss(nfse)
            db.add(nfse)
            criadas += 1

    return {
        "criadas": criadas,
        "atualizadas": atualizadas,
        "erros": len(erros),
        "errosLista": erros[:20],
    }
