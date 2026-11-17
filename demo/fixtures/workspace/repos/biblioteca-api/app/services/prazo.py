from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from app.config import DIAS_DE_EMPRESTIMO, FUSO_DA_BIBLIOTECA


def calcular_prazo(retirado_em: datetime, dias: int = DIAS_DE_EMPRESTIMO) -> date:
    """Prazo de devolução, contado no fuso da biblioteca.

    O horário de retirada chega em UTC. Contar os dias em UTC dava um dia a mais
    para quem retirava o livro à noite (hotfix-prazo-de-devolucao).
    """
    local = retirado_em.astimezone(ZoneInfo(FUSO_DA_BIBLIOTECA))
    return local.date() + timedelta(days=dias)
