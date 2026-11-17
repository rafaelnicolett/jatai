---
id: workspace-tools
name: workspace-tools
type: skill
description: >
  Padrões operacionais para agentes manipularem o workspace com segurança —
  criação, edição, deleção e reorganização de arquivos; operações de terminal;
  convenções de estrutura de diretórios do workspace.
applicable_to:
  - Qualquer agente que precise criar/mover/deletar arquivos no workspace
  - Operações de limpeza e reorganização de artefatos
  - Geração de scripts de setup/automação
  - Ações que afetam o filesystem além de simples edições de código
inputs:
  - Intenção do usuário (criar estrutura, limpar arquivos, gerar script)
outputs:
  - Arquivos criados/editados no caminho canônico
  - Scripts executáveis em scripts/
  - Confirmação de deleção via terminal (run_in_terminal)
---

# Skill: workspace-tools

> Os agentes têm ferramentas limitadas (sem delete nativo).
> Esta skill define **como contornar isso com segurança** e quais padrões
> seguir ao operar no filesystem.

---

## 1. Hierarquia de diretórios do workspace

É o que a {{brand.displayName}} gera num projeto novo. `<host-dir>` é `.github`
(Copilot) ou `.claude` (Claude Code).

```
<workspace>/
├── <host-dir>/
│   ├── agents/          # agentes .agent.md por stream
│   └── skills/          # skills (SKILL.md + assets)
├── .github/
│   ├── chatmodes/       # (Copilot) chat mode do orquestrador
│   ├── scripts/         # {{brand.files.cli}} — CLI determinístico de escrita de estado (ver §6)
│   └── artifacts/       # file-as-state: initiatives.yaml, prd.md, sprint-backlog.yaml, gates/, runs/
├── docs/
│   ├── adr/             # Architecture Decision Records
│   ├── architecture/    # diagramas C4 e de sequência
│   ├── domain/          # DDD artifacts (context maps, glossary)
│   ├── delivery-flow.md
│   ├── hierarchy.md
│   └── routing-rules.md
├── code/
│   ├── services/        # backends (ex: billing-api)
│   └── apps/            # frontends (ex: portal-web)
├── features/            # Gherkin BDD (.feature files)
├── api/                 # contratos OpenAPI
├── infrastructure/      # IaC (Terraform/Pulumi)
└── pipelines/           # CI/CD
```

`scripts/` (automação local, ver §5) não vem pronta: crie na raiz quando o
projeto precisar.

---

## 2. Onde fica o código

O projeto novo já nasce com o esqueleto de cada stack escolhida no Wizard:

- `code/services/<projeto>-api/` — o backend (um por serviço);
- `code/apps/<projeto>-web/` — o frontend, quando há um.

O código novo é dos agentes `@backend-*` e `@frontend-*`, no padrão da stack e
da arquitetura que o Wizard registrou. Não há pasta de modelos para copiar
dentro do workspace.

---

## 3. Deleção de arquivos

Agentes **não têm ferramenta de delete nativa**. Use o terminal:

```bash
# Deletar arquivo único
rm path/to/file

# Deletar pasta recursivamente (confirmar com usuário antes!)
rm -rf path/to/folder

# Deletar arquivos por padrão (glob)
find <pasta> -name "*.tmp" -type f -delete
```

> ⚠️ `rm -rf` requer confirmação explícita do usuário antes de executar.
> Prefira `find ... -delete` para ser mais cirúrgico.

### Padrão seguro para limpeza

Liste antes de apagar, e só apague o que a listagem mostrou:

```bash
find <pasta> -name "*.tmp" -type f            # confira a lista
find <pasta> -name "*.tmp" -type f -delete
find <pasta> -type d -empty -delete           # pastas que ficaram vazias
```

---

## 4. Operações com terminal (`run_in_terminal`)

Sempre que precisar de:

| Operação | Comando |
|---|---|
| Deletar arquivo | `rm <path>` |
| Mover/renomear | `mv <src> <dst>` |
| Criar diretório | `mkdir -p <path>` |
| Listar recursivo | `find <path> -type f` |
| Checar diff | `git diff --stat` |
| Confirmar git status | `git status --short` |

> Use sempre paths absolutos ou relativos à raiz do workspace.
> Nunca use `--force` ou `--no-verify` sem aprovação do usuário.

---

## 5. Criação de scripts em `scripts/`

Scripts de automação local vão em `scripts/` com permissão de execução:

```bash
# Sempre criar com shebang + set -euo pipefail
#!/usr/bin/env bash
set -euo pipefail
```

Padrão de nome:
- `scripts/start-local.sh` — sobe todo o ambiente local
- `scripts/seed-dev.sh` — seed de dados de desenvolvimento
- `scripts/reset-db.sh` — reset do banco (confirmar antes!)
- `scripts/build-all.sh` — build de todos os componentes

---

## 6. Artefatos file-as-state

Os arquivos em `.github/artifacts/` são a **fonte da verdade** do estado do delivery.
São lidos por parsers tipados no Cockpit — um campo fora do formato esperado
não quebra a tela (os parsers são tolerantes), mas o dado simplesmente some
do Cockpit sem aviso. Editar à mão é a origem mais comum desse tipo de
divergência (chave de topo duplicada, campo sob o nome errado, status fora
do enum).

### O estado — sempre via `{{brand.cliName}}`

Nunca edite `delivery-state.yaml` nem `initiatives.yaml` com Read/Edit. Use o CLI determinístico
`.github/scripts/{{brand.files.cli}}` — ele faz o merge estrutural (nunca duplica
chave), valida o `--status` contra o enum antes de gravar, e é o MESMO motor
de escrita que o clique no Cockpit usa (então o resultado é idêntico ao que
um humano produziria clicando).

```bash
# Ao concluir uma fase — status + agent + completed_at num só comando
node .github/scripts/{{brand.files.cli}} delivery-state upsert-phase \
  --global --phase business --status done --agent "@business" \
  --completed-at "$(date -u +%Y-%m-%dT%H:%M:%SZ)"

# Marcar um item de checklist humano
node .github/scripts/{{brand.files.cli}} delivery-state upsert-checklist \
  --global --phase business --item problem-section --checked true

# Criar/atualizar uma iniciativa (initiatives.yaml)
node .github/scripts/{{brand.files.cli}} initiatives create \
  --id feat-x --name "Feature X" --stream upstream --current-phase business --active

# Bump de current_phase
node .github/scripts/{{brand.files.cli}} initiatives bump-phase --id feat-x --phase product

# Fechar um item de onda (Maestro agregando relatório de execução)
node .github/scripts/{{brand.files.cli}} initiatives upsert-wave-item \
  --id mod-x --wave wave-1 --item item-1.1 --status done \
  --repo billing-api --commit 4a2cf26 --summary "migrou schema"
```

Cada comando imprime uma linha JSON (`{"ok":true,...}` ou `{"ok":false,"error":{...}}`)
e sai com código 0 (sucesso), 1 (erro de uso — ex.: `--status` fora do enum) ou
2 (erro interno). Se `.github/scripts/{{brand.files.cli}}` não existir neste
workspace (kit desatualizado), rode `{{brand.commandPrefix}}.migrateKit` pelo Cockpit — só
então, como último recurso, edite manualmente seguindo a regra abaixo.

Os verbos do CLI:

| Artefato | Verbo | Para que serve |
|---|---|---|
| `delivery-state` | `upsert-phase`, `upsert-checklist` | grava a fase e os itens do checklist humano |
| `delivery-state` | `get` | lê o arquivo (`--global` ou `--initiative <id>`), ou uma fase (`--phase <id>`) |
| `initiatives` | `create`, `switch-active`, `bump-phase`, `upsert-wave-item` | grava a iniciativa, a ativa, a fase corrente e os itens de onda |
| `initiatives` | `get` | lê o registro inteiro, ou uma iniciativa (`--id <id>`) |
| `gates` | `get` | lê o registro de um gate: `--gate d1 --repo <id>`, ou `--gate d2` / `--gate d3` com `--initiative <id>`; devolve `null` se ainda não foi registrado |
| `gates` | `approve` | registra a aprovação de um gate, com o nome de quem aprovou. **É só de quem decide (humano): agente não roda este verbo** |
| `runs` | `append` | registra um evento de atividade do agente em `runs/*.jsonl` (começou, avançou, terminou, gravou um artefato, travou), com `--event_type`, `--agent_id`, `--phase_id`, `--repo_id` e as demais flags do evento |

Leia o estado antes de agir, com os verbos `get`, em vez de adivinhar ou
abrir o YAML inteiro. O gate é decisão humana: o agente lê o registro dele com
`gates get` e nunca o aprova. Os eventos de `runs append` ficam na máquina, e
o CLI recusa `gate-approved`, `item-approved` e `decision-made`.

### Os demais artefatos (`sprint-backlog.yaml`, `foundation-state.yaml`, relatórios de gate)

O `sprint-backlog.yaml`, o `foundation-state.yaml` (fora do `gate_d1`, que é
do verbo `gates`) e o relatório de cada gate em `gates/<gate-id>.md` ainda não
têm um verbo dedicado. Pra estes, a disciplina manual continua valendo:

1. **Ler** antes de escrever (nunca sobrescrever sem verificar estado atual)
2. **Atualizar status** de itens do sprint-backlog.yaml para `done` ao concluir
3. **Criar** em `.github/artifacts/gates/<gate-id>.md` ao passar por um gate
4. **Nunca deletar** artefatos de gates já executados (são imutáveis)

```bash
# Verificar estado atual dos artefatos
ls -la .github/artifacts/
cat .github/artifacts/sprint-backlog.yaml | grep "status:"
```

---

## 7. Anti-padrões

| ❌ Não fazer | ✅ Fazer em vez disso |
|---|---|
| Editar `delivery-state.yaml`/`initiatives.yaml` com Read/Edit | `node .github/scripts/{{brand.files.cli}} ...` (ver §6) |
| Rodar `gates approve` como agente | Ler com `gates get`; a aprovação é de quem decide (humano) |
| Escrever `runs/*.jsonl` à mão | `node .github/scripts/{{brand.files.cli}} runs append ...` (ver §6) |
| Deletar sem confirmar com usuário | Pedir confirmação antes de `rm -rf` |
| Criar arquivos fora da hierarquia canônica | Verificar hierarquia na seção 1 |
| Editar artefatos de gate passados | Gates são imutáveis após execução |
| Scripts sem `set -euo pipefail` | Sempre com proteções de erro |
| Paths hardcoded de usuário | Usar `$(git rev-parse --show-toplevel)` |
