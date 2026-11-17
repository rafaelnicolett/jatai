from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db import get_session
from app.repositories.emprestimo_repository import EmprestimoRepository
from app.repositories.reserva_repository import ReservaRepository
from app.schemas.reserva import ReservaIn, ReservaOut
from app.services.emprestimo_service import EmprestimoService
from app.services.reserva_service import HaExemplarDisponivel, ReservaService

router = APIRouter(prefix="/reservas", tags=["reservas"])


def _servico(session: Session) -> ReservaService:
    emprestimos = EmprestimoService(session, EmprestimoRepository(session))
    return ReservaService(ReservaRepository(session), emprestimos)


@router.post("", response_model=ReservaOut, status_code=201)
def reservar(dados: ReservaIn, session: Session = Depends(get_session)):
    servico = _servico(session)
    try:
        reserva = servico.reservar(dados.livro_id, dados.membro_id)
    except HaExemplarDisponivel:
        raise HTTPException(status_code=409, detail="Há exemplar disponível: faça o empréstimo.")
    posicao = servico.posicao(reserva.livro_id, reserva.id) or 1
    return ReservaOut(
        id=reserva.id,
        livro_id=reserva.livro_id,
        membro_id=reserva.membro_id,
        criada_em=reserva.criada_em,
        posicao=posicao,
    )
