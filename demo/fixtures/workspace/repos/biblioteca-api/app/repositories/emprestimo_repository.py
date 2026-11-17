from datetime import date, datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.emprestimo import Emprestimo


class EmprestimoRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def criar(self, livro_id: int, membro_id: int, retirado_em: datetime, prazo: date) -> Emprestimo:
        emprestimo = Emprestimo(livro_id=livro_id, membro_id=membro_id, retirado_em=retirado_em, prazo=prazo)
        self._session.add(emprestimo)
        self._session.commit()
        return emprestimo

    def contar_abertos(self, livro_id: int) -> int:
        consulta = select(func.count()).where(Emprestimo.livro_id == livro_id, Emprestimo.devolvido_em.is_(None))
        return self._session.scalar(consulta) or 0

    def buscar(self, emprestimo_id: int) -> Emprestimo | None:
        return self._session.get(Emprestimo, emprestimo_id)

    def registrar_devolucao(self, emprestimo: Emprestimo, devolvido_em: datetime) -> Emprestimo:
        emprestimo.devolvido_em = devolvido_em
        self._session.commit()
        return emprestimo
