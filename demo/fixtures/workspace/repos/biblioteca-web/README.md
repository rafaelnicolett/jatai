# biblioteca-web

Portal da **Biblioteca de Bairro**, um projeto fictício usado como workspace de
demonstração. Mostra os empréstimos e a fila de reservas de cada livro. Nada
aqui é de uma empresa ou de uma pessoa de verdade.

## Rodar

```sh
npm install
npm run dev
npm test
```

## Estrutura

```text
src/api/                 chamadas à biblioteca-api
src/features/emprestimos lista de empréstimos
src/features/reservas    fila de espera e botão Reservar
src/shared/              funções usadas por mais de uma tela
```

Cada pasta de `features/` é independente das outras.
