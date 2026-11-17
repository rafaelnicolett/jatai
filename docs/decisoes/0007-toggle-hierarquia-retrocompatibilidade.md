# ADR-0007: Rollout por uma setting, `jatai.deliveryHierarchy`, com retrocompatibilidade permanente de leitura para Wave e Item

## Status

proposta.

## Contexto

A Jataí não é um código de uso exclusivo de um workspace: é um produto empacotado
(`.vsix`), instalado em outros workspaces. Qualquer mudança de schema em
`initiatives.yaml` ou em `sprint-backlog.yaml` que não preserve a compatibilidade de
leitura quebra workspaces que o time do projeto não controla e pode nem saber que
existem.

A evidência está no próprio contrato do backlog: os quatro formatos reais de
`sprint-backlog.yaml` "observados em produção" vieram de instalações externas. E o
caso mínimo que não pode regredir é o das iniciativas já `done`: nenhuma pode perder
legibilidade no Cockpit por causa desta mudança.

## Decisão

1. **Uma setting de workspace**, `jatai.deliveryHierarchy`, com os valores
   `"legacy"` e `"epic-feature-backlog-task"` e **default `"legacy"`**, inclusive para
   workspaces que atualizarem a extensão sem nunca terem ouvido falar disto. Nenhum
   comportamento muda até alguém ligar explicitamente.
2. **Os campos novos são estritamente aditivos:** `epic_status`, `TaskStatusEntry` e
   o formato canônico de Backlog passam a existir ao lado de `wave_status`,
   `WaveItemStatusEntry` e dos quatro formatos de `sprint-backlog.yaml`, nunca no lugar
   deles.
3. **A leitura dos formatos antigos nunca é removida,** qualquer que seja o estado da
   setting. Só a escrita ganha uma forma preferencial quando ela está ligada.
4. **Dado histórico nunca é reescrito.** Uma iniciativa com `status: "done"` mantém o
   `wave_status` exatamente como está, para sempre. A setting afeta apenas o formato de
   escrita de iniciativas **novas** e a renderização do Cockpit quando ligada.
5. **A setting é por workspace, não global à extensão:** dois workspaces na mesma
   máquina podem estar em estágios diferentes de adoção, sem interferência.

É a mesma lógica de rollback de outras mudanças de risco: uma chave para voltar, e
nada migrado.

## Consequências

**Positivas:**
- Adoção de risco zero para instalações existentes: atualizar a extensão não muda nada
  visível até um workspace optar por entrar.
- As iniciativas `done`, neste e em qualquer outro workspace, continuam legíveis
  exatamente como estão, permanentemente.
- Reversível a qualquer momento: desligar a setting volta ao comportamento de antes,
  sem perda de dado (nada foi migrado, só passou a existir em paralelo).
- Consistente com o princípio de que o arquivo de estado nunca é reserializado: os
  campos antigos não são tocados, só deixam de ser o alvo de escrita padrão quando a
  setting está ligada.

**Negativas:**
- O código carrega dois schemas em paralelo por tempo indefinido. Nenhuma data de
  "Contract" (remoção do formato antigo) é decidida aqui: fica para uma ADR futura e
  explícita, só depois de uma adoção real observada.
- A adoção não é automática: um workspace só ganha a hierarquia nova se alguém ligar a
  setting conscientemente. É mais lento que um rollout forçado, e é a troca deliberada
  de velocidade de adoção por segurança.
- Testar só com dado sintético não basta para validar a retrocompatibilidade dos
  quatro formatos de `sprint-backlog.yaml`: o teste precisa de exemplos reais dos
  quatro, e não só dos que o parser já tem em teste unitário.

Veja [iniciativas](../metodologia/iniciativas.md).
