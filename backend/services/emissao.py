"""Emissao de NFS-e via API Nacional (SEFIN) - DPS formato NT 004 v2.0."""

import base64
import gzip
import hashlib
from datetime import datetime
from xml.etree import ElementTree as ET

import httpx
from sqlalchemy.orm import Session

from backend.models.nfse import Nfse
from backend.models.prestador import PrestadorConfig
from backend.models.xml_log import XmlLog
from backend.services.certificado import get_ssl_context


NS_DPS = "http://www.sped.fazenda.gov.br/nfse"


def _gerar_xml_dps(nfse: Nfse, config: PrestadorConfig) -> str:
    """Gera XML da DPS (Declaracao de Prestacao de Servico) formato NT 004."""
    root = ET.Element("DPS", xmlns=NS_DPS)

    # Identificacao
    inf = ET.SubElement(root, "infDPS", Id=f"DPS{config.cnpj}{nfse.serie or '1'}{nfse.numero}")
    ET.SubElement(inf, "tpAmb").text = "1" if config.ambiente == "PRODUCAO" else "2"
    ET.SubElement(inf, "dhEmi").text = datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%S")
    ET.SubElement(inf, "verAplic").text = "NFSE-SYSTEM-1.0"
    ET.SubElement(inf, "serie").text = nfse.serie or "1"
    ET.SubElement(inf, "nDPS").text = str(nfse.numero)
    ET.SubElement(inf, "dCompet").text = (nfse.competencia or nfse.data_emissao or datetime.utcnow().date()).strftime("%Y-%m-%d")
    ET.SubElement(inf, "tpEmit").text = "1"  # Prestador

    # Prestador
    prest = ET.SubElement(inf, "prest")
    ET.SubElement(prest, "CNPJ").text = config.cnpj or ""
    ET.SubElement(prest, "IM").text = config.inscricao_municipal or ""
    ET.SubElement(prest, "xNome").text = config.razao_social or ""

    # Tomador
    toma = ET.SubElement(inf, "toma")
    cpf_cnpj = nfse.tomador_cpf_cnpj or ""
    if len(cpf_cnpj) > 11:
        ET.SubElement(toma, "CNPJ").text = cpf_cnpj
    elif cpf_cnpj:
        ET.SubElement(toma, "CPF").text = cpf_cnpj
    ET.SubElement(toma, "xNome").text = nfse.tomador_razao_social or ""

    # Servico
    serv = ET.SubElement(inf, "serv")
    ET.SubElement(serv, "cServ").text = nfse.item_lista_servico or config.item_lista_servico or ""
    ET.SubElement(serv, "xDescServ").text = nfse.descricao_servico or ""
    ET.SubElement(serv, "CNAE").text = nfse.codigo_cnae or config.codigo_cnae or ""

    # Valores
    valores = ET.SubElement(inf, "valores")
    ET.SubElement(valores, "vServ").text = f"{nfse.valor_servicos:.2f}"
    ET.SubElement(valores, "vBC").text = f"{nfse.base_calculo:.2f}"
    if nfse.aliquota_iss:
        ET.SubElement(valores, "pISS").text = f"{nfse.aliquota_iss:.4f}"
    if nfse.valor_iss:
        ET.SubElement(valores, "vISS").text = f"{nfse.valor_iss:.2f}"
    if nfse.valor_deducoes:
        ET.SubElement(valores, "vDeducao").text = f"{nfse.valor_deducoes:.2f}"

    return ET.tostring(root, encoding="unicode", xml_declaration=True)


async def enviar_dps(db: Session, nfse_ids: list[int]) -> dict:
    """Envia DPS para SEFIN Nacional para gerar NFS-e."""
    config = db.query(PrestadorConfig).first()
    if not config:
        return {"ok": False, "error": "Configuracao do prestador nao encontrada."}

    ctx = get_ssl_context(db)
    if not ctx:
        return {"ok": False, "error": "Certificado digital nao configurado."}

    nfses = db.query(Nfse).filter(Nfse.id.in_(nfse_ids)).all()
    if not nfses:
        return {"ok": False, "error": "Nenhuma NFS-e encontrada."}

    sefin_url = (config.nfse_nacional_url or "https://sefin.nfse.gov.br/SefinNacional").rstrip("/")
    resultados = []

    async with httpx.AsyncClient(verify=ctx, timeout=60) as client:
        for nfse in nfses:
            if nfse.status not in ("PENDENTE", "ERRO"):
                resultados.append({"id": nfse.id, "ok": False, "error": f"Status {nfse.status} nao permite emissao."})
                continue

            xml_str = _gerar_xml_dps(nfse, config)

            # Comprimir e codificar
            xml_gz = gzip.compress(xml_str.encode("utf-8"))
            xml_b64 = base64.b64encode(xml_gz).decode("ascii")

            payload = {
                "dps": xml_b64,
            }

            try:
                nfse.status = "PROCESSANDO"
                db.commit()

                resp = await client.post(f"{sefin_url}/nfse", json=payload)

                _log_xml(db, nfse.id, "ENVIAR_DPS", xml_str[:5000], resp.text[:5000],
                         resp.status_code, "", resp.status_code in (200, 201, 202),
                         f"DPS {nfse.numero}")

                if resp.status_code in (200, 201, 202):
                    data = resp.json()
                    chave = data.get("chaveAcesso", data.get("chNFSe", ""))
                    nfse.status = "EMITIDA"
                    nfse.chave_acesso = chave or nfse.chave_acesso
                    nfse.origem = "EMITIDA"
                    nfse.xml_nfse = xml_str
                    db.commit()
                    resultados.append({"id": nfse.id, "ok": True, "chaveAcesso": chave})
                else:
                    nfse.status = "ERRO"
                    db.commit()
                    resultados.append({"id": nfse.id, "ok": False, "error": f"HTTP {resp.status_code}: {resp.text[:200]}"})
            except Exception as e:
                nfse.status = "ERRO"
                db.commit()
                resultados.append({"id": nfse.id, "ok": False, "error": str(e)})

    return {"ok": True, "data": resultados}


async def consultar_nfse_sefin(db: Session, chave_acesso: str) -> dict:
    """Consulta NFS-e por chave de acesso via SEFIN."""
    config = db.query(PrestadorConfig).first()
    ctx = get_ssl_context(db)
    if not config or not ctx:
        return {"ok": False, "error": "Certificado ou config nao encontrado."}

    sefin_url = (config.nfse_nacional_url or "https://sefin.nfse.gov.br/SefinNacional").rstrip("/")

    try:
        async with httpx.AsyncClient(verify=ctx, timeout=30) as client:
            resp = await client.get(f"{sefin_url}/nfse/{chave_acesso}")

            _log_xml(db, None, "CONSULTA_SEFIN", "", resp.text[:5000],
                     resp.status_code, "", resp.status_code == 200,
                     f"Consulta SEFIN {chave_acesso}")

            if resp.status_code != 200:
                return {"ok": False, "error": f"HTTP {resp.status_code}"}

            return {"ok": True, "data": resp.json()}
    except Exception as e:
        return {"ok": False, "error": str(e)}


def _log_xml(db, nfse_id, tipo, xml_envio, xml_retorno, http_status, protocolo, sucesso, mensagem):
    log = XmlLog(
        nfse_id=nfse_id,
        tipo_operacao=tipo,
        xml_envio=xml_envio or "",
        xml_retorno=xml_retorno or "",
        http_status=http_status,
        protocolo=protocolo or "",
        sucesso=sucesso,
        mensagem=mensagem or "",
    )
    db.add(log)
    db.commit()
