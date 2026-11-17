import { useEffect, useState } from "react";

import { listarFila, type Reserva } from "../../api/reservas";
import { formatarData } from "../../shared/formatarData";
import { BotaoReservar } from "./BotaoReservar";
import { rotuloDaPosicao } from "./posicaoNaFila";

interface FilaDeReservasProps {
  livroId: number;
}

export function FilaDeReservas({ livroId }: FilaDeReservasProps) {
  const [fila, setFila] = useState<Reserva[]>([]);

  useEffect(() => {
    void listarFila(livroId).then(setFila);
  }, [livroId]);

  return (
    <section>
      <h2>Fila de espera</h2>
      <ol>
        {fila.map((reserva) => (
          <li key={reserva.id}>
            {rotuloDaPosicao(reserva.posicao)} · pedido em {formatarData(reserva.criada_em)}
          </li>
        ))}
      </ol>
      <BotaoReservar livroId={livroId} membroId={7} />
    </section>
  );
}
