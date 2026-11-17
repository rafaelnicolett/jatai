# Roadmap · Módulo de empréstimos: de camadas para hexagonal

> Workspace demo fictício: os números e os achados abaixo são inventados.

Iniciativa `mod-emprestimos-hexagonal` (`type: modernization`, escopo
`biblioteca-api`). Ela só começa a Execução depois que a feature
`feat-reserva-com-fila` terminar (`depends_on`), para o repositório não viver em
dois padrões ao mesmo tempo.

## Estado atual (do Discovery)

Camadas `router → service → repository`, 84% de confiança. `EmprestimoService`
mistura regra de negócio e acesso a dados (`debt-api-01`), e um router consulta o
banco direto (`debt-api-03`).

## Visão de futuro

Alvo **hexagonal**: as regras de empréstimo e reserva dependem de portas, e o
banco é um adaptador. O alvo vive nesta iniciativa, não no `repos.yaml`.

## Estratégia

Incremental e reversível, sem reescrita. Cada onda é publicável sozinha.

| Onda | Padrão | Paga dívida | Critério de sucesso |
|---|---|---|---|
| wave-1 · Rede de segurança | golden master e characterization tests | `debt-api-02` | respostas da API congeladas; testes verdes antes de qualquer mudança |
| wave-2 · Domínio atrás de portas | Branch by Abstraction | `debt-api-01` | `EmprestimoService` sem importar o banco |
| wave-3 · Adaptadores | Strangler | `debt-api-03` | repositórios SQL trocados um a um, com a suíte verde em cada passo |

## Pré-requisitos

- wave-2 exige a rede de segurança da wave-1 fechada.
- Nenhuma onda começa antes do fim de `feat-reserva-com-fila`.
