from collections.abc import Callable
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models.emprestimo import Emprestimo
from app.models.livro import Livro
from app.repositories.emprestimo_repository import EmprestimoRepository
from app.services.prazo import calcular_prazo


class SemExemplarDisponivel(Exception):
    pass


class EmprestimoService:
    def __init__(
        self,
        session: Session,
        repo: EmprestimoRepository,
        agora: Callable[[], datetime] = lambda: datetime.now(timezone.utc),
    ) -> None:
        self._session = session
        self._repo = repo
        self._agora = agora

    def exemplares_disponiveis(self, livro_id: int) -> int:
        livro = self._session.get(Livro, livro_id)
        if livro is None:
            return 0
        return livro.exemplares_total - self._repo.contar_abertos(livro_id)

    def emprestar(self, livro_id: int, membro_id: int) -> Emprestimo:
        if self.exemplares_disponiveis(livro_id) <= 0:
            raise SemExemplarDisponivel(livro_id)
        retirado_em = self._agora()
        return self._repo.criar(livro_id, membro_id, retirado_em, calcular_prazo(retirado_em))

    def devolver(self, emprestimo_id: int) -> Emprestimo | None:
        emprestimo = self._repo.buscar(emprestimo_id)
        if emprestimo is None or emprestimo.devolvido_em is not None:
            return emprestimo
        return self._repo.registrar_devolucao(emprestimo, self._agora())
