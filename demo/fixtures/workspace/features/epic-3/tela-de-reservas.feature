# language: pt
@epic:epic-3
Funcionalidade: Tela de reservas no portal
  Como sócio da biblioteca
  Quero ver a fila de um livro e reservá-lo pelo portal
  Para não precisar ir ao balcão

  Cenário: O sócio vê a própria posição
    Dado um sócio com uma reserva na terceira posição
    Quando ele abre a fila do livro
    Então a tela mostra "3º da fila"

  Cenário: O próximo da fila é avisado na tela
    Dado um sócio com a reserva na primeira posição
    Quando ele abre a fila do livro
    Então a tela mostra "Você é o próximo"
