# language: pt
@epic:epic-1
Funcionalidade: Reservar um livro sem exemplar disponível
  Como sócio da biblioteca
  Quero reservar um livro cujos exemplares estão todos emprestados
  Para ser chamado quando ele voltar

  Cenário: Reservar um livro sem exemplar livre
    Dado um livro com todos os exemplares emprestados
    Quando o sócio reserva o livro
    Então a reserva é registrada e o sócio recebe a posição na fila

  Cenário: Reservar um livro que tem exemplar livre
    Dado um livro com um exemplar disponível
    Quando o sócio tenta reservar o livro
    Então o sistema avisa que ele pode fazer o empréstimo agora
