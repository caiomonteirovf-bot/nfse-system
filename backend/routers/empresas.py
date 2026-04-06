"""Router para gestão de empresas/prestadores — CRUD + integração Nuvem Fiscal."""

import base64
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.models.empresa import Empresa
from backend.services import nuvem_fiscal

router = APIRouter(prefix="/empresas", tags=["empresas"])


@router.get("")
def listar_empresas(db: Session = Depends(get_db)):
    items = db.query(Empresa).order_by(Empresa.razao_social).all()
    return {"ok": True, "data": [e.to_dict() for e in items]}


@router.get("/{empresa_id}")
def obter_empresa(empresa_id: int, db: Session = Depends(get_db)):
    item = db.get(Empresa, empresa_id)
    if not item:
        raise HTTPException(status_code=404, detail="Empresa não encontrada.")
    return {"ok": True, "data": item.to_dict()}


@router.get("/cnpj/{cnpj}")
def obter_empresa_por_cnpj(cnpj: str, db: Session = Depends(get_db)):
    doc = cnpj.replace(".", "").replace("/", "").replace("-", "")
    item = db.query(Empresa).filter(Empresa.cnpj == doc).first()
    if not item:
        return {"ok": False, "error": "Empresa não encontrada."}
    return {"ok": True, "data": item.to_dict()}


@router.post("", status_code=201)
def criar_empresa(body: dict, db: Session = Depends(get_db)):
    cnpj = (body.get("cnpj", "") or "").replace(".", "").replace("/", "").replace("-", "")
    if not cnpj:
        raise HTTPException(status_code=400, detail="CNPJ obrigatório.")

    existing = db.query(Empresa).filter(Empresa.cnpj == cnpj).first()
    if existing:
        raise HTTPException(status_code=409, detail="Empresa já cadastrada.")

    empresa = Empresa(
        cnpj=cnpj,
        razao_social=body.get("razaoSocial", ""),
        nome_fantasia=body.get("nomeFantasia", ""),
        logradouro=body.get("logradouro", ""),
        numero_endereco=body.get("numeroEndereco", ""),
        complemento=body.get("complemento", ""),
        bairro=body.get("bairro", ""),
        cidade=body.get("cidade", ""),
        uf=body.get("uf", ""),
        cep=body.get("cep", ""),
        codigo_municipio=body.get("codigoMunicipio", ""),
        email=body.get("email", ""),
        telefone=body.get("telefone", ""),
        inscricao_municipal=body.get("inscricaoMunicipal", ""),
        item_lista_servico=body.get("itemListaServico", ""),
        codigo_cnae=body.get("codigoCnae", ""),
        codigo_tributacao=body.get("codigoTributacao", ""),
        aliquota_iss_padrao=float(body.get("aliquotaIssPadrao", 0) or 0),
        optante_simples=bool(body.get("optanteSimples", False)),
        regime_especial=int(body.get("regimeEspecial", 0) or 0),
        incentivo_fiscal=bool(body.get("incentivoFiscal", False)),
        gesthub_client_id=body.get("gesthubClientId"),
        observacoes=body.get("observacoes", ""),
    )
    db.add(empresa)
    db.commit()
    db.refresh(empresa)
    return {"ok": True, "data": empresa.to_dict()}


@router.put("/{empresa_id}")
def atualizar_empresa(empresa_id: int, body: dict, db: Session = Depends(get_db)):
    item = db.get(Empresa, empresa_id)
    if not item:
        raise HTTPException(status_code=404, detail="Empresa não encontrada.")

    fields = [
        "razaoSocial", "nomeFantasia", "logradouro", "numeroEndereco",
        "complemento", "bairro", "cidade", "uf", "cep", "codigoMunicipio",
        "email", "telefone", "inscricaoMunicipal",
        "itemListaServico", "codigoCnae", "codigoTributacao",
        "aliquotaIssPadrao", "optanteSimples", "regimeEspecial",
        "incentivoFiscal", "gesthubClientId", "observacoes",
    ]
    field_map = {
        "razaoSocial": "razao_social",
        "nomeFantasia": "nome_fantasia",
        "logradouro": "logradouro",
        "numeroEndereco": "numero_endereco",
        "complemento": "complemento",
        "bairro": "bairro",
        "cidade": "cidade",
        "uf": "uf",
        "cep": "cep",
        "codigoMunicipio": "codigo_municipio",
        "email": "email",
        "telefone": "telefone",
        "inscricaoMunicipal": "inscricao_municipal",
        "itemListaServico": "item_lista_servico",
        "codigoCnae": "codigo_cnae",
        "codigoTributacao": "codigo_tributacao",
        "aliquotaIssPadrao": "aliquota_iss_padrao",
        "optanteSimples": "optante_simples",
        "regimeEspecial": "regime_especial",
        "incentivoFiscal": "incentivo_fiscal",
        "gesthubClientId": "gesthub_client_id",
        "observacoes": "observacoes",
    }

    for camel, snake in field_map.items():
        if camel in body:
            val = body[camel]
            if snake == "aliquota_iss_padrao":
                val = float(val or 0)
            elif snake == "optante_simples" or snake == "incentivo_fiscal":
                val = bool(val)
            elif snake == "regime_especial":
                val = int(val or 0)
            setattr(item, snake, val)

    db.commit()
    db.refresh(item)
    return {"ok": True, "data": item.to_dict()}


@router.delete("/{empresa_id}")
def excluir_empresa(empresa_id: int, db: Session = Depends(get_db)):
    item = db.get(Empresa, empresa_id)
    if not item:
        raise HTTPException(status_code=404, detail="Empresa não encontrada.")
    db.delete(item)
    db.commit()
    return {"ok": True}


# ============================================
# NUVEM FISCAL — Cadastrar / Configurar / Certificado por empresa
# ============================================

@router.post("/{empresa_id}/nuvem-fiscal/cadastrar")
async def cadastrar_empresa_nuvem(empresa_id: int, db: Session = Depends(get_db)):
    """Cadastra/atualiza empresa na Nuvem Fiscal."""
    empresa = db.get(Empresa, empresa_id)
    if not empresa:
        raise HTTPException(status_code=404, detail="Empresa não encontrada.")
    result = await nuvem_fiscal.cadastrar_empresa_por_cnpj(db, empresa)
    if result.get("ok"):
        empresa.nuvem_fiscal_cadastrada = True
        db.commit()
    return result


@router.post("/{empresa_id}/nuvem-fiscal/configurar-nfse")
async def configurar_nfse_empresa(empresa_id: int, db: Session = Depends(get_db)):
    """Configura NFS-e para a empresa na Nuvem Fiscal."""
    empresa = db.get(Empresa, empresa_id)
    if not empresa:
        raise HTTPException(status_code=404, detail="Empresa não encontrada.")
    result = await nuvem_fiscal.configurar_nfse_por_cnpj(db, empresa)
    if result.get("ok"):
        empresa.nuvem_fiscal_nfse_config = True
        db.commit()
    return result


@router.post("/{empresa_id}/nuvem-fiscal/certificado")
async def upload_certificado_empresa(empresa_id: int, body: dict, db: Session = Depends(get_db)):
    """Upload do certificado digital A1 para empresa na Nuvem Fiscal."""
    empresa = db.get(Empresa, empresa_id)
    if not empresa:
        raise HTTPException(status_code=404, detail="Empresa não encontrada.")

    pfx_base64 = body.get("certificado", "")
    senha = body.get("senha", "")
    if not pfx_base64 or not senha:
        raise HTTPException(status_code=400, detail="Certificado (base64) e senha obrigatórios.")

    result = await nuvem_fiscal.upload_certificado_por_cnpj(db, empresa, pfx_base64, senha)
    if result.get("ok"):
        empresa.nuvem_fiscal_certificado = True
        empresa.certificado_senha = senha
        empresa.certificado_pfx = base64.b64decode(pfx_base64)

        # Extrair info do certificado via resposta da Nuvem Fiscal
        data = result.get("data", {})
        if data.get("not_valid_after"):
            try:
                empresa.certificado_validade = datetime.fromisoformat(
                    data["not_valid_after"].replace("Z", "+00:00")
                )
                now = datetime.utcnow()
                days_left = (empresa.certificado_validade.replace(tzinfo=None) - now).days
                if days_left < 0:
                    empresa.certificado_status = "VENCIDO"
                elif days_left < 30:
                    empresa.certificado_status = "A_VENCER"
                else:
                    empresa.certificado_status = "NO_PRAZO"
            except (ValueError, TypeError):
                pass
        # CNPJ do certificado (do subject)
        subject = data.get("subject_name", "")
        if subject:
            import re
            cnpj_match = re.search(r'\d{14}', subject.replace(".", "").replace("/", "").replace("-", ""))
            if cnpj_match:
                empresa.certificado_cnpj = cnpj_match.group()

        db.commit()
    return result
