"""Testes de caracterização do fluxo de empréstimo: pinam o comportamento de hoje."""

from datetime import datetime, timezone

import pytest

from app.models.emprestimo import Emprestimo
from app.services.emprestimo_service import EmprestimoService, SemExemplarDisponivel

AGORA = datetime(2026, 10, 5, 15, 0, tzinfo=timezone.utc)


class RepositorioFalso:
    def __init__(self, abertos: int) -> None:
        self.abertos = abertos
        self.criados: list[Emprestimo] = []

    def contar_abertos(self, livro_id: int) -> int:
        return self.abertos

    def criar(self, livro_id, membro_id, retirado_em, prazo):
        emprestimo = Emprestimo(livro_id=livro_id, membro_id=membro_id, retirado_em=retirado_em, prazo=prazo)
        self.criados.append(emprestimo)
        return emprestimo


class SessaoFalsa:
    def __init__(self, exemplares_total: int) -> None:
        self.exemplares_total = exemplares_total

    def get(self, _modelo, _id):
        return type("LivroFalso", (), {"exemplares_total": self.exemplares_total})()


def servico(exemplares_total: int, abertos: int) -> tuple[EmprestimoService, RepositorioFalso]:
    repo = RepositorioFalso(abertos)
    return EmprestimoService(SessaoFalsa(exemplares_total), repo, agora=lambda: AGORA), repo


def test_emprestar_com_exemplar_livre_grava_o_emprestimo_com_prazo():
    emprestimos, repo = servico(exemplares_total=2, abertos=1)
    emprestimo = emprestimos.emprestar(livro_id=1, membro_id=7)
    assert emprestimo in repo.criados
    assert emprestimo.prazo.isoformat() == "2026-10-19"


def test_emprestar_sem_exemplar_livre_recusa():
    emprestimos, _ = servico(exemplares_total=1, abertos=1)
    with pytest.raises(SemExemplarDisponivel):
        emprestimos.emprestar(livro_id=1, membro_id=7)
