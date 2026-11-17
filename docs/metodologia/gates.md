# Gates: os pontos de aprovação humana

Um **gate** é um ponto fixo do fluxo em que o trabalho automático para e espera
uma pessoa decidir. É o ponto de aprovação humana da Jataí: nenhum agente passa
de um gate sem você.

No projeto existente (brownfield) são três, um entre cada etapa:

| Gate | Fica entre | Enquanto não for aprovado, fica bloqueado | O que precisa existir |
|---|---|---|---|
| **D1** | Descoberta e Planejamento | qualquer pedido de Planejamento | as fases da Descoberta concluídas e o relatório consolidado, `assessment/report.md` |
| **D2** | Planejamento e Execução | refactor e migração | o roadmap e a matriz de risco aprovados, mais as ADRs |
| **D3** | Execução e Operação | publicar e operar | PR mergeado, testes verdes e cobertura no mínimo combinado |

No projeto novo (greenfield) são dois, **G1** e **G2**, validados também pelos
guardiões. Veja [brownfield e greenfield](brownfield-e-greenfield.md).

## D1: o primeiro "sim, pode seguir"

Nenhuma fase da Descoberta fecha sozinha. Quando um sub-agente termina, a fase vai
para `agent-done`, que quer dizer "o agente terminou, falta você". Só depois da sua
resposta ela vira `done`.

O D1 é **por repositório**: aprovar um não aprova os outros, e um repositório
grande nunca trava a análise dos demais. O D1 global nunca é marcado à mão. Ele
fecha sozinho quando todo repositório que entra na análise tem o D1 aprovado e a
análise de domínio, que olha todos juntos, também terminou.

O estado fica em `assessment/foundation-state.yaml`:

```yaml
repos:
  biblioteca-api:
    phases:
      arch:
        status: agent-done       # terminou; falta você confirmar
        agent: "@arch-discoverer"
    gate_d1:
      status: pending
```

## D2: o roadmap vira trabalho de verdade

Aprovar o D2 é dizer: "esse roadmap reflete a realidade, pode virar trabalho".
O gate só aprova com o roadmap e a matriz de risco aprovados. Sem ele, refactor e
migração ficam bloqueados.

O D2 traz o **lock de modernização**. Enquanto uma modernização estiver ativa,
nenhuma iniciativa nova abre sobre os repositórios que ela toca. Durante a
migração o repositório vive em dois padrões ao mesmo tempo, e uma feature entrando
no meio não saberia qual seguir. O lock vale pelo `scope` da iniciativa: uma
modernização em `biblioteca-api` não trava `biblioteca-web`.

## D3: o que passa para a Operação

Nenhum deploy acontece sem PR mergeado e testes verdes. O D3 é essa confirmação, e
é ele que libera a Operação do dia a dia.

O gate só aprova com **todas as tarefas fechadas**. Uma tarefa está fechada quando
é `done`, `skipped` ou `cancelled`. `blocked` e `failed` sempre impedem o gate. Como
um `cancelled` é uma decisão humana de cortar escopo, o checklist do gate lista cada
um deles com o motivo, para você ver o que foi cortado antes de aprovar. Os status
estão em [estado em arquivos](estado-em-arquivos.md#status-de-trabalho).

## Como aprovar

Quem aprova é sempre uma pessoa, por um destes caminhos:

- **no Cockpit**, na decisão do gate, com o checklist humano para marcar;
- **no terminal**, pelo CLI de estado:

```bash
CLI=.github/scripts/jatai-state.cjs        # o CLI que o kit instala no workspace
node $CLI gates get --gate d2 --initiative <id>        # lê o gate, sem alterar nada
node $CLI gates approve --gate d1 --repo <id>          # o D1 é por repositório
node $CLI gates approve --gate d2 --initiative <id> --note "roadmap e ADRs revisados"
node $CLI gates approve --gate d3 --initiative <id>
```

Duas regras protegem a decisão:

- **O agente lê o gate, nunca o aprova.** Não existe tool MCP de aprovação.
  `gates get` está aberto a agentes e humanos, e `gates approve` é de quem decide.
- **O aprovador é registrado pelo nome do git.** O CLI e o Cockpit gravam o
  `user.name` do git do workspace, nunca o e-mail. Sem `user.name`, o comando pede o
  nome. A aprovação humana ganha o carimbo `human_approved_at`, separado do
  `approved_at` que um agente pode gravar.

Se o gate ainda não pode fechar, o comando recusa e lista o que falta: as fases
do Foundation daquele repositório no D1, o roadmap e a matriz de risco no D2, as
tarefas abertas no D3.

## Como revisar um gate bem

Não aprove só porque "parece certo". Antes de confirmar:

1. Leia pelo menos o resumo dos achados críticos e altos (no D1), o roadmap e a
   matriz (no D2) ou as tarefas canceladas e o relatório do PR (no D3).
2. Se a pergunta parecer estranha ou fora de contexto, peça para o agente rodar de
   novo, ou peça para ver o artefato antes. É mais barato pedir uma segunda passada
   agora do que desfazer uma aprovação depois.
3. Escreva uma nota curta (`--note`) dizendo o que você revisou. Ela fica no estado
   e aparece no histórico.

O gate nunca é uma caixa genérica de "OK ou Cancelar": é uma pergunta específica,
no contexto certo, com no máximo uma pergunta de desambiguação por vez. Veja
[humano no circuito](humano-no-circuito.md).
