from collections.abc import Callable
from datetime import datetime, timezone

from app.models.reserva import Reserva
from app.repositories.reserva_repository import ReservaRepository
from app.services.emprestimo_service import EmprestimoService


class HaExemplarDisponivel(Exception):
    """Com exemplar livre não há fila: o sócio faz o empréstimo."""


class ReservaService:
    def __init__(
        self,
        repo: ReservaRepository,
        emprestimos: EmprestimoService,
        agora: Callable[[], datetime] = lambda: datetime.now(timezone.utc),
    ) -> None:
        self._repo = repo
        self._emprestimos = emprestimos
        self._agora = agora

    def reservar(self, livro_id: int, membro_id: int) -> Reserva:
        if self._emprestimos.exemplares_disponiveis(livro_id) > 0:
            raise HaExemplarDisponivel(livro_id)
        return self._repo.criar(livro_id, membro_id, self._agora())

    def fila(self, livro_id: int) -> list[Reserva]:
        return self._repo.listar_pendentes(livro_id)

    def posicao(self, livro_id: int, reserva_id: int) -> int | None:
        for indice, reserva in enumerate(self.fila(livro_id), start=1):
            if reserva.id == reserva_id:
                return indice
        return None
