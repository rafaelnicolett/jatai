from datetime import date, datetime, timezone

from app.services.prazo import calcular_prazo


def test_emprestimo_de_dia_vence_em_14_dias():
    retirado = datetime(2026, 10, 5, 15, 0, tzinfo=timezone.utc)  # 12h em São Paulo
    assert calcular_prazo(retirado) == date(2026, 10, 19)


def test_regressao_emprestimo_a_noite_nao_ganha_um_dia():
    # 22h30 em São Paulo ainda é dia 5, mas em UTC já é dia 6.
    retirado = datetime(2026, 10, 6, 1, 30, tzinfo=timezone.utc)
    assert calcular_prazo(retirado) == date(2026, 10, 19)


def test_prazo_aceita_outra_duracao():
    retirado = datetime(2026, 10, 5, 15, 0, tzinfo=timezone.utc)
    assert calcular_prazo(retirado, dias=7) == date(2026, 10, 12)
