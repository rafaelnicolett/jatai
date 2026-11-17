import { useState } from "react";

import { reservarLivro } from "../../api/reservas";

interface BotaoReservarProps {
  livroId: number;
  membroId: number;
}

export function BotaoReservar({ livroId, membroId }: BotaoReservarProps) {
  const [enviando, setEnviando] = useState(false);

  async function reservar() {
    setEnviando(true);
    try {
      await reservarLivro(livroId, membroId);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <button type="button" disabled={enviando} onClick={() => void reservar()}>
      Reservar
    </button>
  );
}
