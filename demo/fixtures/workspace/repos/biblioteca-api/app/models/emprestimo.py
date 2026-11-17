from datetime import date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, Integer
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class Emprestimo(Base):
    __tablename__ = "emprestimos"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    livro_id: Mapped[int] = mapped_column(ForeignKey("livros.id"))
    membro_id: Mapped[int] = mapped_column(Integer)
    retirado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    prazo: Mapped[date] = mapped_column(Date)
    devolvido_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
