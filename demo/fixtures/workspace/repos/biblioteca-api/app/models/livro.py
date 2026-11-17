from sqlalchemy import Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class Livro(Base):
    __tablename__ = "livros"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    titulo: Mapped[str] = mapped_column(String(200))
    exemplares_total: Mapped[int] = mapped_column(Integer, default=1)
