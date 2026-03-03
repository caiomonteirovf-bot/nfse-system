from datetime import datetime
from sqlalchemy import String, Float, Integer, Boolean, DateTime
from sqlalchemy.orm import Mapped, mapped_column

from backend.database import Base


class PrestadorConfig(Base):
    """Configuracao do prestador de servico (singleton - 1 registro)."""
    __tablename__ = "prestador_config"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)

    # Dados do prestador
    cnpj: Mapped[str] = mapped_column(String(20), default="")
    inscricao_municipal: Mapped[str] = mapped_column(String(20), default="")
    razao_social: Mapped[str] = mapped_column(String(200), default="")
    nome_fantasia: Mapped[str] = mapped_column(String(200), default="")

    # Endereco
    logradouro: Mapped[str] = mapped_column(String(200), default="")
    numero_endereco: Mapped[str] = mapped_column(String(20), default="")
    complemento: Mapped[str] = mapped_column(String(100), default="")
    bairro: Mapped[str] = mapped_column(String(100), default="")
    cidade: Mapped[str] = mapped_column(String(100), default="")
    uf: Mapped[str] = mapped_column(String(2), default="")
    cep: Mapped[str] = mapped_column(String(10), default="")
    codigo_municipio: Mapped[str] = mapped_column(String(10), default="")

    # ABRASF / Webservice
    webservice_url: Mapped[str] = mapped_column(String(500), default="")
    certificado_path: Mapped[str] = mapped_column(String(500), default="")
    certificado_senha: Mapped[str] = mapped_column(String(200), default="")
    ambiente: Mapped[str] = mapped_column(String(20), default="HOMOLOGACAO")

    # Servico padrao
    item_lista_servico: Mapped[str] = mapped_column(String(10), default="")
    codigo_cnae: Mapped[str] = mapped_column(String(10), default="")
    codigo_tributacao: Mapped[str] = mapped_column(String(20), default="")
    aliquota_iss_padrao: Mapped[float] = mapped_column(Float, default=0.0)
    natureza_operacao: Mapped[int] = mapped_column(Integer, default=1)
    regime_especial: Mapped[int] = mapped_column(Integer, default=0)
    optante_simples: Mapped[bool] = mapped_column(Boolean, default=False)
    incentivo_fiscal: Mapped[bool] = mapped_column(Boolean, default=False)

    # Numeracao RPS
    ultimo_rps: Mapped[int] = mapped_column(Integer, default=0)
    serie_rps: Mapped[str] = mapped_column(String(10), default="1")

    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "cnpj": self.cnpj or "",
            "inscricaoMunicipal": self.inscricao_municipal or "",
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
            "webserviceUrl": self.webservice_url or "",
            "certificadoPath": self.certificado_path or "",
            "ambiente": self.ambiente or "HOMOLOGACAO",
            "itemListaServico": self.item_lista_servico or "",
            "codigoCnae": self.codigo_cnae or "",
            "codigoTributacao": self.codigo_tributacao or "",
            "aliquotaIssPadrao": float(self.aliquota_iss_padrao or 0),
            "naturezaOperacao": self.natureza_operacao or 1,
            "regimeEspecial": self.regime_especial or 0,
            "optanteSimples": bool(self.optante_simples),
            "incentivoFiscal": bool(self.incentivo_fiscal),
            "ultimoRps": self.ultimo_rps or 0,
            "serieRps": self.serie_rps or "1",
            "updatedAt": self.updated_at.isoformat() if self.updated_at else None,
        }
