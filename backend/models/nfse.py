from datetime import datetime, date
from sqlalchemy import (
    String, Float, Integer, BigInteger, Boolean, Date, DateTime, Text,
    ForeignKey, Index, UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.database import Base


class Nfse(Base):
    """Nota Fiscal de Servico Eletronica."""
    __tablename__ = "nfses"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)

    # --- Identificacao ---
    numero: Mapped[str] = mapped_column(String(20), nullable=False)
    serie: Mapped[str] = mapped_column(String(10), default="1")
    codigo_verificacao: Mapped[str] = mapped_column(String(50), default="")

    # --- Prestador / Cliente Gesthub ---
    cliente_gesthub_id: Mapped[int | None] = mapped_column(Integer, nullable=True)  # ID do cliente no Gesthub
    prestador_cnpj: Mapped[str] = mapped_column(String(20), default="")
    prestador_inscricao_municipal: Mapped[str] = mapped_column(String(20), default="")
    prestador_razao_social: Mapped[str] = mapped_column(String(200), default="")

    # --- Tomador ---
    tomador_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("tomadores.id"), nullable=True)
    tomador_cpf_cnpj: Mapped[str] = mapped_column(String(20), default="")
    tomador_razao_social: Mapped[str] = mapped_column(String(200), default="")
    tomador_email: Mapped[str] = mapped_column(String(200), default="")

    # --- Servico ---
    descricao_servico: Mapped[str] = mapped_column(Text, default="")
    item_lista_servico: Mapped[str] = mapped_column(String(10), default="")
    codigo_tributacao_municipio: Mapped[str] = mapped_column(String(20), default="")
    codigo_cnae: Mapped[str] = mapped_column(String(10), default="")

    # --- Valores ---
    valor_servicos: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    valor_deducoes: Mapped[float] = mapped_column(Float, default=0.0)
    valor_liquido: Mapped[float] = mapped_column(Float, default=0.0)
    base_calculo: Mapped[float] = mapped_column(Float, default=0.0)
    aliquota_iss: Mapped[float] = mapped_column(Float, default=0.0)
    valor_iss: Mapped[float] = mapped_column(Float, default=0.0)
    valor_iss_retido: Mapped[float] = mapped_column(Float, default=0.0)
    iss_retido: Mapped[bool] = mapped_column(Boolean, default=False)
    valor_pis: Mapped[float] = mapped_column(Float, default=0.0)
    valor_cofins: Mapped[float] = mapped_column(Float, default=0.0)
    valor_inss: Mapped[float] = mapped_column(Float, default=0.0)
    valor_ir: Mapped[float] = mapped_column(Float, default=0.0)
    valor_csll: Mapped[float] = mapped_column(Float, default=0.0)
    outras_retencoes: Mapped[float] = mapped_column(Float, default=0.0)
    desconto_incondicionado: Mapped[float] = mapped_column(Float, default=0.0)
    desconto_condicionado: Mapped[float] = mapped_column(Float, default=0.0)

    # --- Datas ---
    data_emissao: Mapped[date | None] = mapped_column(Date, nullable=True)
    competencia: Mapped[date | None] = mapped_column(Date, nullable=True)

    # --- RPS ---
    rps_numero: Mapped[str] = mapped_column(String(20), default="")
    rps_serie: Mapped[str] = mapped_column(String(10), default="")
    rps_tipo: Mapped[int] = mapped_column(Integer, default=1)

    # --- Status e controle ---
    status: Mapped[str] = mapped_column(String(20), default="EMITIDA")
    natureza_operacao: Mapped[int] = mapped_column(Integer, default=1)
    regime_especial: Mapped[int] = mapped_column(Integer, default=0)
    optante_simples: Mapped[bool] = mapped_column(Boolean, default=False)
    incentivo_fiscal: Mapped[bool] = mapped_column(Boolean, default=False)

    # --- Municipio ---
    municipio_incidencia: Mapped[str] = mapped_column(String(10), default="")
    municipio_prestacao: Mapped[str] = mapped_column(String(10), default="")

    # --- ABRASF controle ---
    lote_id: Mapped[str] = mapped_column(String(50), default="")
    protocolo: Mapped[str] = mapped_column(String(50), default="")
    xml_envio: Mapped[str] = mapped_column(Text, default="")
    xml_retorno: Mapped[str] = mapped_column(Text, default="")
    mensagem_retorno: Mapped[str] = mapped_column(Text, default="")

    # --- NFS-e Nacional ---
    chave_acesso: Mapped[str | None] = mapped_column(String(50), unique=True, nullable=True)
    origem: Mapped[str] = mapped_column(String(20), default="MANUAL")  # MANUAL / IMPORTADA / CAPTURADA / EMITIDA
    xml_nfse: Mapped[str] = mapped_column(Text, default="")
    nsu: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    link_url: Mapped[str] = mapped_column(String(300), default="")

    observacoes: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # --- Relacionamentos ---
    tomador = relationship("Tomador", back_populates="nfses", lazy="joined")

    __table_args__ = (
        UniqueConstraint("numero", "serie", name="uq_nfse_numero_serie"),
        Index("idx_nfse_tomador_id", "tomador_id"),
        Index("idx_nfse_data_emissao", "data_emissao"),
        Index("idx_nfse_status", "status"),
        Index("idx_nfse_competencia", "competencia"),
    )

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "clienteGesthubId": self.cliente_gesthub_id,
            "numero": self.numero or "",
            "serie": self.serie or "1",
            "codigoVerificacao": self.codigo_verificacao or "",
            # Prestador
            "prestadorCnpj": self.prestador_cnpj or "",
            "prestadorInscricaoMunicipal": self.prestador_inscricao_municipal or "",
            "prestadorRazaoSocial": self.prestador_razao_social or "",
            # Tomador
            "tomadorId": self.tomador_id,
            "tomadorNome": (
                self.tomador.razao_social if self.tomador else self.tomador_razao_social or ""
            ),
            "tomadorCpfCnpj": self.tomador_cpf_cnpj or "",
            "tomadorRazaoSocial": self.tomador_razao_social or "",
            "tomadorEmail": self.tomador_email or "",
            # Servico
            "descricaoServico": self.descricao_servico or "",
            "itemListaServico": self.item_lista_servico or "",
            "codigoTributacaoMunicipio": self.codigo_tributacao_municipio or "",
            "codigoCnae": self.codigo_cnae or "",
            # Valores
            "valorServicos": float(self.valor_servicos or 0),
            "valorDeducoes": float(self.valor_deducoes or 0),
            "valorLiquido": float(self.valor_liquido or 0),
            "baseCalculo": float(self.base_calculo or 0),
            "aliquotaIss": float(self.aliquota_iss or 0),
            "valorIss": float(self.valor_iss or 0),
            "valorIssRetido": float(self.valor_iss_retido or 0),
            "issRetido": bool(self.iss_retido),
            "valorPis": float(self.valor_pis or 0),
            "valorCofins": float(self.valor_cofins or 0),
            "valorInss": float(self.valor_inss or 0),
            "valorIr": float(self.valor_ir or 0),
            "valorCsll": float(self.valor_csll or 0),
            "outrasRetencoes": float(self.outras_retencoes or 0),
            "descontoIncondicionado": float(self.desconto_incondicionado or 0),
            "descontoCondicionado": float(self.desconto_condicionado or 0),
            # Datas
            "dataEmissao": self.data_emissao.isoformat() if self.data_emissao else None,
            "competencia": self.competencia.isoformat() if self.competencia else None,
            # RPS
            "rpsNumero": self.rps_numero or "",
            "rpsSerie": self.rps_serie or "",
            "rpsTipo": self.rps_tipo or 1,
            # Status
            "status": self.status or "EMITIDA",
            "naturezaOperacao": self.natureza_operacao or 1,
            "regimeEspecial": self.regime_especial or 0,
            "optanteSimples": bool(self.optante_simples),
            "incentivoFiscal": bool(self.incentivo_fiscal),
            # Municipio
            "municipioIncidencia": self.municipio_incidencia or "",
            "municipioPrestacao": self.municipio_prestacao or "",
            # Controle ABRASF
            "loteId": self.lote_id or "",
            "protocolo": self.protocolo or "",
            "mensagemRetorno": self.mensagem_retorno or "",
            # NFS-e Nacional
            "chaveAcesso": self.chave_acesso or "",
            "linkUrl": self.link_url or "",
            "origem": self.origem or "MANUAL",
            "nsu": self.nsu,
            "observacoes": self.observacoes or "",
            "createdAt": self.created_at.isoformat() if self.created_at else None,
            "updatedAt": self.updated_at.isoformat() if self.updated_at else None,
        }
