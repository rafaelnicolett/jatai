# language: pt
@epic:epic-2
Funcionalidade: Fila de espera por ordem de pedido
  Como sócio da biblioteca
  Quero ver minha posição na fila de um livro
  Para saber quando vou poder pegá-lo

  Cenário: A fila anda por ordem de pedido
    Dado dois sócios que reservaram o mesmo livro, um depois do outro
    Quando o livro é devolvido
    Então o primeiro a reservar é o próximo da fila

  Cenário: Dois pedidos no mesmo instante são desempatados pela ordem de gravação
    Dado dois sócios que reservaram o mesmo livro no mesmo instante
    Quando a fila é consultada
    Então a reserva gravada primeiro aparece primeiro
