from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.models.prestador import PrestadorConfig
from backend.utils.normalize import normalize_text

router = APIRouter(prefix="/prestador", tags=["prestador"])


def _normalize_prestador(data: dict) -> dict:
    def _bool(val):
        if isinstance(val, bool):
            return val
        return bool(val) if val else False

    return {
        "cnpj": normalize_text(data.get("cnpj")),
        "inscricao_municipal": normalize_text(data.get("inscricaoMunicipal")),
        "razao_social": normalize_text(data.get("razaoSocial")),
        "nome_fantasia": normalize_text(data.get("nomeFantasia")),
        "logradouro": normalize_text(data.get("logradouro")),
        "numero_endereco": normalize_text(data.get("numeroEndereco")),
        "complemento": normalize_text(data.get("complemento")),
        "bairro": normalize_text(data.get("bairro")),
        "cidade": normalize_text(data.get("cidade")),
        "uf": normalize_text(data.get("uf")),
        "cep": normalize_text(data.get("cep")),
        "codigo_municipio": normalize_text(data.get("codigoMunicipio")),
        "webservice_url": normalize_text(data.get("webserviceUrl")),
        "certificado_path": normalize_text(data.get("certificadoPath")),
        "certificado_senha": normalize_text(data.get("certificadoSenha")),
        "ambiente": normalize_text(data.get("ambiente"), "HOMOLOGACAO"),
        "item_lista_servico": normalize_text(data.get("itemListaServico")),
        "codigo_cnae": normalize_text(data.get("codigoCnae")),
        "codigo_tributacao": normalize_text(data.get("codigoTributacao")),
        "aliquota_iss_padrao": float(data.get("aliquotaIssPadrao") or 0),
        "natureza_operacao": int(data.get("naturezaOperacao") or 1),
        "regime_especial": int(data.get("regimeEspecial") or 0),
        "optante_simples": _bool(data.get("optanteSimples")),
        "incentivo_fiscal": _bool(data.get("incentivoFiscal")),
        "ultimo_rps": int(data.get("ultimoRps") or 0),
        "serie_rps": normalize_text(data.get("serieRps"), "1"),
    }


@router.get("")
def obter_config(db: Session = Depends(get_db)):
    config = db.query(PrestadorConfig).first()
    if not config:
        config = PrestadorConfig()
        db.add(config)
        db.commit()
        db.refresh(config)
    return {"ok": True, "data": config.to_dict()}


@router.put("")
def atualizar_config(body: dict, db: Session = Depends(get_db)):
    config = db.query(PrestadorConfig).first()
    if not config:
        config = PrestadorConfig()
        db.add(config)

    normalized = _normalize_prestador(body)
    for key, value in normalized.items():
        setattr(config, key, value)

    config.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(config)
    return {"ok": True, "data": config.to_dict()}
