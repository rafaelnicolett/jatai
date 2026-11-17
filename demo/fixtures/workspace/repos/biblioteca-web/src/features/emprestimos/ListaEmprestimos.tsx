import { useEffect, useState } from "react";

import { listarEmprestimos, type Emprestimo } from "../../api/emprestimos";
import { formatarData } from "../../shared/formatarData";

interface ListaEmprestimosProps {
  membroId: number;
}

export function ListaEmprestimos({ membroId }: ListaEmprestimosProps) {
  const [emprestimos, setEmprestimos] = useState<Emprestimo[]>([]);

  useEffect(() => {
    void listarEmprestimos(membroId).then(setEmprestimos);
  }, [membroId]);

  return (
    <section>
      <h2>Seus empréstimos</h2>
      <ul>
        {emprestimos.map((e) => (
          <li key={e.id}>
            Livro {e.livro_id}: devolver até {formatarData(e.prazo)}
          </li>
        ))}
      </ul>
    </section>
  );
}
