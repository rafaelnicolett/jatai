from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class Reserva(Base):
    __tablename__ = "reservas"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    livro_id: Mapped[int] = mapped_column(ForeignKey("livros.id"))
    membro_id: Mapped[int] = mapped_column(Integer)
    criada_em: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    atendida_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
