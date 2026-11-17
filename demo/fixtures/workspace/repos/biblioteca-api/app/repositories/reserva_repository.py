from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.reserva import Reserva


class ReservaRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def criar(self, livro_id: int, membro_id: int, criada_em: datetime) -> Reserva:
        reserva = Reserva(livro_id=livro_id, membro_id=membro_id, criada_em=criada_em)
        self._session.add(reserva)
        self._session.commit()
        return reserva

    def listar_pendentes(self, livro_id: int) -> list[Reserva]:
        # A fila anda por ordem de pedido (ADR-0001). O id desempata pedidos do mesmo instante.
        consulta = (
            select(Reserva)
            .where(Reserva.livro_id == livro_id, Reserva.atendida_em.is_(None))
            .order_by(Reserva.criada_em, Reserva.id)
        )
        return list(self._session.scalars(consulta))
