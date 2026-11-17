# language: pt
# G2 (H-GAP-02), F3.3 da Missão Open Source. Contrato novo e aditivo: ADR-0024.
# Step definitions: tests/features/cli-leitura-e-gates.steps.test.ts (o CLI de estado roda como subprocesso).
@bc:estado @persona:agente @release:v1 @risk:medium
Funcionalidade: Ler o estado e registrar os gates pelo CLI de estado
  Como agente da metodologia, ou como humano num terminal
  Quero ler iniciativas, fases e gates e registrar a aprovação humana de D1, D2 e D3
  Para não editar o YAML à mão nem adivinhar o estado antes de agir

  # Desde as decisões do titular na ADR-0024, a aprovação exige quem aprova (aqui, sempre --by, porque o
  # subprocesso não tem git configurado) e o trabalho anterior fechado. As regras novas têm cenários
  # próprios em gates-aprovador-e-fechamento.feature.
  Contexto:
    Dado um workspace com a iniciativa "mod-x" ativa, com o roadmap e a matriz de risco aprovados, e a onda "wave-1" com o item "item-1" concluído
    E o repositório "api" com as fases do Foundation concluídas e o Gate D1 pendente

  @happy-path
  Cenário: Ler todas as iniciativas
    Quando o agente lê as iniciativas
    Então a resposta é um sucesso de uma linha com a iniciativa ativa "mod-x"
    E o arquivo de iniciativas não muda

  @happy-path
  Cenário: Ler uma iniciativa pelo id
    Quando o agente lê a iniciativa "mod-x"
    Então a resposta traz a iniciativa "mod-x" com a onda "wave-1"

  @validation
  Cenário: Ler uma iniciativa que não existe
    Quando o agente lê a iniciativa "nao-existe"
    Então a resposta é um erro de uso "INITIATIVE_NOT_FOUND"

  @happy-path
  Cenário: Ler uma fase do delivery-state da iniciativa
    Dado que a fase "business" da iniciativa "mod-x" está concluída
    Quando o agente lê a fase "business" do delivery-state da iniciativa "mod-x"
    Então a resposta traz a fase "business" com o status "done"

  @validation
  Cenário: Ler o delivery-state sem dizer o escopo
    Quando o agente lê o delivery-state sem escopo
    Então a resposta é um erro de uso "MISSING_SCOPE"

  @happy-path
  Cenário: Ler o Gate D2 de uma iniciativa que ainda não foi aprovada
    Quando o agente lê o gate "d2" da iniciativa "mod-x"
    Então a resposta diz que o gate "d2" ainda não foi registrado

  @happy-path
  Esquema do Cenário: Registrar a aprovação humana de D2 e D3
    Quando o humano aprova o gate "<gate>" da iniciativa "mod-x" com a nota "<nota>"
    Então o gate "<gate>" da iniciativa "mod-x" fica aprovado com a data da aprovação humana
    E a leitura do gate "<gate>" devolve a mesma aprovação

    Exemplos:
      | gate | nota                       |
      | d2   | roadmap e ADRs revisados   |
      | d3   | PRs mergeados, testes ok   |

  @happy-path
  Cenário: Registrar a aprovação humana do Gate D1 de um repositório
    Quando o humano aprova o gate "d1" do repositório "api"
    Então o Gate D1 do repositório "api" fica aprovado com a data da aprovação humana

  @validation
  Cenário: Aprovar um gate desconhecido
    Quando o humano aprova o gate "d4" da iniciativa "mod-x" com a nota "x"
    Então a resposta é um erro de uso "INVALID_ENUM"

  @validation
  Cenário: Aprovar o D1 sem dizer o repositório
    Quando o humano aprova o gate "d1" sem dizer o repositório
    Então a resposta é um erro de uso "MISSING_FLAG"

  @validation
  Cenário: Aprovar o D3 de uma iniciativa que não existe
    Quando o humano aprova o gate "d3" da iniciativa "nao-existe" com a nota "x"
    Então a resposta é um erro de uso "INITIATIVE_NOT_FOUND"
