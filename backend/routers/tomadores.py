from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.models.tomador import Tomador
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


@router.get("/{tomador_id}")
def obter_tomador(tomador_id: int, db: Session = Depends(get_db)):
    item = db.get(Tomador, tomador_id)
    if not item:
        raise HTTPException(status_code=404, detail="Tomador nao encontrado.")
    return {"ok": True, "data": item.to_dict()}


@router.post("", status_code=201)
def criar_tomador(body: dict, db: Session = Depends(get_db)):
    normalized = _normalize_tomador(body)

    if not normalized.get("cpf_cnpj"):
        raise HTTPException(status_code=400, detail="CPF/CNPJ obrigatorio.")
    if not normalized.get("razao_social"):
        raise HTTPException(status_code=400, detail="Razao Social obrigatoria.")

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
def atualizar_tomador(tomador_id: int, body: dict, db: Session = Depends(get_db)):
    item = db.get(Tomador, tomador_id)
    if not item:
        raise HTTPException(status_code=404, detail="Tomador nao encontrado.")

    normalized = _normalize_tomador(body)
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
