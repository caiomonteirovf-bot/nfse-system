from datetime import datetime
from sqlalchemy import String, Boolean, Text, DateTime, Index
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.database import Base


class Tomador(Base):
    """Tomador de servico (cliente para NFS-e)."""
    __tablename__ = "tomadores"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)

    cpf_cnpj: Mapped[str] = mapped_column(String(20), unique=True, nullable=False)
    razao_social: Mapped[str] = mapped_column(String(200), nullable=False)
    nome_fantasia: Mapped[str] = mapped_column(String(200), default="")
    email: Mapped[str] = mapped_column(String(200), default="")
    telefone: Mapped[str] = mapped_column(String(20), default="")
    inscricao_municipal: Mapped[str] = mapped_column(String(20), default="")
    inscricao_estadual: Mapped[str] = mapped_column(String(20), default="")

    # Endereco
    logradouro: Mapped[str] = mapped_column(String(200), default="")
    numero_endereco: Mapped[str] = mapped_column(String(20), default="")
    complemento: Mapped[str] = mapped_column(String(100), default="")
    bairro: Mapped[str] = mapped_column(String(100), default="")
    cidade: Mapped[str] = mapped_column(String(100), default="")
    uf: Mapped[str] = mapped_column(String(2), default="")
    cep: Mapped[str] = mapped_column(String(10), default="")
    codigo_municipio: Mapped[str] = mapped_column(String(10), default="")

    ativo: Mapped[bool] = mapped_column(Boolean, default=True)
    observacoes: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relacionamentos
    nfses = relationship("Nfse", back_populates="tomador")

    __table_args__ = (
        Index("idx_tomador_cpf_cnpj", "cpf_cnpj"),
        Index("idx_tomador_razao_social", "razao_social"),
        Index("idx_tomador_ativo", "ativo"),
    )

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "cpfCnpj": self.cpf_cnpj or "",
            "razaoSocial": self.razao_social or "",
            "nomeFantasia": self.nome_fantasia or "",
            "email": self.email or "",
            "telefone": self.telefone or "",
            "inscricaoMunicipal": self.inscricao_municipal or "",
            "inscricaoEstadual": self.inscricao_estadual or "",
            "logradouro": self.logradouro or "",
            "numeroEndereco": self.numero_endereco or "",
            "complemento": self.complemento or "",
            "bairro": self.bairro or "",
            "cidade": self.cidade or "",
            "uf": self.uf or "",
            "cep": self.cep or "",
            "codigoMunicipio": self.codigo_municipio or "",
            "ativo": bool(self.ativo),
            "observacoes": self.observacoes or "",
            "createdAt": self.created_at.isoformat() if self.created_at else None,
            "updatedAt": self.updated_at.isoformat() if self.updated_at else None,
        }
