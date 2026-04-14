"""Modelo Empresa — configuração de emissão por CNPJ.

Cada empresa/prestador do escritório tem seu próprio registro com:
- Certificado digital A1
- Inscrição municipal, código IBGE
- Configurações tributárias (CNAE, alíquota ISS, regime)
- Status na Nuvem Fiscal (cadastrada, certificado enviado)

Os dados cadastrais (razão social, endereço) vêm do Gesthub.
As credenciais OAuth da Nuvem Fiscal ficam no PrestadorConfig (global).
"""

import json
from datetime import datetime
from sqlalchemy import String, Float, Integer, Boolean, DateTime, LargeBinary, Text
from sqlalchemy.orm import Mapped, mapped_column

from backend.database import Base


class Empresa(Base):
    """Configuração de emissão NFS-e por empresa/CNPJ."""
    __tablename__ = "empresas"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)

    # Identificação (chave de lookup)
    cnpj: Mapped[str] = mapped_column(String(20), unique=True, nullable=False)
    razao_social: Mapped[str] = mapped_column(String(200), default="")
    nome_fantasia: Mapped[str] = mapped_column(String(200), default="")

    # Endereço (cache do Gesthub / Receita)
    logradouro: Mapped[str] = mapped_column(String(200), default="")
    numero_endereco: Mapped[str] = mapped_column(String(20), default="")
    complemento: Mapped[str] = mapped_column(String(100), default="")
    bairro: Mapped[str] = mapped_column(String(100), default="")
    cidade: Mapped[str] = mapped_column(String(100), default="")
    uf: Mapped[str] = mapped_column(String(2), default="")
    cep: Mapped[str] = mapped_column(String(10), default="")
    codigo_municipio: Mapped[str] = mapped_column(String(10), default="")
    email: Mapped[str] = mapped_column(String(200), default="")
    telefone: Mapped[str] = mapped_column(String(30), default="")

    # Inscrição municipal (obrigatória para emissão)
    inscricao_municipal: Mapped[str] = mapped_column(String(20), default="")

    # Certificado Digital A1
    certificado_pfx: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True)
    certificado_senha: Mapped[str] = mapped_column(String(500), default="")
    certificado_validade: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    certificado_cnpj: Mapped[str] = mapped_column(String(20), default="")
    certificado_status: Mapped[str] = mapped_column(String(20), default="")  # NO_PRAZO / A_VENCER / VENCIDO

    # Configuração tributária
    item_lista_servico: Mapped[str] = mapped_column(String(10), default="")  # cTribMun (3 dígitos)
    codigo_cnae: Mapped[str] = mapped_column(String(10), default="")
    codigo_tributacao: Mapped[str] = mapped_column(String(20), default="")  # cTribNac (6 dígitos)
    aliquota_iss_padrao: Mapped[float] = mapped_column(Float, default=0.0)
    optante_simples: Mapped[bool] = mapped_column(Boolean, default=False)
    regime_especial: Mapped[int] = mapped_column(Integer, default=0)
    incentivo_fiscal: Mapped[bool] = mapped_column(Boolean, default=False)

    # Lista de servicos (JSON): [{"cnae": "6920601", "cTribMun": "501", "cTribNac": "171901", "descricao": "Contabilidade", "aliquota": 5.0}]
    servicos_json: Mapped[str] = mapped_column(Text, default="[]")

    # Status Nuvem Fiscal
    nuvem_fiscal_cadastrada: Mapped[bool] = mapped_column(Boolean, default=False)
    nuvem_fiscal_nfse_config: Mapped[bool] = mapped_column(Boolean, default=False)
    nuvem_fiscal_certificado: Mapped[bool] = mapped_column(Boolean, default=False)

    # Numeração RPS
    ultimo_rps: Mapped[int] = mapped_column(Integer, default=0)
    serie_rps: Mapped[str] = mapped_column(String(10), default="1")

    # Gesthub
    gesthub_client_id: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Observações
    observacoes: Mapped[str] = mapped_column(Text, default="")

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "cnpj": self.cnpj or "",
            "razaoSocial": self.razao_social or "",
            "nomeFantasia": self.nome_fantasia or "",
            "logradouro": self.logradouro or "",
            "numeroEndereco": self.numero_endereco or "",
            "complemento": self.complemento or "",
            "bairro": self.bairro or "",
            "cidade": self.cidade or "",
            "uf": self.uf or "",
            "cep": self.cep or "",
            "codigoMunicipio": self.codigo_municipio or "",
            "email": self.email or "",
            "telefone": self.telefone or "",
            "inscricaoMunicipal": self.inscricao_municipal or "",
            # Certificado
            "certificadoCarregado": self.certificado_pfx is not None,
            "certificadoValidade": self.certificado_validade.isoformat() if self.certificado_validade else None,
            "certificadoCnpj": self.certificado_cnpj or "",
            "certificadoStatus": self.certificado_status or "",
            # Tributação
            "itemListaServico": self.item_lista_servico or "",
            "codigoCnae": self.codigo_cnae or "",
            "codigoTributacao": self.codigo_tributacao or "",
            "aliquotaIssPadrao": float(self.aliquota_iss_padrao or 0),
            "optanteSimples": bool(self.optante_simples),
            "regimeEspecial": self.regime_especial or 0,
            "incentivoFiscal": bool(self.incentivo_fiscal),
            # Servicos
            "servicos": json.loads(self.servicos_json) if self.servicos_json else [],
            # Nuvem Fiscal status
            "nuvemFiscalCadastrada": bool(self.nuvem_fiscal_cadastrada),
            "nuvemFiscalNfseConfig": bool(self.nuvem_fiscal_nfse_config),
            "nuvemFiscalCertificado": bool(self.nuvem_fiscal_certificado),
            # RPS
            "ultimoRps": self.ultimo_rps or 0,
            "serieRps": self.serie_rps or "1",
            # Gesthub
            "gesthubClientId": self.gesthub_client_id,
            "observacoes": self.observacoes or "",
            "createdAt": self.created_at.isoformat() if self.created_at else None,
            "updatedAt": self.updated_at.isoformat() if self.updated_at else None,
        }
