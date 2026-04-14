"""Modelos do pipeline Fator R: faturamento mensal, folha mensal e histórico Fator R."""
from datetime import datetime, date
from sqlalchemy import String, Integer, Float, Date, DateTime, Boolean, Text, UniqueConstraint, Index
from sqlalchemy.orm import Mapped, mapped_column

from backend.database import Base


class FaturamentoMensal(Base):
    """Faturamento bruto mensal consolidado por cliente (CNPJ)."""
    __tablename__ = "faturamento_mensal"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    cliente_gesthub_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    cnpj: Mapped[str] = mapped_column(String(14), nullable=False)
    competencia: Mapped[date] = mapped_column(Date, nullable=False)  # primeiro dia do mês
    faturamento_bruto: Mapped[float] = mapped_column(Float, default=0.0)
    qtd_notas: Mapped[int] = mapped_column(Integer, default=0)
    fonte: Mapped[str] = mapped_column(String(30), default="manual")  # manual | portal_nacional | municipal | nuvem_fiscal
    status: Mapped[str] = mapped_column(String(20), default="ok")  # ok | pendente | erro
    observacoes: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("cnpj", "competencia", name="uq_fat_cnpj_comp"),
        Index("idx_fat_cliente", "cliente_gesthub_id"),
        Index("idx_fat_competencia", "competencia"),
    )

    def to_dict(self):
        return {
            "id": self.id,
            "clienteGesthubId": self.cliente_gesthub_id,
            "cnpj": self.cnpj,
            "competencia": self.competencia.isoformat() if self.competencia else None,
            "faturamentoBruto": float(self.faturamento_bruto or 0),
            "qtdNotas": self.qtd_notas or 0,
            "fonte": self.fonte or "manual",
            "status": self.status or "ok",
            "observacoes": self.observacoes or "",
            "createdAt": self.created_at.isoformat() if self.created_at else None,
            "updatedAt": self.updated_at.isoformat() if self.updated_at else None,
        }


class FolhaMensal(Base):
    """Folha de pagamento mensal por cliente (base Fator R)."""
    __tablename__ = "folha_mensal"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    cliente_gesthub_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    cnpj: Mapped[str] = mapped_column(String(14), nullable=False)
    competencia: Mapped[date] = mapped_column(Date, nullable=False)
    pro_labore: Mapped[float] = mapped_column(Float, default=0.0)
    salarios: Mapped[float] = mapped_column(Float, default=0.0)
    inss_patronal: Mapped[float] = mapped_column(Float, default=0.0)
    decimo_terceiro: Mapped[float] = mapped_column(Float, default=0.0)
    ferias: Mapped[float] = mapped_column(Float, default=0.0)
    fonte: Mapped[str] = mapped_column(String(30), default="manual")  # manual | esocial
    observacoes: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("cnpj", "competencia", name="uq_folha_cnpj_comp"),
        Index("idx_folha_cliente", "cliente_gesthub_id"),
        Index("idx_folha_competencia", "competencia"),
    )

    @property
    def total(self) -> float:
        return float((self.pro_labore or 0) + (self.salarios or 0) + (self.inss_patronal or 0)
                     + (self.decimo_terceiro or 0) + (self.ferias or 0))

    def to_dict(self):
        return {
            "id": self.id,
            "clienteGesthubId": self.cliente_gesthub_id,
            "cnpj": self.cnpj,
            "competencia": self.competencia.isoformat() if self.competencia else None,
            "proLabore": float(self.pro_labore or 0),
            "salarios": float(self.salarios or 0),
            "inssPatronal": float(self.inss_patronal or 0),
            "decimoTerceiro": float(self.decimo_terceiro or 0),
            "ferias": float(self.ferias or 0),
            "total": self.total,
            "fonte": self.fonte or "manual",
            "observacoes": self.observacoes or "",
            "createdAt": self.created_at.isoformat() if self.created_at else None,
            "updatedAt": self.updated_at.isoformat() if self.updated_at else None,
        }


class FatorRHistorico(Base):
    """Histórico de cálculo do Fator R (12 meses móveis)."""
    __tablename__ = "fator_r_historico"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    cliente_gesthub_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    cnpj: Mapped[str] = mapped_column(String(14), nullable=False)
    competencia: Mapped[date] = mapped_column(Date, nullable=False)  # mês referência
    receita_12m: Mapped[float] = mapped_column(Float, default=0.0)
    folha_12m: Mapped[float] = mapped_column(Float, default=0.0)
    fator_r: Mapped[float] = mapped_column(Float, default=0.0)  # 0.28 = 28%
    anexo_atual: Mapped[str] = mapped_column(String(5), default="")  # III | V
    anexo_ideal: Mapped[str] = mapped_column(String(5), default="")
    pro_labore_ideal: Mapped[float] = mapped_column(Float, default=0.0)
    economia_anual_estimada: Mapped[float] = mapped_column(Float, default=0.0)
    alerta_enviado: Mapped[bool] = mapped_column(Boolean, default=False)
    meses_com_dados: Mapped[int] = mapped_column(Integer, default=0)
    observacoes: Mapped[str] = mapped_column(Text, default="")
    calculado_em: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("cnpj", "competencia", name="uq_fr_cnpj_comp"),
        Index("idx_fr_cliente", "cliente_gesthub_id"),
    )

    def to_dict(self):
        return {
            "id": self.id,
            "clienteGesthubId": self.cliente_gesthub_id,
            "cnpj": self.cnpj,
            "competencia": self.competencia.isoformat() if self.competencia else None,
            "receita12m": float(self.receita_12m or 0),
            "folha12m": float(self.folha_12m or 0),
            "fatorR": float(self.fator_r or 0),
            "fatorRPct": round(float(self.fator_r or 0) * 100, 2),
            "anexoAtual": self.anexo_atual or "",
            "anexoIdeal": self.anexo_ideal or "",
            "proLaboreIdeal": float(self.pro_labore_ideal or 0),
            "economiaAnualEstimada": float(self.economia_anual_estimada or 0),
            "alertaEnviado": bool(self.alerta_enviado),
            "mesesComDados": self.meses_com_dados or 0,
            "observacoes": self.observacoes or "",
            "calculadoEm": self.calculado_em.isoformat() if self.calculado_em else None,
        }
