from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_session
from app.models.livro import Livro

router = APIRouter(prefix="/livros", tags=["livros"])


@router.get("")
def listar_livros(session: Session = Depends(get_session)) -> list[dict[str, object]]:
    livros = session.scalars(select(Livro).order_by(Livro.titulo))
    return [{"id": livro.id, "titulo": livro.titulo} for livro in livros]
