from datetime import datetime, timezone

import pytest

from app.models.reserva import Reserva
from app.services.reserva_service import HaExemplarDisponivel, ReservaService


class EmprestimosFalso:
    def __init__(self, disponiveis: int) -> None:
        self.disponiveis = disponiveis

    def exemplares_disponiveis(self, livro_id: int) -> int:
        return self.disponiveis


class RepositorioFalso:
    def __init__(self) -> None:
        self.reservas: list[Reserva] = []

    def criar(self, livro_id, membro_id, criada_em):
        reserva = Reserva(id=len(self.reservas) + 1, livro_id=livro_id, membro_id=membro_id, criada_em=criada_em)
        self.reservas.append(reserva)
        return reserva

    def listar_pendentes(self, livro_id):
        return sorted(self.reservas, key=lambda r: (r.criada_em, r.id))


def servico(disponiveis: int) -> ReservaService:
    relogio = iter(datetime(2026, 10, 5, 15, minuto, tzinfo=timezone.utc) for minuto in range(60))
    return ReservaService(RepositorioFalso(), EmprestimosFalso(disponiveis), agora=lambda: next(relogio))


def test_reservar_com_exemplar_livre_manda_fazer_o_emprestimo():
    with pytest.raises(HaExemplarDisponivel):
        servico(disponiveis=1).reservar(livro_id=1, membro_id=7)


def test_a_fila_anda_por_ordem_de_pedido():
    reservas = servico(disponiveis=0)
    primeira = reservas.reservar(livro_id=1, membro_id=7)
    segunda = reservas.reservar(livro_id=1, membro_id=8)
    assert [r.id for r in reservas.fila(livro_id=1)] == [primeira.id, segunda.id]
    assert reservas.posicao(livro_id=1, reserva_id=segunda.id) == 2
