from datetime import datetime

from pydantic import BaseModel


class ReservaIn(BaseModel):
    livro_id: int
    membro_id: int


class ReservaOut(BaseModel):
    id: int
    livro_id: int
    membro_id: int
    criada_em: datetime
    posicao: int
