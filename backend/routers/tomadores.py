import asyncio
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.models.tomador import Tomador
from backend.services import nuvem_fiscal
from backend.utils.normalize import normalize_text

router = APIRouter(prefix="/tomadores", tags=["tomadores"])


def _normalize_tomador(data: dict) -> dict:
    return {
        "cpf_cnpj": normalize_text(data.get("cpfCnpj")),
        "razao_social": normalize_text(data.get("razaoSocial")),
        "nome_fantasia": normalize_text(data.get("nomeFantasia")),
        "email": normalize_text(data.get("email")),
        "telefone": normalize_text(data.get("telefone")),
        "inscricao_municipal": normalize_text(data.get("inscricaoMunicipal")),
        "inscricao_estadual": normalize_text(data.get("inscricaoEstadual")),
        "logradouro": normalize_text(data.get("logradouro")),
        "numero_endereco": normalize_text(data.get("numeroEndereco")),
        "complemento": normalize_text(data.get("complemento")),
        "bairro": normalize_text(data.get("bairro")),
        "cidade": normalize_text(data.get("cidade")),
        "uf": normalize_text(data.get("uf")),
        "cep": normalize_text(data.get("cep")),
        "codigo_municipio": normalize_text(data.get("codigoMunicipio")),
        "observacoes": normalize_text(data.get("observacoes")),
        "ativo": data.get("ativo", True),
    }


@router.get("")
def listar_tomadores(
    search: str = Query(None),
    ativo: bool = Query(None),
    db: Session = Depends(get_db),
):
    query = db.query(Tomador)

    if search:
        pattern = f"%{search.strip()}%"
        query = query.filter(
            Tomador.razao_social.ilike(pattern)
            | Tomador.cpf_cnpj.ilike(pattern)
            | Tomador.email.ilike(pattern)
            | Tomador.nome_fantasia.ilike(pattern)
        )
    if ativo is not None:
        query = query.filter(Tomador.ativo == ativo)

    items = query.order_by(Tomador.razao_social.asc()).all()
    return {"ok": True, "data": [t.to_dict() for t in items]}


@router.get("/consultar-cep/{cep}")
async def consultar_cep(cep: str, db: Session = Depends(get_db)):
    """Consulta CEP e retorna endereço + código IBGE."""
    result = await nuvem_fiscal.consultar_cep(db, cep)
    if not result.get("ok"):
        raise HTTPException(status_code=404, detail=result.get("error", "CEP não encontrado."))
    return result


@router.get("/por-documento/{documento}")
def buscar_tomador_por_documento(documento: str, db: Session = Depends(get_db)):
    doc_limpo = documento.replace(".", "").replace("/", "").replace("-", "").strip()
    if not doc_limpo:
        raise HTTPException(status_code=400, detail="Documento invalido.")
    from sqlalchemy import func
    item = db.query(Tomador).filter(
        func.replace(func.replace(func.replace(Tomador.cpf_cnpj, ".", ""), "/", ""), "-", "") == doc_limpo
    ).first()
    if not item:
        return {"ok": False, "data": None}
    return {"ok": True, "data": item.to_dict()}


@router.get("/{tomador_id}")
def obter_tomador(tomador_id: int, db: Session = Depends(get_db)):
    item = db.get(Tomador, tomador_id)
    if not item:
        raise HTTPException(status_code=404, detail="Tomador nao encontrado.")
    return {"ok": True, "data": item.to_dict()}


@router.post("", status_code=201)
async def criar_tomador(body: dict, db: Session = Depends(get_db)):
    normalized = _normalize_tomador(body)

    if not normalized.get("cpf_cnpj"):
        raise HTTPException(status_code=400, detail="CPF/CNPJ obrigatorio.")
    if not normalized.get("razao_social"):
        raise HTTPException(status_code=400, detail="Razao Social obrigatoria.")

    # Auto-preencher código IBGE via CEP se não informado
    if normalized.get("cep") and not normalized.get("codigo_municipio"):
        try:
            cep_result = await nuvem_fiscal.consultar_cep(db, normalized["cep"])
            if cep_result.get("ok"):
                cep_data = cep_result["data"]
                normalized["codigo_municipio"] = cep_data.get("codigo_municipio", "")
                if not normalized.get("cidade") and cep_data.get("cidade"):
                    normalized["cidade"] = cep_data["cidade"]
                if not normalized.get("uf") and cep_data.get("uf"):
                    normalized["uf"] = cep_data["uf"]
                if not normalized.get("bairro") and cep_data.get("bairro"):
                    normalized["bairro"] = cep_data["bairro"]
                if not normalized.get("logradouro") and cep_data.get("logradouro"):
                    normalized["logradouro"] = cep_data["logradouro"]
        except Exception:
            pass  # Não bloquear cadastro se CEP falhar

    # Verificar duplicidade
    existing = db.query(Tomador).filter(Tomador.cpf_cnpj == normalized["cpf_cnpj"]).first()
    if existing:
        raise HTTPException(status_code=400, detail="Ja existe um tomador com este CPF/CNPJ.")

    tomador = Tomador(**normalized)
    db.add(tomador)
    db.commit()
    db.refresh(tomador)
    return {"ok": True, "data": tomador.to_dict()}


@router.put("/{tomador_id}")
async def atualizar_tomador(tomador_id: int, body: dict, db: Session = Depends(get_db)):
    item = db.get(Tomador, tomador_id)
    if not item:
        raise HTTPException(status_code=404, detail="Tomador nao encontrado.")

    normalized = _normalize_tomador(body)

    # Auto-preencher código IBGE via CEP se não informado
    if normalized.get("cep") and not normalized.get("codigo_municipio"):
        try:
            cep_result = await nuvem_fiscal.consultar_cep(db, normalized["cep"])
            if cep_result.get("ok"):
                cep_data = cep_result["data"]
                normalized["codigo_municipio"] = cep_data.get("codigo_municipio", "")
                if not normalized.get("cidade") and cep_data.get("cidade"):
                    normalized["cidade"] = cep_data["cidade"]
                if not normalized.get("uf") and cep_data.get("uf"):
                    normalized["uf"] = cep_data["uf"]
        except Exception:
            pass

    for key, value in normalized.items():
        setattr(item, key, value)

    item.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(item)
    return {"ok": True, "data": item.to_dict()}


@router.delete("/{tomador_id}")
def excluir_tomador(tomador_id: int, db: Session = Depends(get_db)):
    item = db.get(Tomador, tomador_id)
    if not item:
        raise HTTPException(status_code=404, detail="Tomador nao encontrado.")
    db.delete(item)
    db.commit()
    return {"ok": True}
