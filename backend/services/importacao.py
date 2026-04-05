import xml.etree.ElementTree as ET
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


def _xml_find(el, tag):
    """Busca tag ignorando namespace."""
    for child in el.iter():
        local = child.tag.split("}")[-1] if "}" in child.tag else child.tag
        if local == tag:
            return child.text or ""
    return ""


def _xml_find_el(el, tag):
    """Busca elemento ignorando namespace."""
    for child in el.iter():
        local = child.tag.split("}")[-1] if "}" in child.tag else child.tag
        if local == tag:
            return child
    return None


def importar_xml(db: Session, xml_content: bytes) -> dict:
    """Importa NFS-e a partir de XML no formato Nacional (NFS-e/DPS)."""
    criadas = 0
    atualizadas = 0
    erros = []

    try:
        root = ET.fromstring(xml_content)
    except ET.ParseError as e:
        return {"criadas": 0, "atualizadas": 0, "erros": 1, "errosLista": [f"XML inválido: {e}"]}

    # Suporta XML com uma ou múltiplas NFS-e
    nfse_els = []
    for el in root.iter():
        local = el.tag.split("}")[-1] if "}" in el.tag else el.tag
        if local == "infNFSe":
            nfse_els.append(el)

    if not nfse_els:
        # Tenta o root como NFS-e único
        nfse_els = [root]

    for nfse_el in nfse_els:
        try:
            numero = _xml_find(nfse_el, "nNFSe") or _xml_find(nfse_el, "nDPS") or ""
            if not numero:
                erros.append("NFS-e sem número")
                continue

            chave_acesso = ""
            inf = _xml_find_el(nfse_el, "infNFSe")
            if inf is not None:
                chave_acesso = inf.get("Id", "").replace("NFS", "")

            serie_val = _xml_find(nfse_el, "serie") or "1"
            cod_verif = _xml_find(nfse_el, "cVerif") or ""
            v_serv = nn(_xml_find(nfse_el, "vServ"))
            v_liq = nn(_xml_find(nfse_el, "vLiq"))
            desc_serv = _xml_find(nfse_el, "xDescServ") or ""
            c_trib_nac = _xml_find(nfse_el, "cTribNac") or ""
            c_trib_mun = _xml_find(nfse_el, "cTribMun") or ""
            cnae = _xml_find(nfse_el, "CNAE") or ""

            # Emitente (prestador)
            emit = _xml_find_el(nfse_el, "emit") or _xml_find_el(nfse_el, "prest")
            prest_cnpj = ""
            if emit is not None:
                prest_cnpj = _xml_find(emit, "CNPJ") or ""

            # Tomador
            toma = _xml_find_el(nfse_el, "toma")
            toma_cnpj = ""
            toma_nome = ""
            if toma is not None:
                toma_cnpj = _xml_find(toma, "CNPJ") or _xml_find(toma, "CPF") or ""
                toma_nome = _xml_find(toma, "xNome") or ""

            # Datas
            dh_emi = _xml_find(nfse_el, "dhEmi") or _xml_find(nfse_el, "dhProc") or ""
            d_compet = _xml_find(nfse_el, "dCompet") or ""
            data_emissao = None
            competencia = None
            if dh_emi:
                try:
                    data_emissao = date.fromisoformat(dh_emi[:10])
                except ValueError:
                    pass
            if d_compet:
                try:
                    competencia = date.fromisoformat(d_compet[:10])
                except ValueError:
                    pass

            # Tributos
            aliquota = nn(_xml_find(nfse_el, "pAliq"))
            v_issqn = nn(_xml_find(nfse_el, "vISSQN"))
            p_tot_sn = nn(_xml_find(nfse_el, "pTotTribSN"))

            # Match tomador
            tomador_id = None
            if toma_cnpj:
                doc_limpo = toma_cnpj.replace(".", "").replace("/", "").replace("-", "")
                tom = db.query(Tomador).filter(Tomador.cpf_cnpj == doc_limpo).first()
                if tom:
                    tomador_id = tom.id
                else:
                    # Auto-criar tomador
                    tom = Tomador(cpf_cnpj=doc_limpo, razao_social=toma_nome)
                    db.add(tom)
                    db.flush()
                    tomador_id = tom.id

            # Upsert por (numero, serie) ou chave_acesso
            existing = None
            if chave_acesso:
                existing = db.query(Nfse).filter(Nfse.chave_acesso == chave_acesso).first()
            if not existing:
                existing = db.query(Nfse).filter(Nfse.numero == numero, Nfse.serie == serie_val).first()

            if existing:
                existing.valor_servicos = v_serv or existing.valor_servicos
                existing.valor_liquido = v_liq or existing.valor_liquido
                existing.tomador_razao_social = toma_nome or existing.tomador_razao_social
                existing.tomador_cpf_cnpj = toma_cnpj or existing.tomador_cpf_cnpj
                existing.descricao_servico = desc_serv or existing.descricao_servico
                existing.chave_acesso = chave_acesso or existing.chave_acesso
                existing.codigo_verificacao = cod_verif or existing.codigo_verificacao
                existing.tomador_id = tomador_id or existing.tomador_id
                existing.status = "EMITIDA"
                existing.origem = "XML"
                existing.updated_at = datetime.utcnow()
                atualizadas += 1
            else:
                nfse = Nfse(
                    numero=numero,
                    serie=serie_val,
                    valor_servicos=v_serv,
                    valor_liquido=v_liq,
                    tomador_razao_social=toma_nome,
                    tomador_cpf_cnpj=toma_cnpj,
                    descricao_servico=desc_serv,
                    prestador_cnpj=prest_cnpj,
                    status="EMITIDA",
                    origem="XML",
                    data_emissao=data_emissao or date.today(),
                    competencia=competencia or data_emissao or date.today(),
                    aliquota_iss=aliquota or p_tot_sn,
                    valor_iss=v_issqn,
                    codigo_tributacao_municipio=c_trib_nac,
                    item_lista_servico=c_trib_mun,
                    codigo_cnae=cnae,
                    chave_acesso=chave_acesso,
                    codigo_verificacao=cod_verif,
                    tomador_id=tomador_id,
                )
                nfse.base_calculo = nfse_service.calcular_base_calculo(nfse)
                if not nfse.valor_liquido:
                    nfse.valor_liquido = nfse_service.calcular_valor_liquido(nfse)
                db.add(nfse)
                criadas += 1

        except Exception as e:
            erros.append(f"Erro processando NFS-e: {e}")

    db.commit()
    return {
        "criadas": criadas,
        "atualizadas": atualizadas,
        "erros": len(erros),
        "errosLista": erros[:20],
    }
