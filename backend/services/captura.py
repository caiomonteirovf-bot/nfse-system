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


NS = "http://www.abrasf.org.br/nfse.xsd"


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
                documentos = data.get("documentos", data.get("lote", []))

                if not documentos:
                    # Atualizar max NSU se fornecido
                    max_nsu = data.get("maxNSU", data.get("ultNSU", ultimo_nsu))
                    if max_nsu and int(max_nsu) > ultimo_nsu:
                        ultimo_nsu = int(max_nsu)
                    break

                for doc in documentos:
                    nsu_doc = int(doc.get("NSU", doc.get("nsu", 0)))
                    xml_b64 = doc.get("xml", doc.get("xmlGZipB64", ""))

                    # Decodificar: Base64 → GZip → XML
                    xml_str = _decode_xml(xml_b64)
                    if not xml_str:
                        continue

                    # Parse e salvar
                    nfse_data = _parse_nfse_xml(xml_str)
                    if not nfse_data:
                        continue

                    chave = nfse_data.get("chave_acesso", "")
                    existing = db.query(Nfse).filter(Nfse.chave_acesso == chave).first() if chave else None

                    if existing:
                        # Atualizar status se mudou
                        if nfse_data.get("status") and existing.status != nfse_data["status"]:
                            existing.status = nfse_data["status"]
                            existing.xml_nfse = xml_str
                    else:
                        # Criar nova NFS-e
                        nfse = _criar_nfse_from_parsed(db, nfse_data, xml_str, nsu_doc)
                        db.add(nfse)
                        total_novas += 1

                    total_capturadas += 1
                    if nsu_doc > ultimo_nsu:
                        ultimo_nsu = nsu_doc

                # Verificar se ha mais
                if data.get("indCont", "0") != "1":
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
    """Extrai campos de um XML de NFS-e (formato nacional ou ABRASF)."""
    try:
        root = ET.fromstring(xml_str)
    except ET.ParseError:
        return None

    # Tentar encontrar elementos NFS-e em diferentes namespaces
    ns_map = {"nfse": NS, "": ""}
    data = {}

    # Busca generica de campos
    def find_text(path, default=""):
        for ns_prefix in [f"{{{NS}}}", ""]:
            parts = path.split("/")
            full_path = "/".join(f"{ns_prefix}{p}" for p in parts)
            el = root.find(f".//{full_path}")
            if el is not None and el.text:
                return el.text.strip()
        # Tentar sem namespace
        el = root.find(f".//{path}")
        if el is not None and el.text:
            return el.text.strip()
        return default

    data["chave_acesso"] = find_text("ChaveAcesso") or find_text("chNFSe") or ""
    data["numero"] = find_text("Numero") or find_text("nNFSe") or ""
    data["serie"] = find_text("Serie") or "1"
    data["codigo_verificacao"] = find_text("CodigoVerificacao") or ""
    data["data_emissao"] = find_text("DataEmissao") or find_text("dhEmi") or ""
    data["competencia"] = find_text("Competencia") or find_text("competencia") or ""
    data["status"] = _map_status(find_text("SituacaoNfse") or find_text("Status") or "")
    data["descricao_servico"] = find_text("Discriminacao") or find_text("xDescServ") or ""
    data["item_lista_servico"] = find_text("ItemListaServico") or find_text("cServ") or ""
    data["codigo_cnae"] = find_text("CodigoCnae") or find_text("CNAE") or ""

    # Valores
    data["valor_servicos"] = _safe_float(find_text("ValorServicos") or find_text("vServ"))
    data["valor_deducoes"] = _safe_float(find_text("ValorDeducoes"))
    data["base_calculo"] = _safe_float(find_text("BaseCalculo") or find_text("vBC"))
    data["aliquota_iss"] = _safe_float(find_text("Aliquota") or find_text("pISS"))
    data["valor_iss"] = _safe_float(find_text("ValorIss") or find_text("vISS"))
    data["valor_iss_retido"] = _safe_float(find_text("ValorIssRetido"))
    data["valor_pis"] = _safe_float(find_text("ValorPis"))
    data["valor_cofins"] = _safe_float(find_text("ValorCofins"))
    data["valor_inss"] = _safe_float(find_text("ValorInss"))
    data["valor_ir"] = _safe_float(find_text("ValorIr"))
    data["valor_csll"] = _safe_float(find_text("ValorCsll"))

    # Tomador
    data["tomador_cpf_cnpj"] = find_text("Tomador/IdentificacaoTomador/CpfCnpj/Cnpj") or \
                                find_text("Tomador/IdentificacaoTomador/CpfCnpj/Cpf") or \
                                find_text("toma/CNPJ") or find_text("toma/CPF") or ""
    data["tomador_razao_social"] = find_text("Tomador/RazaoSocial") or find_text("toma/xNome") or ""
    data["tomador_email"] = find_text("Tomador/Contato/Email") or ""

    # Prestador
    data["prestador_cnpj"] = find_text("Prestador/CpfCnpj/Cnpj") or find_text("prest/CNPJ") or ""
    data["prestador_razao_social"] = find_text("Prestador/RazaoSocial") or find_text("prest/xNome") or ""

    return data


def _criar_nfse_from_parsed(db: Session, data: dict, xml_str: str, nsu: int) -> Nfse:
    """Cria um objeto Nfse a partir dos dados parseados."""
    # Tentar vincular tomador pelo CNPJ/CPF
    tomador_id = None
    if data.get("tomador_cpf_cnpj"):
        tomador = db.query(Tomador).filter(Tomador.cpf_cnpj == data["tomador_cpf_cnpj"]).first()
        if tomador:
            tomador_id = tomador.id

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
