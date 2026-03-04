from datetime import datetime
from sqlalchemy import String, Integer, BigInteger, DateTime, Text
from sqlalchemy.orm import Mapped, mapped_column

from backend.database import Base


class Captura(Base):
    """Registro de cada execucao de captura automatica de NFS-e."""
    __tablename__ = "capturas"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    ultimo_nsu: Mapped[int] = mapped_column(BigInteger, default=0)
    total_capturadas: Mapped[int] = mapped_column(Integer, default=0)
    total_novas: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(20), default="EM_ANDAMENTO")  # SUCESSO / ERRO / EM_ANDAMENTO
    mensagem: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "ultimoNsu": self.ultimo_nsu or 0,
            "totalCapturadas": self.total_capturadas or 0,
            "totalNovas": self.total_novas or 0,
            "status": self.status or "EM_ANDAMENTO",
            "mensagem": self.mensagem or "",
            "createdAt": self.created_at.isoformat() if self.created_at else None,
        }
