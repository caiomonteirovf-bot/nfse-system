from fastapi import APIRouter, Body, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.models.nfse import Nfse
from backend.services.abrasf import (
    get_prestador_config, enviar_lote, consultar_lote, cancelar_nfse_abrasf,
)
from backend.services import nuvem_fiscal

router = APIRouter(prefix="/emissao", tags=["emissao"])


# ============================================
# ABRASF (legado)
# ============================================

@router.post("/enviar-lote")
async def emitir_nfse_abrasf(body: dict, db: Session = Depends(get_db)):
    """Envia lote de RPS para emissao via ABRASF."""
    ids = body.get("ids", [])
    if not ids:
        raise HTTPException(status_code=400, detail="Nenhuma NFS-e selecionada.")

    config = get_prestador_config(db)
    for key in ("webservice_url", "prestador_cnpj", "inscricao_municipal", "razao_social", "municipio_codigo"):
        if body.get(key):
            config[key] = body[key]

    result = await enviar_lote(db, ids, config)
    return result


@router.get("/consultar-lote/{protocolo}")
async def consultar_lote_endpoint(protocolo: str, db: Session = Depends(get_db)):
    config = get_prestador_config(db)
    result = await consultar_lote(db, protocolo, config)
    return result


# ============================================
# NUVEM FISCAL
# ============================================

@router.post("/nuvem-fiscal/emitir")
async def emitir_nfse_nuvem(body: dict, db: Session = Depends(get_db)):
    """Emite NFS-e(s) via Nuvem Fiscal API.

    Body:
      ids: list[int] — IDs das NFS-e para emitir
      prestador_cnpj: str (opcional) — CNPJ do prestador. Se informado,
        busca dados completos no Gesthub e usa como prestador dinâmico
        em vez do PrestadorConfig fixo.
    """
    ids = body.get("ids", [])
    if not ids:
        raise HTTPException(status_code=400, detail="Nenhuma NFS-e selecionada.")

    prestador_cnpj = body.get("prestador_cnpj", "")
    prestador_data = None

    if prestador_cnpj:
        from backend.services.gesthub import get_prestador_data
        prestador_data = await get_prestador_data(prestador_cnpj)
        if not prestador_data:
            raise HTTPException(
                status_code=404,
                detail=f"Prestador com CNPJ {prestador_cnpj} não encontrado no Gesthub."
            )

        # Enriquecer com dados da tabela Empresa (config tributária local)
        from backend.models.empresa import Empresa
        cnpj_limpo = prestador_cnpj.replace(".", "").replace("/", "").replace("-", "")
        empresa_local = db.query(Empresa).filter(Empresa.cnpj == cnpj_limpo).first()
        if empresa_local:
            # Empresa local tem prioridade para campos de tributação
            if empresa_local.inscricao_municipal:
                prestador_data["inscricao_municipal"] = empresa_local.inscricao_municipal
            if empresa_local.codigo_cnae:
                prestador_data["cnae"] = empresa_local.codigo_cnae
            if empresa_local.codigo_tributacao:
                prestador_data["codigo_tributacao"] = empresa_local.codigo_tributacao
            if empresa_local.item_lista_servico:
                prestador_data["item_lista_servico"] = empresa_local.item_lista_servico
            if empresa_local.aliquota_iss_padrao:
                prestador_data["aliquota_iss"] = empresa_local.aliquota_iss_padrao
            prestador_data["optante_simples"] = empresa_local.optante_simples
            prestador_data["regime_especial"] = empresa_local.regime_especial

    result = await nuvem_fiscal.emitir_nfse(db, ids, prestador_data=prestador_data)
    return result


@router.get("/nuvem-fiscal/consultar/{nuvem_id}")
async def consultar_nfse_nuvem(nuvem_id: str, db: Session = Depends(get_db)):
    """Consulta NFS-e pelo ID na Nuvem Fiscal."""
    result = await nuvem_fiscal.consultar_nfse(db, nuvem_id)
    return result


@router.get("/nuvem-fiscal/status/{nuvem_id}")
async def status_nfse_nuvem(nuvem_id: str, db: Session = Depends(get_db)):
    """Consulta status de processamento na Nuvem Fiscal."""
    result = await nuvem_fiscal.consultar_status(db, nuvem_id)
    return result


@router.get("/nuvem-fiscal/pdf/{nuvem_id}")
async def pdf_nfse_nuvem(nuvem_id: str, db: Session = Depends(get_db)):
    """Baixa PDF (DANFS-e) da NFS-e emitida via Nuvem Fiscal."""
    result = await nuvem_fiscal.baixar_pdf(db, nuvem_id)
    if not result.get("ok"):
        raise HTTPException(status_code=404, detail=result.get("error", "PDF não encontrado."))
    return Response(
        content=result["content"],
        media_type="application/pdf",
        headers={"Content-Disposition": f"inline; filename=nfse_{nuvem_id}.pdf"}
    )


@router.post("/nuvem-fiscal/cancelar/{nuvem_id}")
async def cancelar_nfse_nuvem(nuvem_id: str, body: dict = Body(default={}), db: Session = Depends(get_db)):
    """Cancela NFS-e via Nuvem Fiscal."""
    motivo = (body or {}).get("motivo", "Cancelamento solicitado")
    result = await nuvem_fiscal.cancelar_nfse(db, nuvem_id, motivo)
    if not result.get("ok"):
        raise HTTPException(status_code=400, detail=result.get("error", "Erro ao cancelar."))
    # Atualiza status local
    nfse = db.query(Nfse).filter(
        (Nfse.protocolo == nuvem_id) | (Nfse.chave_acesso == nuvem_id)
    ).first()
    if nfse:
        nfse.status = "CANCELADA"
        db.commit()
    return result


@router.post("/nuvem-fiscal/poll-processando")
async def poll_processando(db: Session = Depends(get_db)):
    """Verifica status de todas as NFS-e em PROCESSANDO e atualiza o banco."""
    processando = db.query(Nfse).filter(
        Nfse.status == "PROCESSANDO",
        Nfse.protocolo.isnot(None),
        Nfse.protocolo != "",
    ).all()

    if not processando:
        return {"ok": True, "data": {"total": 0, "atualizadas": 0, "resultados": []}}

    resultados = []
    atualizadas = 0

    for nfse_local in processando:
        result = await nuvem_fiscal.consultar_status(db, nfse_local.protocolo)
        if not result.get("ok"):
            resultados.append({
                "id": nfse_local.id,
                "protocolo": nfse_local.protocolo,
                "status_anterior": "PROCESSANDO",
                "status_novo": None,
                "erro": result.get("error"),
            })
            continue

        data = result["data"]
        novo_status = (data.get("status") or "").upper()

        # Mapear status Nuvem Fiscal → status local
        status_map = {
            "AUTORIZADO": "EMITIDA",
            "AUTORIZADA": "EMITIDA",
            "CONCLUIDO": "EMITIDA",
            "CONCLUIDA": "EMITIDA",
            "REJEITADO": "ERRO",
            "REJEITADA": "ERRO",
            "ERRO": "ERRO",
            "CANCELADO": "CANCELADA",
            "CANCELADA": "CANCELADA",
        }
        status_local = status_map.get(novo_status, None)

        if status_local and status_local != "PROCESSANDO":
            nfse_local.status = status_local
            if data.get("numero"):
                nfse_local.numero = str(data["numero"])
            if data.get("chave_acesso"):
                nfse_local.chave_acesso = data["chave_acesso"]
            msgs = data.get("mensagens") or []
            if msgs:
                nfse_local.mensagem_retorno = "; ".join(
                    m.get("mensagem", str(m)) if isinstance(m, dict) else str(m)
                    for m in msgs[:5]
                )
            atualizadas += 1
            resultados.append({
                "id": nfse_local.id,
                "protocolo": nfse_local.protocolo,
                "status_anterior": "PROCESSANDO",
                "status_novo": status_local,
                "numero": data.get("numero"),
            })
        else:
            resultados.append({
                "id": nfse_local.id,
                "protocolo": nfse_local.protocolo,
                "status_anterior": "PROCESSANDO",
                "status_novo": novo_status or "PROCESSANDO",
            })

    if atualizadas > 0:
        db.commit()

    return {"ok": True, "data": {"total": len(processando), "atualizadas": atualizadas, "resultados": resultados}}


@router.post("/nuvem-fiscal/empresa/cadastrar")
async def cadastrar_empresa_nuvem(db: Session = Depends(get_db)):
    """Cadastra/atualiza empresa na Nuvem Fiscal."""
    result = await nuvem_fiscal.cadastrar_empresa(db)
    return result


@router.post("/nuvem-fiscal/empresa/configurar-nfse")
async def configurar_nfse_nuvem(db: Session = Depends(get_db)):
    """Configura NFS-e para a empresa na Nuvem Fiscal."""
    result = await nuvem_fiscal.configurar_nfse_empresa(db)
    return result


@router.post("/nuvem-fiscal/empresa/certificado")
async def upload_certificado_nuvem(body: dict, db: Session = Depends(get_db)):
    """Upload do certificado digital A1 para Nuvem Fiscal."""
    pfx_base64 = body.get("certificado", "")
    senha = body.get("senha", "")
    if not pfx_base64 or not senha:
        raise HTTPException(status_code=400, detail="Certificado (base64) e senha são obrigatórios.")
    result = await nuvem_fiscal.upload_certificado_nuvem(db, pfx_base64, senha)
    return result


@router.get("/nuvem-fiscal/listar")
async def listar_nfse_nuvem(pagina: int = 1, db: Session = Depends(get_db)):
    """Lista NFS-e emitidas na Nuvem Fiscal."""
    result = await nuvem_fiscal.listar_nfse_api(db, pagina=pagina)
    return result


# ============================================
# CANCELAMENTO UNIFICADO
# ============================================

@router.post("/{nfse_id}/cancelar")
async def cancelar_nfse_unificado(nfse_id: int, body: dict = Body(default={}), db: Session = Depends(get_db)):
    """Cancela NFS-e — tenta Nuvem Fiscal primeiro, fallback local se API não suporta."""
    nfse = db.query(Nfse).filter(Nfse.id == nfse_id).first()
    if not nfse:
        raise HTTPException(status_code=404, detail="NFS-e não encontrada.")

    motivo = (body or {}).get("motivo", "Cancelamento solicitado")
    force_local = (body or {}).get("forceLocal", False)

    # Se tem protocolo Nuvem Fiscal e não é forceLocal, tenta cancelar via API
    if nfse.protocolo and nfse.origem == "EMITIDA" and not force_local:
        result = await nuvem_fiscal.cancelar_nfse(db, nfse.protocolo, motivo)
        if result.get("ok"):
            nfse.status = "CANCELADA"
            nfse.mensagem_retorno = f"Cancelada via Nuvem Fiscal. Motivo: {motivo}"
            db.commit()
            return result
        # Se o erro é "não implementado", retorna info para cancelamento manual
        if result.get("nao_implementado"):
            chave = nfse.chave_acesso or nfse.codigo_verificacao or ""
            link = getattr(nfse, "link_url", "") or ""
            portal_url = "https://www.nfse.gov.br/EmissorNacional/Notas/Emitidas"
            return {
                "ok": False,
                "error": result.get("error", ""),
                "canForceLocal": True,
                "chaveAcesso": chave,
                "linkConsulta": link,
                "portalUrl": portal_url,
                "message": (
                    "O cancelamento via API não está disponível para este município. "
                    "Você pode cancelar manualmente no Portal NFS-e ou marcar como cancelada localmente."
                ),
            }
        error_msg = result.get("error", "")
        raise HTTPException(status_code=400, detail=error_msg or "Erro ao cancelar na Nuvem Fiscal.")

    # Cancelamento local (sem protocolo ou forceLocal)
    nfse.status = "CANCELADA"
    nfse.mensagem_retorno = f"Cancelada localmente. Motivo: {motivo}"
    db.commit()
    msg = "Cancelada localmente" + (" (API não disponível para este município)" if force_local else "")
    return {"ok": True, "data": {"message": msg}}
