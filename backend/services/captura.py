"""Captura automatica de NFS-e via API ADN (Ambiente de Dados Nacional)."""

import base64
import gzip
import ssl
from datetime import datetime
from xml.etree import ElementTree as ET

import httpx
from sqlalchemy.orm import Session

from backend.models.captura import Captura
from backend.models.nfse import Nfse
from backend.models.prestador import PrestadorConfig
from backend.models.tomador import Tomador
from backend.models.xml_log import XmlLog
from backend.services.certificado import get_ssl_context


NS_ABRASF = "http://www.abrasf.org.br/nfse.xsd"
NS_NACIONAL = "http://www.sped.fazenda.gov.br/nfse"


async def executar_captura(db: Session) -> dict:
    """Executa captura de NFS-e via ADN DF-e por NSU."""
    config = db.query(PrestadorConfig).first()
    if not config:
        return {"ok": False, "error": "Configuracao do prestador nao encontrada."}

    ctx = get_ssl_context(db)
    if not ctx:
        return {"ok": False, "error": "Certificado digital nao configurado."}

    # Criar registro de captura
    captura = Captura(status="EM_ANDAMENTO")
    db.add(captura)
    db.commit()
    db.refresh(captura)

    adn_url = (config.adn_url or "https://adn.nfse.gov.br").rstrip("/")
    ultimo_nsu = config.ultimo_nsu or 0
    total_capturadas = 0
    total_novas = 0

    try:
        async with httpx.AsyncClient(verify=ctx, timeout=60) as client:
            max_iterations = 50  # Limite de seguranca
            for _ in range(max_iterations):
                url = f"{adn_url}/contribuintes/DFe/{ultimo_nsu}"
                resp = await client.get(url)

                if resp.status_code == 404:
                    # Sem mais documentos
                    break

                if resp.status_code != 200:
                    _log_xml(db, None, "CAPTURA", "", resp.text, resp.status_code,
                             "", False, f"HTTP {resp.status_code}")
                    break

                data = resp.json()
                documentos = data.get("LoteDFe", data.get("documentos", data.get("lote", [])))

                if not documentos:
                    # Atualizar max NSU se fornecido
                    max_nsu = data.get("maxNSU", data.get("ultNSU", ultimo_nsu))
                    if max_nsu and int(max_nsu) > ultimo_nsu:
                        ultimo_nsu = int(max_nsu)
                    break

                for doc in documentos:
                    nsu_doc = int(doc.get("NSU", doc.get("nsu", 0)))
                    tipo_doc = doc.get("TipoDocumento", "")
                    xml_b64 = doc.get("ArquivoXml", doc.get("xml", doc.get("xmlGZipB64", "")))

                    # Atualizar NSU mesmo se pular documento
                    if nsu_doc > ultimo_nsu:
                        ultimo_nsu = nsu_doc

                    # Decodificar: Base64 → GZip → XML
                    xml_str = _decode_xml(xml_b64)
                    if not xml_str:
                        continue

                    # Pular eventos (cancelamento, substituicao) — processar apenas NFS-e
                    if tipo_doc and tipo_doc.upper() not in ("NFSE", "NFS-E", ""):
                        continue

                    # Parse e salvar
                    nfse_data = _parse_nfse_xml(xml_str)
                    if not nfse_data:
                        continue

                    # Pular documentos sem numero (provavelmente eventos)
                    if not nfse_data.get("numero"):
                        continue

                    chave = nfse_data.get("chave_acesso", "")

                    try:
                        existing = db.query(Nfse).filter(Nfse.chave_acesso == chave).first() if chave else None

                        if existing:
                            # Atualizar status se mudou
                            if nfse_data.get("status") and existing.status != nfse_data["status"]:
                                existing.status = nfse_data["status"]
                                existing.xml_nfse = xml_str
                                db.flush()
                        else:
                            # Verificar duplicidade por numero+serie
                            num = nfse_data.get("numero", "")
                            serie = nfse_data.get("serie", "1")
                            dup = db.query(Nfse).filter(Nfse.numero == num, Nfse.serie == serie).first() if num else None
                            if not dup:
                                nfse = _criar_nfse_from_parsed(db, nfse_data, xml_str, nsu_doc)
                                db.add(nfse)
                                db.flush()
                                total_novas += 1

                        total_capturadas += 1
                    except Exception:
                        db.rollback()
                        continue

                # Verificar se ha mais documentos
                status_proc = data.get("StatusProcessamento", "")
                if status_proc != "DOCUMENTOS_LOCALIZADOS" and data.get("indCont", "0") != "1":
                    break

        # Atualizar config com ultimo NSU
        config.ultimo_nsu = ultimo_nsu
        captura.ultimo_nsu = ultimo_nsu
        captura.total_capturadas = total_capturadas
        captura.total_novas = total_novas
        captura.status = "SUCESSO"
        captura.mensagem = f"{total_novas} novas de {total_capturadas} processadas"
        db.commit()

        return {
            "ok": True,
            "data": captura.to_dict(),
        }

    except Exception as e:
        captura.status = "ERRO"
        captura.mensagem = str(e)
        captura.total_capturadas = total_capturadas
        captura.total_novas = total_novas
        db.commit()
        return {"ok": False, "error": str(e), "data": captura.to_dict()}


async def consultar_nfse_por_chave(db: Session, chave_acesso: str) -> dict:
    """Consulta NFS-e individual por chave de acesso via ADN."""
    config = db.query(PrestadorConfig).first()
    ctx = get_ssl_context(db)
    if not config or not ctx:
        return {"ok": False, "error": "Certificado ou config nao encontrado."}

    adn_url = (config.adn_url or "https://adn.nfse.gov.br").rstrip("/")

    try:
        async with httpx.AsyncClient(verify=ctx, timeout=30) as client:
            url = f"{adn_url}/contribuintes/NFSe/{chave_acesso}/Eventos"
            resp = await client.get(url)

            _log_xml(db, None, "CONSULTA_CHAVE", "", resp.text, resp.status_code,
                     "", resp.status_code == 200, f"Consulta chave {chave_acesso}")

            if resp.status_code != 200:
                return {"ok": False, "error": f"Erro HTTP {resp.status_code}"}

            return {"ok": True, "data": resp.json()}
    except Exception as e:
        return {"ok": False, "error": str(e)}


async def baixar_danfse(db: Session, chave_acesso: str) -> bytes | None:
    """Baixa PDF (DANFSE) de uma NFS-e."""
    config = db.query(PrestadorConfig).first()
    ctx = get_ssl_context(db)
    if not config or not ctx:
        return None

    adn_url = (config.adn_url or "https://adn.nfse.gov.br").rstrip("/")

    try:
        async with httpx.AsyncClient(verify=ctx, timeout=30) as client:
            resp = await client.get(f"{adn_url}/danfse/{chave_acesso}")
            if resp.status_code == 200:
                return resp.content
    except Exception:
        pass
    return None


def _decode_xml(xml_b64: str) -> str:
    """Decodifica XML: Base64 → GZip → string."""
    if not xml_b64:
        return ""
    try:
        raw = base64.b64decode(xml_b64)
        try:
            xml_bytes = gzip.decompress(raw)
        except Exception:
            xml_bytes = raw  # Pode nao estar gzipado
        return xml_bytes.decode("utf-8")
    except Exception:
        return ""


def _parse_nfse_xml(xml_str: str) -> dict | None:
    """Extrai campos de um XML de NFS-e (formato nacional SPED ou ABRASF)."""
    try:
        root = ET.fromstring(xml_str)
    except ET.ParseError:
        return None

    data = {}

    def _find(el, tag):
        """Busca tag ignorando namespace."""
        for child in el.iter():
            local = child.tag.split("}")[-1] if "}" in child.tag else child.tag
            if local == tag:
                return child.text or ""
        return ""

    def _find_el(el, tag):
        """Busca elemento ignorando namespace."""
        for child in el.iter():
            local = child.tag.split("}")[-1] if "}" in child.tag else child.tag
            if local == tag:
                return child
        return None

    # Chave de acesso (do atributo Id do infNFSe)
    inf = _find_el(root, "infNFSe")
    if inf is not None:
        chave_raw = inf.get("Id", "")
        data["chave_acesso"] = chave_raw.replace("NFS", "") if chave_raw.startswith("NFS") else chave_raw
    else:
        data["chave_acesso"] = _find(root, "ChaveAcesso") or _find(root, "chNFSe") or ""

    data["numero"] = _find(root, "nNFSe") or _find(root, "Numero") or _find(root, "nDPS") or ""
    data["serie"] = _find(root, "serie") or "1"
    data["codigo_verificacao"] = _find(root, "cVerif") or _find(root, "CodigoVerificacao") or ""

    # Datas
    data["data_emissao"] = _find(root, "dhEmi") or _find(root, "dhProc") or _find(root, "DataEmissao") or ""
    data["competencia"] = _find(root, "dCompet") or _find(root, "Competencia") or ""

    data["status"] = _map_status(_find(root, "SituacaoNfse") or _find(root, "Status") or "")
    data["descricao_servico"] = _find(root, "xDescServ") or _find(root, "Discriminacao") or ""
    data["item_lista_servico"] = _find(root, "cServ") or _find(root, "ItemListaServico") or ""
    data["codigo_cnae"] = _find(root, "CNAE") or _find(root, "CodigoCnae") or ""
    data["codigo_tributacao_municipio"] = _find(root, "cTribNac") or _find(root, "cTribMun") or ""

    # Valores
    data["valor_servicos"] = _safe_float(_find(root, "vServ") or _find(root, "ValorServicos"))
    data["valor_deducoes"] = _safe_float(_find(root, "ValorDeducoes"))
    data["base_calculo"] = _safe_float(_find(root, "vBC") or _find(root, "BaseCalculo"))
    data["aliquota_iss"] = _safe_float(_find(root, "pAliq") or _find(root, "Aliquota"))
    data["valor_iss"] = _safe_float(_find(root, "vISSQN") or _find(root, "ValorIss"))
    data["valor_iss_retido"] = _safe_float(_find(root, "ValorIssRetido"))
    data["valor_pis"] = _safe_float(_find(root, "ValorPis"))
    data["valor_cofins"] = _safe_float(_find(root, "ValorCofins"))
    data["valor_inss"] = _safe_float(_find(root, "ValorInss"))
    data["valor_ir"] = _safe_float(_find(root, "ValorIr") or _find(root, "vRetIRRF"))
    data["valor_csll"] = _safe_float(_find(root, "ValorCsll") or _find(root, "vRetCSLL"))
    data["valor_liquido"] = _safe_float(_find(root, "vLiq"))

    # Tomador
    toma = _find_el(root, "toma")
    if toma is not None:
        data["tomador_cpf_cnpj"] = _find(toma, "CNPJ") or _find(toma, "CPF") or ""
        data["tomador_razao_social"] = _find(toma, "xNome") or ""
        data["tomador_email"] = _find(toma, "xEmail") or ""
    else:
        data["tomador_cpf_cnpj"] = _find(root, "Tomador/IdentificacaoTomador/CpfCnpj/Cnpj") or \
                                    _find(root, "Tomador/IdentificacaoTomador/CpfCnpj/Cpf") or ""
        data["tomador_razao_social"] = _find(root, "Tomador/RazaoSocial") or ""
        data["tomador_email"] = _find(root, "Tomador/Contato/Email") or ""

    # Prestador / Emitente
    emit = _find_el(root, "emit") or _find_el(root, "prest")
    if emit is not None:
        data["prestador_cnpj"] = _find(emit, "CNPJ") or ""
        data["prestador_razao_social"] = _find(emit, "xNome") or ""
    else:
        data["prestador_cnpj"] = _find(root, "Prestador/CpfCnpj/Cnpj") or ""
        data["prestador_razao_social"] = _find(root, "Prestador/RazaoSocial") or ""

    return data


def _criar_nfse_from_parsed(db: Session, data: dict, xml_str: str, nsu: int) -> Nfse:
    """Cria um objeto Nfse a partir dos dados parseados."""
    # Tentar vincular tomador pelo CNPJ/CPF — auto-cadastrar se não existir
    tomador_id = None
    tom_doc = (data.get("tomador_cpf_cnpj") or "").strip()
    if tom_doc:
        tomador = db.query(Tomador).filter(Tomador.cpf_cnpj == tom_doc).first()
        if not tomador:
            tomador = Tomador(
                cpf_cnpj=tom_doc,
                razao_social=data.get("tomador_razao_social", "").strip() or tom_doc,
                email=data.get("tomador_email", "").strip(),
            )
            db.add(tomador)
            db.flush()
        tomador_id = tomador.id

    # Auto-cadastrar prestador como tomador (para notas recebidas)
    prest_doc = (data.get("prestador_cnpj") or "").strip()
    if prest_doc:
        prest_tomador = db.query(Tomador).filter(Tomador.cpf_cnpj == prest_doc).first()
        if not prest_tomador:
            prest_tomador = Tomador(
                cpf_cnpj=prest_doc,
                razao_social=data.get("prestador_razao_social", "").strip() or prest_doc,
            )
            db.add(prest_tomador)
            db.flush()

    # Parse datas
    data_emissao = None
    if data.get("data_emissao"):
        try:
            data_emissao = datetime.fromisoformat(data["data_emissao"].replace("Z", "+00:00")).date()
        except Exception:
            try:
                data_emissao = datetime.strptime(data["data_emissao"][:10], "%Y-%m-%d").date()
            except Exception:
                pass

    competencia = None
    if data.get("competencia"):
        try:
            competencia = datetime.fromisoformat(data["competencia"].replace("Z", "+00:00")).date()
        except Exception:
            pass

    valor_servicos = data.get("valor_servicos", 0)
    base_calculo = data.get("base_calculo", 0) or valor_servicos
    aliquota = data.get("aliquota_iss", 0)
    valor_iss = data.get("valor_iss", 0) or (base_calculo * aliquota / 100 if aliquota else 0)
    total_retencoes = sum([
        data.get("valor_pis", 0), data.get("valor_cofins", 0),
        data.get("valor_inss", 0), data.get("valor_ir", 0),
        data.get("valor_csll", 0), data.get("valor_iss_retido", 0),
    ])
    valor_liquido = valor_servicos - data.get("valor_deducoes", 0) - total_retencoes

    return Nfse(
        numero=data.get("numero", ""),
        serie=data.get("serie", "1"),
        codigo_verificacao=data.get("codigo_verificacao", ""),
        tomador_id=tomador_id,
        tomador_cpf_cnpj=data.get("tomador_cpf_cnpj", ""),
        tomador_razao_social=data.get("tomador_razao_social", ""),
        tomador_email=data.get("tomador_email", ""),
        prestador_cnpj=data.get("prestador_cnpj", ""),
        prestador_razao_social=data.get("prestador_razao_social", ""),
        descricao_servico=data.get("descricao_servico", ""),
        item_lista_servico=data.get("item_lista_servico", ""),
        codigo_cnae=data.get("codigo_cnae", ""),
        valor_servicos=valor_servicos,
        valor_deducoes=data.get("valor_deducoes", 0),
        valor_liquido=valor_liquido,
        base_calculo=base_calculo,
        aliquota_iss=aliquota,
        valor_iss=valor_iss,
        valor_iss_retido=data.get("valor_iss_retido", 0),
        valor_pis=data.get("valor_pis", 0),
        valor_cofins=data.get("valor_cofins", 0),
        valor_inss=data.get("valor_inss", 0),
        valor_ir=data.get("valor_ir", 0),
        valor_csll=data.get("valor_csll", 0),
        data_emissao=data_emissao,
        competencia=competencia or data_emissao,
        status=data.get("status", "EMITIDA"),
        chave_acesso=data.get("chave_acesso") or None,
        origem="CAPTURADA",
        xml_nfse=xml_str,
        nsu=nsu,
    )


def _map_status(raw: str) -> str:
    """Mapeia status do XML para status do sistema."""
    raw_upper = raw.upper().strip()
    if raw_upper in ("1", "NORMAL", "EMITIDA", "AUTORIZADA"):
        return "EMITIDA"
    if raw_upper in ("2", "CANCELADA", "CANCELADO"):
        return "CANCELADA"
    if raw_upper in ("3", "SUBSTITUIDA"):
        return "CANCELADA"
    return "EMITIDA"


def _safe_float(val) -> float:
    if not val:
        return 0.0
    try:
        return float(val)
    except (ValueError, TypeError):
        return 0.0


def _log_xml(db, nfse_id, tipo, xml_envio, xml_retorno, http_status, protocolo, sucesso, mensagem):
    log = XmlLog(
        nfse_id=nfse_id,
        tipo_operacao=tipo,
        xml_envio=xml_envio[:5000] if xml_envio else "",
        xml_retorno=xml_retorno[:5000] if xml_retorno else "",
        http_status=http_status,
        protocolo=protocolo or "",
        sucesso=sucesso,
        mensagem=mensagem or "",
    )
    db.add(log)
    db.commit()
