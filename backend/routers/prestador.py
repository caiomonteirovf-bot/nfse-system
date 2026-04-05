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
        # Nuvem Fiscal
        "nuvem_fiscal_client_id": (data.get("nuvemFiscalClientId") or "").strip(),
        "nuvem_fiscal_client_secret": (data.get("nuvemFiscalClientSecret") or "").strip(),
        "nuvem_fiscal_ambiente": (data.get("nuvemFiscalAmbiente") or "homologacao").strip().lower(),
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

    # Mapa camelCase → snake_case para merge parcial
    FIELD_MAP = {
        "cnpj": "cnpj", "inscricaoMunicipal": "inscricao_municipal",
        "razaoSocial": "razao_social", "nomeFantasia": "nome_fantasia",
        "logradouro": "logradouro", "numeroEndereco": "numero_endereco",
        "complemento": "complemento", "bairro": "bairro",
        "cidade": "cidade", "uf": "uf", "cep": "cep",
        "codigoMunicipio": "codigo_municipio",
        "webserviceUrl": "webservice_url", "certificadoPath": "certificado_path",
        "certificadoSenha": "certificado_senha", "ambiente": "ambiente",
        "itemListaServico": "item_lista_servico", "codigoCnae": "codigo_cnae",
        "codigoTributacao": "codigo_tributacao",
        "aliquotaIssPadrao": "aliquota_iss_padrao",
        "naturezaOperacao": "natureza_operacao",
        "regimeEspecial": "regime_especial",
        "optanteSimples": "optante_simples", "incentivoFiscal": "incentivo_fiscal",
        "ultimoRps": "ultimo_rps", "serieRps": "serie_rps",
        "nuvemFiscalClientId": "nuvem_fiscal_client_id",
        "nuvemFiscalClientSecret": "nuvem_fiscal_client_secret",
        "nuvemFiscalAmbiente": "nuvem_fiscal_ambiente",
    }
    FLOAT_FIELDS = {"aliquota_iss_padrao"}
    INT_FIELDS = {"natureza_operacao", "regime_especial", "ultimo_rps"}
    BOOL_FIELDS = {"optante_simples", "incentivo_fiscal"}

    for camel, snake in FIELD_MAP.items():
        if camel not in body:
            continue
        val = body[camel]
        if snake in FLOAT_FIELDS:
            val = float(val or 0)
        elif snake in INT_FIELDS:
            val = int(val or 0)
        elif snake in BOOL_FIELDS:
            val = bool(val) if val is not None else False
        elif snake == "nuvem_fiscal_ambiente":
            val = (val or "homologacao").strip().lower()
        elif snake in ("nuvem_fiscal_client_id", "nuvem_fiscal_client_secret"):
            val = (val or "").strip()
        else:
            val = normalize_text(val) if val is not None else ""
        setattr(config, snake, val)

    config.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(config)
    return {"ok": True, "data": config.to_dict()}
