import { ListaEmprestimos } from "./features/emprestimos/ListaEmprestimos";
import { FilaDeReservas } from "./features/reservas/FilaDeReservas";

export function App() {
  return (
    <main>
      <h1>Biblioteca de Bairro</h1>
      <ListaEmprestimos membroId={7} />
      <FilaDeReservas livroId={1} />
    </main>
  );
}
