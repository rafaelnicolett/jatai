from datetime import date, datetime

from pydantic import BaseModel


class EmprestimoIn(BaseModel):
    livro_id: int
    membro_id: int


class EmprestimoOut(BaseModel):
    id: int
    livro_id: int
    membro_id: int
    retirado_em: datetime
    prazo: date
    devolvido_em: datetime | None = None
