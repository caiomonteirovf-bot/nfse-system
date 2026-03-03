from datetime import datetime
import xml.etree.ElementTree as ET

from sqlalchemy.orm import Session

from backend.models.nfse import Nfse
from backend.models.prestador import PrestadorConfig
from backend.models.xml_log import XmlLog

ABRASF_NS = "http://www.abrasf.org.br/nfse.xsd"


def _sub(parent, tag, text=""):
    el = ET.SubElement(parent, tag)
    if text:
        el.text = str(text)
    return el


def get_prestador_config(db: Session) -> dict:
    """Carrega config do prestador do DB, com fallback para env vars."""
    config = db.query(PrestadorConfig).first()
    if config:
        return {
            "webservice_url": config.webservice_url or "",
            "prestador_cnpj": config.cnpj or "",
            "inscricao_municipal": config.inscricao_municipal or "",
            "razao_social": config.razao_social or "",
            "municipio_codigo": config.codigo_municipio or "",
            "ambiente": config.ambiente or "HOMOLOGACAO",
            "ultimo_rps": config.ultimo_rps or 0,
            "serie_rps": config.serie_rps or "1",
        }

    from backend.config import (
        NFSE_WEBSERVICE_URL, NFSE_PRESTADOR_CNPJ,
        NFSE_INSCRICAO_MUNICIPAL, NFSE_RAZAO_SOCIAL,
        NFSE_MUNICIPIO_CODIGO, NFSE_AMBIENTE,
    )
    return {
        "webservice_url": NFSE_WEBSERVICE_URL,
        "prestador_cnpj": NFSE_PRESTADOR_CNPJ,
        "inscricao_municipal": NFSE_INSCRICAO_MUNICIPAL,
        "razao_social": NFSE_RAZAO_SOCIAL,
        "municipio_codigo": NFSE_MUNICIPIO_CODIGO,
        "ambiente": NFSE_AMBIENTE,
        "ultimo_rps": 0,
        "serie_rps": "1",
    }


def _log_xml(db: Session, nfse_id, tipo, xml_envio, xml_retorno="", http_status=None,
             protocolo="", sucesso=False, mensagem=""):
    log = XmlLog(
        nfse_id=nfse_id,
        tipo_operacao=tipo,
        xml_envio=xml_envio,
        xml_retorno=xml_retorno,
        http_status=http_status,
        protocolo=protocolo,
        sucesso=sucesso,
        mensagem=mensagem,
    )
    db.add(log)


def gerar_xml_lote_rps(nfses: list, config: dict) -> str:
    """Gera XML EnviarLoteRpsEnvio (ABRASF 2.04)."""
    root = ET.Element("EnviarLoteRpsEnvio", xmlns=ABRASF_NS)
    lote = _sub(root, "LoteRps", "")
    lote.set("Id", f"lote{datetime.utcnow().strftime('%Y%m%d%H%M%S')}")
    lote.set("versao", "2.04")

    _sub(lote, "NumeroLote", "1")
    cpf_cnpj = _sub(lote, "CpfCnpj")
    _sub(cpf_cnpj, "Cnpj", config.get("prestador_cnpj", ""))
    _sub(lote, "InscricaoMunicipal", config.get("inscricao_municipal", ""))
    _sub(lote, "QuantidadeRps", str(len(nfses)))

    lista = _sub(lote, "ListaRps")
    for nfse in nfses:
        _gerar_rps_element(lista, nfse, config)

    return ET.tostring(root, encoding="unicode", xml_declaration=True)


def _gerar_rps_element(parent, nfse, config: dict):
    rps = _sub(parent, "Rps")
    inf = _sub(rps, "InfDeclaracaoPrestacaoServico")

    # RPS identification
    rps_el = _sub(inf, "Rps")
    id_rps = _sub(rps_el, "IdentificacaoRps")
    _sub(id_rps, "Numero", nfse.rps_numero or nfse.numero)
    _sub(id_rps, "Serie", nfse.rps_serie or nfse.serie)
    _sub(id_rps, "Tipo", str(nfse.rps_tipo or 1))
    _sub(rps_el, "DataEmissao", nfse.data_emissao.isoformat() if nfse.data_emissao else "")
    _sub(rps_el, "Status", "1")

    _sub(inf, "Competencia", nfse.competencia.isoformat() if nfse.competencia else "")

    # Servico
    servico = _sub(inf, "Servico")
    valores = _sub(servico, "Valores")
    _sub(valores, "ValorServicos", f"{float(nfse.valor_servicos or 0):.2f}")
    _sub(valores, "ValorDeducoes", f"{float(nfse.valor_deducoes or 0):.2f}")
    _sub(valores, "ValorPis", f"{float(nfse.valor_pis or 0):.2f}")
    _sub(valores, "ValorCofins", f"{float(nfse.valor_cofins or 0):.2f}")
    _sub(valores, "ValorInss", f"{float(nfse.valor_inss or 0):.2f}")
    _sub(valores, "ValorIr", f"{float(nfse.valor_ir or 0):.2f}")
    _sub(valores, "ValorCsll", f"{float(nfse.valor_csll or 0):.2f}")
    _sub(valores, "OutrasRetencoes", f"{float(nfse.outras_retencoes or 0):.2f}")
    _sub(valores, "ValorIss", f"{float(nfse.valor_iss or 0):.2f}")
    _sub(valores, "Aliquota", f"{float(nfse.aliquota_iss or 0) / 100:.4f}")
    _sub(valores, "DescontoIncondicionado", f"{float(nfse.desconto_incondicionado or 0):.2f}")
    _sub(valores, "DescontoCondicionado", f"{float(nfse.desconto_condicionado or 0):.2f}")
    _sub(valores, "IssRetido", "1" if nfse.iss_retido else "2")
    _sub(servico, "ItemListaServico", nfse.item_lista_servico or "")
    _sub(servico, "CodigoCnae", nfse.codigo_cnae or "")
    _sub(servico, "CodigoTributacaoMunicipio", nfse.codigo_tributacao_municipio or "")
    _sub(servico, "Discriminacao", nfse.descricao_servico or "")
    _sub(servico, "CodigoMunicipio", nfse.municipio_prestacao or config.get("municipio_codigo", ""))

    # Prestador
    prestador = _sub(inf, "Prestador")
    cpf_cnpj_p = _sub(prestador, "CpfCnpj")
    _sub(cpf_cnpj_p, "Cnpj", config.get("prestador_cnpj", ""))
    _sub(prestador, "InscricaoMunicipal", config.get("inscricao_municipal", ""))

    # Tomador
    tomador = _sub(inf, "Tomador")
    id_tom = _sub(tomador, "IdentificacaoTomador")
    cpf_cnpj_t = _sub(id_tom, "CpfCnpj")
    doc = nfse.tomador_cpf_cnpj or ""
    if len(doc) > 11:
        _sub(cpf_cnpj_t, "Cnpj", doc)
    elif doc:
        _sub(cpf_cnpj_t, "Cpf", doc)
    _sub(tomador, "RazaoSocial", nfse.tomador_razao_social or "")

    if nfse.tomador_email:
        contato = _sub(tomador, "Contato")
        _sub(contato, "Email", nfse.tomador_email)

    _sub(inf, "OptanteSimplesNacional", "1" if nfse.optante_simples else "2")
    _sub(inf, "IncentivoFiscal", "1" if nfse.incentivo_fiscal else "2")


def gerar_xml_cancelamento(nfse, config: dict) -> str:
    root = ET.Element("CancelarNfseEnvio", xmlns=ABRASF_NS)
    pedido = _sub(root, "Pedido")
    inf = _sub(pedido, "InfPedidoCancelamento")
    id_nfse = _sub(inf, "IdentificacaoNfse")
    _sub(id_nfse, "Numero", nfse.numero)
    cpf_cnpj = _sub(id_nfse, "CpfCnpj")
    _sub(cpf_cnpj, "Cnpj", config.get("prestador_cnpj", ""))
    _sub(id_nfse, "InscricaoMunicipal", config.get("inscricao_municipal", ""))
    _sub(id_nfse, "CodigoMunicipio", config.get("municipio_codigo", ""))
    _sub(inf, "CodigoCancelamento", "1")
    return ET.tostring(root, encoding="unicode", xml_declaration=True)


def gerar_xml_consulta_lote(protocolo: str, config: dict) -> str:
    root = ET.Element("ConsultarLoteRpsEnvio", xmlns=ABRASF_NS)
    prestador = _sub(root, "Prestador")
    cpf_cnpj = _sub(prestador, "CpfCnpj")
    _sub(cpf_cnpj, "Cnpj", config.get("prestador_cnpj", ""))
    _sub(prestador, "InscricaoMunicipal", config.get("inscricao_municipal", ""))
    _sub(root, "Protocolo", protocolo)
    return ET.tostring(root, encoding="unicode", xml_declaration=True)


async def enviar_lote(db: Session, nfse_ids: list, config: dict) -> dict:
    import httpx

    url = config.get("webservice_url", "")
    if not url:
        return {"ok": False, "error": "URL do webservice nao configurada."}

    nfses = db.query(Nfse).filter(Nfse.id.in_(nfse_ids)).all()
    if not nfses:
        return {"ok": False, "error": "Nenhuma NFS-e encontrada."}

    xml = gerar_xml_lote_rps(nfses, config)

    for n in nfses:
        n.xml_envio = xml
        n.status = "PROCESSANDO"

    protocolo = ""
    try:
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(
                url,
                content=xml,
                headers={"Content-Type": "application/xml"},
            )
            xml_retorno = resp.text

            for n in nfses:
                n.xml_retorno = xml_retorno

            try:
                tree = ET.fromstring(xml_retorno)
                protocolo = tree.findtext(".//{%s}Protocolo" % ABRASF_NS) or ""
                for n in nfses:
                    n.protocolo = protocolo
                    n.status = "EMITIDA" if protocolo else "ERRO"
            except ET.ParseError:
                for n in nfses:
                    n.mensagem_retorno = xml_retorno[:500]
                    n.status = "ERRO"

        # Log XML
        for n in nfses:
            _log_xml(db, n.id, "ENVIAR_LOTE", xml, xml_retorno,
                     http_status=resp.status_code, protocolo=protocolo,
                     sucesso=bool(protocolo), mensagem=protocolo or "Sem protocolo")

        db.commit()
        return {"ok": True, "protocolo": protocolo, "enviadas": len(nfses)}
    except Exception as e:
        for n in nfses:
            n.status = "ERRO"
            n.mensagem_retorno = str(e)[:500]
        _log_xml(db, None, "ENVIAR_LOTE", xml, "", sucesso=False, mensagem=str(e)[:500])
        db.commit()
        return {"ok": False, "error": str(e)}


async def consultar_lote(db: Session, protocolo: str, config: dict) -> dict:
    import httpx

    url = config.get("webservice_url", "")
    if not url:
        return {"ok": False, "error": "URL do webservice nao configurada."}

    xml = gerar_xml_consulta_lote(protocolo, config)

    try:
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(url, content=xml, headers={"Content-Type": "application/xml"})
            _log_xml(db, None, "CONSULTAR_LOTE", xml, resp.text,
                     http_status=resp.status_code, protocolo=protocolo,
                     sucesso=resp.status_code == 200)
            db.commit()
            return {"ok": True, "xml": resp.text}
    except Exception as e:
        _log_xml(db, None, "CONSULTAR_LOTE", xml, "", sucesso=False, mensagem=str(e)[:500])
        db.commit()
        return {"ok": False, "error": str(e)}


async def cancelar_nfse_abrasf(db: Session, nfse_id: int, config: dict) -> dict:
    import httpx

    nfse = db.get(Nfse, nfse_id)
    if not nfse:
        return {"ok": False, "error": "NFS-e nao encontrada."}

    url = config.get("webservice_url", "")
    if not url:
        nfse.status = "CANCELADA"
        _log_xml(db, nfse.id, "CANCELAR", "", "", sucesso=True,
                 mensagem="Cancelada localmente (sem webservice configurado).")
        db.commit()
        return {"ok": True, "mensagem": "Cancelada localmente (sem webservice configurado)."}

    xml = gerar_xml_cancelamento(nfse, config)

    try:
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(url, content=xml, headers={"Content-Type": "application/xml"})
            nfse.status = "CANCELADA"
            nfse.xml_retorno = resp.text
            _log_xml(db, nfse.id, "CANCELAR", xml, resp.text,
                     http_status=resp.status_code, sucesso=True,
                     mensagem="NFS-e cancelada com sucesso.")
            db.commit()
            return {"ok": True, "mensagem": "NFS-e cancelada com sucesso."}
    except Exception as e:
        _log_xml(db, nfse.id, "CANCELAR", xml, "", sucesso=False, mensagem=str(e)[:500])
        db.commit()
        return {"ok": False, "error": str(e)}
