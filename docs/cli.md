# CLI do Jataí

A CLI headless instala e mantém o kit de agentes da Jataí em um projeto que já
existe, sem precisar abrir o VS Code. É a mesma estrutura que o Wizard instala:
os mesmos agentes, skills, `AGENTS.md`, comando de entrada, MCP e
`.github/kit.lock.json` — porque usa o mesmo `KitInstaller` da extensão.

> A CLI é uma frente de **instalação e manutenção**. O Cockpit, o mapa e o
> Wizard continuam na extensão do VS Code. A CLI não abre uma interface gráfica.

## Requisitos

- **Node.js 20+**.
- Um projeto existente (brownfield) ou uma pasta de workspace. O CLI do MVP
  instala em projeto existente; para criar um projeto novo, use o Wizard.
- A extensão do VS Code aberta no workspace é necessária para o Cockpit e para
  o State Service local. O CLI e o `jatai-state` funcionam sem a extensão; o
  MCP precisa do State Service.

## Instalação

Quando a versão estiver publicada no npm:

```sh
npx jatai --version
```

Não é preciso instalar globalmente. Se quiser instalar:

```sh
npm install --global jatai
jatai --version
```

Enquanto a versão não estiver no npm, o pacote pode ser montado do repositório:

```sh
npm run build:cli-kit
node dist/cli-package/jatai.cjs --version
```

## Uso rápido

```sh
cd /caminho/do/meu-projeto

# 1. escolha o harness e instale o kit
npx jatai init --harness opencode

# 2. confira o workspace
npx jatai doctor

# 3. a partir daqui, abra o OpenCode no projeto e rode /jatai
```

`init` pergunta o harness se você não passar `--harness`. Em pasta não vazia,
pede confirmação; em CI, use `--yes`.

## Comandos

### `jatai init`

Instala o kit no projeto existente (brownfield), sem modificar o código.

```sh
jatai init --harness opencode
jatai init --harness claude --dir ./outro-projeto --name outro-projeto
jatai init --harness copilot --maturity dora-4keys,space-devex
jatai init --harness opencode --dry-run
jatai init --harness opencode --yes --json
```

| Flag | O que faz |
|---|---|
| `--harness <id>` | `copilot`, `claude` ou `opencode`; se omitido, pergunta |
| `--dir <pasta>` | diretório do workspace (default: atual) |
| `--name <nome>` | nome do projeto no config (default: basename em kebab-case) |
| `--maturity <lista>` | frameworks de maturidade separados por vírgula |
| `--dry-run` | mostra o que seria gravado; não escreve no alvo |
| `--yes` | não pede confirmação (CI) |
| `--json` | saída de máquina; stdout só JSON |

Em um workspace Jataí existente, `init` completa o que falta e **não troca o
harness**. Para atualizar o kit, use `update`.

### `jatai doctor`

Diagnóstico somente-leitura do workspace:

- Node, config, modo (brownfield/greenfield), harness detectado;
- `kit_version`, lock, arquivos do kit ausentes e edições do time;
- orquestrador, instruções, bundles do CLI/MCP;
- entrada MCP em `.mcp.json`, `.vscode/mcp.json` ou `opencode.json(c)`;
- `repos/` e `docs/input/`.

```sh
jatai doctor
jatai doctor --json
```

Sai com código 1 se houver erro. Avisos (versão defasada, arquivo editado pelo
time) não derrubam o comando.

### `jatai update`

Atualiza o kit do workspace detectado.

```sh
jatai update
jatai update --dry-run
jatai update --yes # necessário se o workspace não tem kit.lock.json
```

- Arquivo do kit editado pelo time é preservado; a versão nova vai para
  `<arquivo>.kit-new`.
- Arquivo do kit que saiu da versão nova é removido apenas se estava intacto.
- `--dry-run` roda numa cópia mínima e mostra adicionados, alterados e
  removidos; não toca no alvo.

### `jatai uninstall`

Remove só o que o kit instalou, usando o `kit.lock.json`.

```sh
jatai uninstall
jatai uninstall --dry-run
jatai uninstall --yes
```

- Arquivo do kit editado pelo time **fica** e é listado.
- Nunca toca em `agents/domain/`, `skills/coding-guidelines-*`,
  `.github/artifacts/`, `docs/input/`, `repos/`, `.git/` ou `node_modules/`.
- Remove a entrada MCP da marca das configurações, preservando outros servidores
  e comentários.
- No Claude Code, remove só os hooks do kit do `.claude/settings.json`.
- Preserva o config, os artefatos, o domínio e as skills do cliente.
- Sem `kit.lock.json`, o comando recusa; rode `update --yes` para criar o lock
  ou remova manualmente.

### `jatai harness list`

Lista os harnesses suportados e o que cada um instala (pasta de agentes,
orquestrador, skills, instruções, comandos, MCP e atividade).

```sh
jatai harness list
jatai harness list --json
```

### `jatai state`

Delega ao CLI de estado instalado no workspace
(`.github/scripts/<marca>-state.cjs`). É o mesmo motor que os agentes usam;
a CLI de instalação não reimplementa os verbos.

```sh
jatai state initiatives list
jatai state gates approve --help
```

### `--json` e exit codes

`--json` escreve só JSON no stdout; logs e avisos vão para stderr. Os códigos
de saída são estáveis para CI:

| Código | Significado |
|---|---|
| 0 | sucesso (ou nada a fazer) |
| 1 | erro de uso/entrada (flag, harness, nome, diretório) |
| 2 | ambiente bloqueado (Node antigo, config de outro host, pasta não vazia, confirmação ausente) |
| 3 | erro interno (exceção do instalador) |

## O que o kit instala

| Harness | Agentes | Instruções | MCP |
|---|---|---|---|
| GitHub Copilot | `.github/agents/` | `.github/copilot-instructions.md` + `AGENTS.md` | `.mcp.json` + `.vscode/mcp.json` |
| Claude Code | `.claude/agents/` | `CLAUDE.md` + `AGENTS.md` | `.mcp.json` + `.vscode/mcp.json` |
| OpenCode | `.opencode/agents/` (plano) | `AGENTS.md` | `opencode.json(c)` |

Além dos agentes e skills, o kit cria `.github/artifacts/`, `.github/scripts/`
(CLI de estado e servidor MCP), `repos/`, `docs/input/`, `jatai.config.yaml` e
`.github/kit.lock.json`.

## Segurança e consentimento

- A CLI só escreve no `--dir`/diretório atual. Nunca em `~/.jatai`,
  `/usr/local` ou fora do workspace.
- Sem `postinstall`, sem telemetria e sem rede na instalação: o kit vai embutido
  no pacote.
- `init` em pasta não vazia pede confirmação; `--yes` é explícito.
- `update` e `uninstall` usam o lock e preservam o que o time editou.
- O `uninstall` não remove config, artefatos, domínio, skills do cliente nem
  repositórios.
- O CLI não imprime conteúdo de secrets; o `doctor` só reporta presença.

## Limites desta versão

- **Brownfield primeiro.** Projeto novo continua no Wizard da extensão.
- **Um harness por workspace.** `jatai add` para instalar OpenCode ao lado de
  Claude/Copilot é uma decisão futura.
- **OpenCode 2.x** no harness; o V1 fica para uma decisão futura.
- **Sem Cockpit.** O mapa, os gates e as decisões humanas continuam no VS Code.
- **Windows:** o produto funciona; o job de Windows do CI da suíte histórica é
  experimental. O smoke da CLI roda nos três sistemas.

## Problemas comuns

| Sintoma | O que conferir |
|---|---|
| `npx jatai` não encontra o pacote | veja se a versão foi publicada no npm; enquanto isso, use `node dist/cli-package/jatai.cjs` |
| `init` recusa a pasta | pasta não vazia sem `--yes`, ou já é um workspace Jataí com outro harness |
| `doctor` aponta arquivo ausente | o kit foi editado/removido; rode `jatai update` ou reinstale |
| MCP não conecta | a extensão/State Service precisa estar no ar; `opencode mcp list` / `doctor` |
| `uninstall` recusa | sem `kit.lock.json`; rode `update --yes` para criar o lock |
| `update`/`uninstall` preservam um arquivo | o time editou o arquivo do kit; ele fica, e a versão nova vai para `.kit-new` |

## Desenvolvimento

```sh
npm run build:cli-kit   # monta dist/cli-package
node scripts/cli-kit-check.mjs
npx vitest run tests/cli-kit
```

O pacote é autocontido: `jatai.cjs` + `kit/` + `package.json`, sem
`node_modules` e sem `postinstall`. A publicação é feita pelo workflow de
release com provenance.

## Licença

MIT. Veja [LICENSE](../LICENSE) e [THIRD_PARTY_NOTICES](../THIRD_PARTY_NOTICES.md).
