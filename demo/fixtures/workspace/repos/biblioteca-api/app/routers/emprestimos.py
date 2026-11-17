from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db import get_session
from app.repositories.emprestimo_repository import EmprestimoRepository
from app.schemas.emprestimo import EmprestimoIn, EmprestimoOut
from app.services.emprestimo_service import EmprestimoService, SemExemplarDisponivel

router = APIRouter(prefix="/emprestimos", tags=["emprestimos"])


def _servico(session: Session) -> EmprestimoService:
    return EmprestimoService(session, EmprestimoRepository(session))


@router.post("", response_model=EmprestimoOut, status_code=201)
def emprestar(dados: EmprestimoIn, session: Session = Depends(get_session)):
    try:
        return _servico(session).emprestar(dados.livro_id, dados.membro_id)
    except SemExemplarDisponivel:
        raise HTTPException(status_code=409, detail="Não há exemplar disponível.")


@router.post("/{emprestimo_id}/devolucao", response_model=EmprestimoOut)
def devolver(emprestimo_id: int, session: Session = Depends(get_session)):
    emprestimo = _servico(session).devolver(emprestimo_id)
    if emprestimo is None:
        raise HTTPException(status_code=404, detail="Empréstimo não encontrado.")
    return emprestimo
