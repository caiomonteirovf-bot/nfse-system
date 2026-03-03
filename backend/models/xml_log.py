from datetime import datetime
from sqlalchemy import String, Integer, Boolean, Text, DateTime, ForeignKey, Index
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.database import Base


class XmlLog(Base):
    """Historico de XML enviados/recebidos via ABRASF."""
    __tablename__ = "xml_logs"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)

    nfse_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("nfses.id"), nullable=True)
    tipo_operacao: Mapped[str] = mapped_column(String(30), nullable=False)
    xml_envio: Mapped[str] = mapped_column(Text, default="")
    xml_retorno: Mapped[str] = mapped_column(Text, default="")
    http_status: Mapped[int | None] = mapped_column(Integer, nullable=True)
    protocolo: Mapped[str] = mapped_column(String(50), default="")
    sucesso: Mapped[bool] = mapped_column(Boolean, default=False)
    mensagem: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    # Relacionamentos
    nfse = relationship("Nfse")

    __table_args__ = (
        Index("idx_xml_log_nfse_id", "nfse_id"),
        Index("idx_xml_log_tipo", "tipo_operacao"),
        Index("idx_xml_log_created_at", "created_at"),
    )

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "nfseId": self.nfse_id,
            "nfseNumero": self.nfse.numero if self.nfse else "",
            "tipoOperacao": self.tipo_operacao or "",
            "xmlEnvio": self.xml_envio or "",
            "xmlRetorno": self.xml_retorno or "",
            "httpStatus": self.http_status,
            "protocolo": self.protocolo or "",
            "sucesso": bool(self.sucesso),
            "mensagem": self.mensagem or "",
            "createdAt": self.created_at.isoformat() if self.created_at else None,
        }

    def to_dict_summary(self) -> dict:
        """Resumo sem o XML completo (para listagem)."""
        return {
            "id": self.id,
            "nfseId": self.nfse_id,
            "nfseNumero": self.nfse.numero if self.nfse else "",
            "tipoOperacao": self.tipo_operacao or "",
            "httpStatus": self.http_status,
            "protocolo": self.protocolo or "",
            "sucesso": bool(self.sucesso),
            "mensagem": self.mensagem or "",
            "createdAt": self.created_at.isoformat() if self.created_at else None,
        }
