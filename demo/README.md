# Workspace demo da Jataí

Um projeto de exemplo, **inteiro inventado**, para três usos: os prints e GIFs do
README, os testes de ponta a ponta e o modo demo do mapa. Nada aqui vem de um
cliente, de uma empresa ou de uma pessoa de verdade. A única pessoa que aparece é
**Pessoa Exemplo**.

O produto fictício é a **Biblioteca de Bairro**, um sistema de empréstimos e
reservas de livros, com dois repositórios pequenos:

| Repositório | Stack | O que tem |
|---|---|---|
| `biblioteca-api` | Python e FastAPI, em camadas | empréstimos, prazo de devolução e reservas |
| `biblioteca-web` | React, Vite e TypeScript, por feature | lista de empréstimos e fila de reservas |

## Gerar

```bash
npm run demo
```

O comando cria `.demo/` (fora do git e fora do `.vsix`). Ele faz duas coisas:

1. roda o **instalador real do kit** (`KitInstaller`, brownfield, host Claude
   Code), que instala agentes, skills, instruções, hooks, o CLI de estado e o
   servidor MCP. Por isso o demo nunca diverge do que a Jataí instala;
2. sobrepõe as **fixtures** de [`fixtures/workspace/`](fixtures/workspace/): os
   dois repositórios, o estado da metodologia em `.github/artifacts/`, uma ADR e
   os cenários BDD. A pasta espelha a raiz do workspace gerado.

Rodar de novo apaga e refaz `.demo/`. O comando só esvazia uma pasta vazia ou um
demo gerado antes. Qualquer outra pasta é recusada, sem apagar nada:

```bash
npm run demo -- --out ../outra-pasta
```

Uma fixture tem nome diferente do destino: `relatorio-do-discovery.md` vira
`.github/artifacts/assessment/report.md`, o caminho que a Jataí lê para saber que
a Descoberta terminou.

## Abrir no VS Code

```bash
code .demo
```

Use uma janela com a Jataí instalada, ou a de desenvolvimento
(`code --extensionDevelopmentPath="$PWD" .demo`). A extensão só roda em workspace
confiável: confie na pasta quando o VS Code perguntar. O Cockpit abre sobre o
estado do demo, e o servidor MCP do kit já vem configurado em `.mcp.json`.

## Usar nos prints e GIFs

- **Regenere antes de cada captura** (`npm run demo`): o estado volta ao ponto
  combinado, e os prints de uma rodada saem iguais aos da outra.
- O histórico de atividade tem **data fixa** (2026-10-05), então o Cockpit mostra
  o mesmo texto em qualquer dia.
- Para ver o mapa se mexendo, deixe o Cockpit e o mapa visíveis e rode
  `npm run demo:play` (veja abaixo).
- Capture nos três temas do VS Code (claro, escuro e alto contraste).

## O que o demo contém

O estado conta o mesmo dia de trabalho, de manhã à tarde de **2026-10-05**
(horários em UTC).

| Cena | Onde está | O que mostra |
|---|---|---|
| Descoberta concluída | `assessment/`, `repos.yaml`, `foundation-state.yaml` | os dois repositórios com todas as fases concluídas, e o Gate D1 aprovado por Pessoa Exemplo em cada um |
| Feature em Execução (a ativa) | `feat-reserva-com-fila` | reserva de livros com fila de espera: 3 épicos, 10 tarefas, Gate D2 aprovado e Gate D3 pendente |
| Tarefas em todos os estados | `epic_status` da feature | `done`, `in-progress`, `pending`, `blocked`, `failed`, `cancelled` e `skipped`, os três últimos com motivo (ADR-0022) |
| Aprovação que espera você | `epic-1/task-1.3` | tarefa concluída que exige aprovação humana e ainda não foi aprovada: a guarda acesa |
| Bloqueio | `epic-2/task-2.3` | bloqueada até o contrato da API ser aprovado |
| Falha | `epic-3/task-3.1` | a tela da fila falhou em 2 testes de componente |
| Cancelamento | `epic-3/task-3.3` | escopo cortado por uma pessoa, com o motivo |
| Hotfix concluído | `hotfix-prazo-de-devolucao` | do bug ao teste de regressão, ao Gate D3 e à publicação (a Operação) |
| Modernização em Planejamento | `mod-emprestimos-hexagonal` | roadmap aprovado, matriz de risco pendente, Gate D2 pendente; espera o fim da feature (`depends_on`) |
| Decisão pedida e tomada | `runs/` | a ordem da fila (ADR-0001) e o corte do aviso por mensagem |
| Gates | `runs/` e os YAML | D1 (um por repositório), D2 e D3, sempre decididos por uma pessoa |

Cada iniciativa tem o seu `delivery-state.yaml`. O da feature ativa mostra a falha
(`frontend`) e o bloqueio (`reviewer`) com motivo.

## O histórico de atividade

Os eventos ficam em `.github/artifacts/runs/`, um arquivo por iniciativa (o nome do
escritor do produto) e `workspace.jsonl` para o que não é de uma iniciativa, como a
Descoberta e o Gate D1. O formato é o do contrato `agent-activity`
([ADR-0020](../docs/decisoes/0020-mapa-isometrico-tempo-real-eventos-de-agente.md)):
uma linha JSON por evento, só metadados, `message` com até 140 caracteres e
`metadata` só com `reason`, `task`, `path` e `count`.

Algumas convenções do demo:

- agentes registram início, progresso e fim pelo servidor MCP (`harness: mcp`);
  a gravação de artefato vem do hook do Claude Code (`harness: claude-code`);
  decisões e aprovações vêm do CLI de estado (`harness: cli`);
- `phase_id` é a fase do Foundation na Descoberta (`tech-stack`, `arch`, `domain`),
  o nome do stream ou do agente nas demais (`planning`, `feature`, `devops`), e
  `gate-d1`, `gate-d2` e `gate-d3` nas aprovações de gate;
- uma falha é um evento `blocked` cuja `message` começa com `falhou:`;
- para acrescentar uma cena, acrescente linhas e mantenha os horários em ordem.
  `tests/features/workspace-demo.steps.test.ts` confere cada linha contra o contrato.

## Ver o mapa se mexendo: `npm run demo:play`

```bash
npm run demo:play                           # com as pausas do roteiro
npm run demo:play -- --rapido               # sem pausas
npm run demo:play -- --velocidade 2         # pausas na metade do tempo
npm run demo:play -- --deixar-guarda-acesa  # não decide: a guarda fica acesa para o print
npm run demo:play -- --simular              # só mostra as linhas, sem gravar
```

Com o demo aberto no VS Code, o comando acrescenta as cenas de
[`roteiro-ao-vivo.json`](roteiro-ao-vivo.json) com o horário de agora: uma tarefa
termina, outro agente começa, uma decisão é pedida (a guarda acende) e, depois de
uma pausa, chega a resposta. As cenas que mudam o estado (`task-2.1` concluída e
`task-2.2` em andamento) passam pelo CLI de estado do próprio demo.

Dois avisos:

- a decisão é uma **simulação** de Pessoa Exemplo, só para o GIF não ficar
  parado. No uso real nenhum agente decide por você (ADR-0024);
- o verbo `runs append` do CLI ainda não existia quando o demo foi escrito, então
  os eventos são gravados direto em `runs/<iniciativa>.jsonl`, no mesmo formato e
  conferidos antes de gravar. Quando o verbo estiver na árvore, só a função
  `appendEvent` de `scripts/demo-play.mjs` precisa trocar.

## Regras do demo

- **Nenhum dado real.** Os números, os nomes e os achados são inventados, e cada
  relatório de fixture diz isso na primeira linha. Nada de e-mail ou telefone.
- **Só uma pessoa**, Pessoa Exemplo, como dona das iniciativas e quem aprova os
  gates.
- **A marca não está nas fixtures.** O nome e os arquivos da Jataí vêm do
  instalador, então uma troca de marca não deixa nada para trás aqui.
- O demo entra no `content-scan` como qualquer outro arquivo do repositório.
- `demo/` e `.demo/` ficam fora do `.vsix` (`.vscodeignore`), e `.demo/` fica fora
  do git (`.gitignore`).

Os testes que protegem tudo isto estão em `tests/features/workspace-demo.feature`
(os cenários) e `tests/features/workspace-demo.steps.test.ts`.
