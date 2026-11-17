# language: pt
# F7.2 da Missão Open Source: o catálogo público de agentes e skills, gerado do frontmatter do kit
# por `npm run docs:agents` (scripts/gen-agent-catalog.mjs) e conferido por `--check` no CI.
# Step definitions: tests/features/catalogo-de-agentes.steps.test.ts.
@bc:docs @persona:quem-contribui @release:v1 @risk:low
Funcionalidade: Catálogo de agentes e skills gerado do kit
  Como quem usa ou contribui com a Jataí
  Quero um catálogo público dos agentes e das skills, sempre igual ao kit
  Para saber o que cada agente faz, quando entra e o que produz, sem ler arquivo por arquivo

  Contexto:
    Dado um kit mínimo com agentes de Descoberta, Execução e Operação, um guardião, um orquestrador e três skills

  @happy-path
  Cenário: O catálogo traz um índice por stream e uma ficha por agente
    Quando o catálogo é gerado
    Então o índice lista os agentes agrupados por stream
    E cada agente do kit tem uma ficha

  @happy-path
  Cenário: A ficha diz o que o agente faz, quando entra, as skills, o que recebe e o que produz
    Quando o catálogo é gerado
    Então a ficha do agente "batedor" tem a descrição, de quem ele recebe e a quem entrega
    E a ficha lista as skills com link e o que o agente recebe e produz

  @happy-path
  Cenário: O guardião entra nos gates e não executa fase
    Quando o catálogo é gerado
    Então a ficha do agente "porteiro" diz em quais gates ele entra

  @happy-path
  Cenário: A skill de cada repositório é explicada, não procurada no kit
    Quando o catálogo é gerado
    Então a ficha do agente "batedor" explica que a skill "convencoes-<repo-id>" é gerada por repositório

  @happy-path
  Cenário: O orquestrador e os apelidos dele aparecem com o nome da marca
    Quando o catálogo é gerado
    Então existe a ficha do orquestrador com o nome da marca
    E o apelido "maestro" nas fichas aponta para o orquestrador

  @happy-path
  Cenário: O agente que muda de uma edição para outra tem a ficha das duas
    Quando o catálogo é gerado
    Então a ficha do agente "operador" traz a descrição de cada edição

  @happy-path
  Cenário: O catálogo de skills agrupa por família e diz quem usa cada uma
    Quando o catálogo é gerado
    Então o catálogo de skills agrupa "arch-" e "maturity-" em famílias
    E cada skill diz que agentes a usam

  @happy-path
  Cenário: Gerar duas vezes dá os mesmos arquivos
    Quando o catálogo é gerado duas vezes
    Então os arquivos são idênticos, sem horário nem caminho da máquina

  @happy-path
  Cenário: A conferência passa quando o catálogo está em dia
    Dado que o catálogo foi gravado
    Quando o catálogo é conferido
    Então a conferência passa

  @validation
  Cenário: A conferência reprova quando o kit mudou e o catálogo não
    Dado que o catálogo foi gravado
    E que a descrição de um agente mudou no kit
    Quando o catálogo é conferido
    Então a conferência reprova e aponta a ficha desatualizada
    E diz para rodar o comando que gera

  @validation
  Cenário: A conferência reprova arquivo editado à mão, que falta ou que sobra
    Dado que o catálogo foi gravado
    E que uma ficha foi editada à mão, outra foi apagada e uma sobrou sem agente
    Quando o catálogo é conferido
    Então a conferência reprova e aponta cada um dos três arquivos

  @error
  Cenário: Frontmatter ilegível para a geração e diz qual arquivo
    Dado que um agente do kit tem o frontmatter com YAML inválido
    Quando o catálogo é gerado
    Então a geração falha e cita o arquivo do agente

  @happy-path
  Cenário: O catálogo do kit real está em dia
    Quando o catálogo do kit real é conferido
    Então a conferência passa
