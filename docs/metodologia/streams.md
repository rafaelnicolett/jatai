# As quatro etapas

Cada etapa (stream) responde a uma pergunta, tem agentes próprios, deixa
artefatos em lugar conhecido e termina num gate. Quem coordena todas é o
orquestrador, o `@jatai`: você fala com ele, e ele valida os pré-requisitos e
chama o agente certo. Veja os [agentes](agentes.md).

Os agentes citados aqui têm ficha no [catálogo](../agentes/README.md).

## Descoberta (`discovery`)

**Pergunta:** o que existe hoje?

A Descoberta funciona como um raio-x: mostra tudo e não mexe em nada. Nenhum
agente desta etapa modifica código, dependência ou configuração.

O `@assessor` coordena os sub-agentes e pede a sua confirmação depois de cada um.
Alguns rodam **uma vez por repositório**, outros **uma vez, olhando todos os
repositórios juntos**:

| Escopo | Agente | O que entrega |
|---|---|---|
| Por repositório | `@tech-mapper` | a stack real, com as versões do lock (não as declaradas) |
| | `@arch-discoverer` | o padrão arquitetural, com a confiança em % e diagramas C4 |
| | `@coding-archaeologist` | como o time escreve código, e a skill `coding-guidelines-<repo-id>` |
| | `@design-archaeologist` | o padrão visual, só nos repositórios com tela |
| | `@quality-auditor`, `@test-coverage-mapper` | hotspots, cobertura e o que falta de teste |
| | `@security-auditor` | o perfil de risco, com caminhos e nunca o conteúdo de um segredo |
| | `@debt-analyst` | a dívida técnica, priorizada |
| Entre repositórios | `@dependency-mapper` | como os repositórios se conectam |
| | `@domain-extractor` | os contextos de negócio, que podem atravessar repositórios |
| | `@business-archeologist` | o negócio implícito e a linha de base |
| Opcional | `@maturity-assessor` | a maturidade, nos frameworks que você escolher |

Tudo começa pelo inventário (`.github/artifacts/repos.yaml`): para cada
repositório, de onde ele vem, qual branch ou tag e **quanto investigar**
(`scan_profile`: `deep`, `shallow` ou `ignore`). Use `ignore` no que não vai
receber mudança: é o que evita que vinte repositórios custem vinte vezes mais.

O resultado fica em `.github/artifacts/assessment/`, com um relatório por
repositório e um `report.md` consolidado. Cada achado aparece com caminho e
contagem, nunca com um despejo de código.

## Planejamento (`planning`)

**Pergunta:** o que mudar, em que ordem e por quê?

Três agentes leem todos os artefatos da Descoberta antes de propor qualquer
coisa. Nenhum inventa stack ou arquitetura.

| Agente | O que entrega |
|---|---|
| `@modernization-planner` | o roadmap, em ondas incrementais, com o padrão de cada passo |
| `@risk-prioritizer` | a matriz de risco, valor e esforço, que inclui o risco de não fazer |
| `@adr-recorder` | as decisões como ADR, inclusive as retroativas, que nunca tinham sido escritas |

Duas regras valem aqui:

- o **alvo de arquitetura** (`arch_target`) nasce no Planejamento e mora na
  iniciativa, nunca no `repos.yaml`, que só guarda fato descoberto. Sem
  iniciativa aberta, o padrão do repositório é o que ele é hoje;
- **nenhuma modernização sem achado que a justifique** (`driven_by`). Refatorar
  sem achado é gosto pessoal.

O resultado fica em `.github/artifacts/planning/<iniciativa>/` e em `docs/adr/`.

## Execução (`execution`)

**Pergunta:** como mudar sem quebrar o que existe?

É a etapa com mais travas, porque é onde o código muda de verdade.

| Agente | O que faz |
|---|---|
| `@test-backfill-agent` | cria a rede de segurança: testes que fixam o comportamento de hoje |
| `@refactor-agent` | aplica refactors conhecidos, pequenos, com commits atômicos |
| `@migration-agent` | troca versão e biblioteca em etapas, sempre reversíveis |
| `@feature-adder` | escreve o cenário de teste primeiro e depois implementa |

A regra central: **escreva no padrão que a Descoberta encontrou**. Se o padrão é
ruim, o agente não o conserta de passagem: ele registra o achado e sugere uma
iniciativa de modernização. Também valem:

- sem cobertura mínima, ninguém refatora nem migra: o `@test-backfill-agent` vem
  antes ([testes de caracterização](praticas/testes-de-caracterizacao.md));
- refactor e feature nunca dividem o mesmo PR;
- quando a mudança toca vários repositórios, é **um PR por repositório**, e quem
  publica o contrato (uma API, um evento) vai antes de quem o consome;
- o resultado de cada tarefa entra no estado pelo CLI ou pelo servidor MCP, nunca
  com edição à mão ([estado em arquivos](estado-em-arquivos.md));
- o PR é revisado por uma pessoa, no gate D3.

O resultado fica nos PRs e em `.github/artifacts/execution/`, com um relatório por
agente e por tarefa.

## Operação (`operation`)

**Pergunta:** como manter o que está no ar?

A Operação não tem início nem fim dentro de uma iniciativa. Ela é uma capacidade
contínua do workspace, que continua depois de toda iniciativa terminar.

| Agente | O que faz |
|---|---|
| `@devops` | CI/CD e infraestrutura como código, e as ações de publicar e voltar |
| `@observability` | health checks, métricas, dashboards e alertas |
| `@incident` | a resposta ao que quebrou, e o post-mortem, mesmo nos pequenos |
| `@sustain` | patches de segurança e atualização de dependências, fora das iniciativas |

A regra é uma só: **toda mudança em produção exige PR mergeado e testes verdes**,
e é isso que o gate D3 confirma. Incidente gera post-mortem em
`.github/artifacts/incidents/`, sem apontar culpado.

## Para onde ir depois

- O que cada gate exige: [gates](gates.md).
- Onde cada resultado fica: [estado em arquivos](estado-em-arquivos.md).
