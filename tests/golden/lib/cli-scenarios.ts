/**
 * cli-scenarios.ts — roteiros do golden do CLI de estado (`helyx-state`).
 *
 * Cobre todo par artefato × verbo (`initiatives create|switch-active|
 * bump-phase|upsert-wave-item`, `delivery-state upsert-phase|
 * upsert-checklist`, `kb push`) e o despacho do entry point, nos caminhos de
 * sucesso e de erro, mais os defeitos conhecidos (pinados, nunca corrigidos
 * aqui). Cada cenário roda num sandbox próprio:
 *
 *   <sandbox>/ws/     raiz do workspace (cwd padrão do CLI)
 *   <sandbox>/home/   HOME/USERPROFILE do subprocesso
 *
 * O golden guarda, por passo, `exit`, stdout (JSON de uma linha vira objeto)
 * e stderr normalizados, e no fim a árvore inteira do sandbox: assim escrita
 * fora do workspace (path traversal, BUG-32) aparece no diff.
 *
 * Fixtures sintéticas. Behavior pinned on 2026-11-14.
 */

export interface CliStep {
  readonly argv: readonly string[];
  /** Relativo ao sandbox. Default: `ws`. */
  readonly cwd?: string;
}

export interface CliScenario {
  readonly id: string;
  readonly title: string;
  readonly knownBug?: string;
  /** Arquivos criados antes do 1º passo, relativos ao sandbox. */
  readonly fixture?: Readonly<Record<string, string>>;
  /** Lock órfão (relativo ao sandbox) criado com mtime de 1 h atrás. */
  readonly staleLock?: string;
  readonly steps: readonly CliStep[];
}

const INITIATIVES_COM_COMENTARIOS = [
  "# Registro de iniciativas do workspace fictício",
  "active: gf-alfa   # iniciativa ativa",
  "initiatives:",
  "  - id: gf-alfa",
  "    name: Projeto Alfa",
  "    status: in-progress",
  "    mode: greenfield",
  "    current_phase: business",
  '  - { id: mod-beta, name: "Modernização Beta", status: planned, type: modernization }',
  "",
].join("\n");

/** Fixtures dos gates (ADR-0024): gf-alfa com o Planejamento aprovado; mod-beta sem roadmap nem matriz de risco. */
const INITIATIVES_GATES = [
  "active: gf-alfa",
  "initiatives:",
  "  - id: gf-alfa",
  "    name: Projeto Alfa",
  "    status: in-progress",
  "    roadmap_gate:",
  "      status: approved",
  "    risk_matrix_gate:",
  "      status: approved",
  '  - { id: mod-beta, name: "Modernização Beta", status: planned, type: modernization }',
  "",
].join("\n");

const FASES_REPO_CONCLUIDAS = ["tech-stack", "arch", "coding-archaeology", "design", "quality", "debt"]
  .map((p) => `      ${p}:\n        status: done\n`)
  .join("");

const FOUNDATION_API_FECHADO = `version: 2\nphases: {}\nrepos:\n  api:\n    phases:\n${FASES_REPO_CONCLUIDAS}    gate_d1:\n      status: pending\n`;

/** web: quality ainda agent-done e debt sem registro; worker: sem frontend, tudo concluído menos design. */
const FOUNDATION_FECHAMENTO = [
  "version: 2",
  "phases: {}",
  "repos:",
  "  web:",
  "    phases:",
  ...["tech-stack", "arch", "coding-archaeology", "design"].flatMap((p) => [`      ${p}:`, "        status: done"]),
  "      quality:",
  "        status: agent-done",
  "    gate_d1:",
  "      status: pending",
  "  worker:",
  "    phases:",
  ...["tech-stack", "arch", "coding-archaeology", "quality", "debt"].flatMap((p) => [`      ${p}:`, "        status: done"]),
  "    gate_d1:",
  "      status: pending",
  "",
].join("\n");

const REPOS_FECHAMENTO = "version: 1\nrepos:\n  - id: web\n    source: local-path\n    path: repos/web\n  - id: worker\n    source: local-path\n    path: repos/worker\n    has_frontend: false\n";

/** O git do sandbox: nome e e-mail fictícios. Só o nome pode aparecer no estado gravado. */
const GITCONFIG_FICTICIO = "[user]\n\tname = Pessoa Fictícia\n\temail = pessoa.ficticia@example.invalid\n";

const DS_COM_FASES = "initiative_id: default\nphases:\n  business:\n    status: done\n  product:\n    status: in-progress\n";

const I = (...args: string[]): CliStep => ({ argv: ["initiatives", ...args] });
const D = (...args: string[]): CliStep => ({ argv: ["delivery-state", ...args] });
const K = (...args: string[]): CliStep => ({ argv: ["kb", ...args] });
const G = (...args: string[]): CliStep => ({ argv: ["gates", ...args] });
const R = (...args: string[]): CliStep => ({ argv: ["runs", ...args] });

export const CLI_SCENARIOS: readonly CliScenario[] = [
  // ---- despacho do entry point ----------------------------------------
  { id: "despacho-sem-argumentos", title: "sem artefato nem verbo: USAGE, exit 1", steps: [{ argv: [] }] },
  { id: "despacho-so-artefato", title: "artefato sem verbo: USAGE", steps: [{ argv: ["initiatives"] }] },
  { id: "despacho-help-global", title: "--help sozinho cai no USAGE (artefato '--help', verbo ausente)", steps: [{ argv: ["--help"] }] },
  { id: "despacho-artefato-desconhecido", title: "artefato desconhecido: UNKNOWN_ARTIFACT", steps: [{ argv: ["sprint-backlog", "create"] }] },
  { id: "despacho-help-como-verbo", title: "'initiatives --help' vira UNKNOWN_VERB (envelope correto)", steps: [I("--help")] },
  {
    id: "despacho-verbos-desconhecidos",
    title: "verbo desconhecido em cada artefato: UNKNOWN_VERB com a lista esperada",
    steps: [D("remove-phase"), K("pull"), I("delete")],
  },

  // ---- initiatives create ----------------------------------------------
  { id: "initiatives-create-minimo", title: "só --id: name = id, status planned, sem active", steps: [I("create", "--id", "gf-alfa")] },
  {
    id: "initiatives-create-completo",
    title: "todas as flags, com --active",
    steps: [
      I(
        "create", "--id", "mod-beta", "--name", "Modernização Beta", "--status", "in-progress", "--stream", "execution",
        "--current-phase", "test-backfill", "--mode", "brownfield", "--type", "modernization", "--owner", "Pessoa Fictícia",
        "--priority", "alta", "--created-at", "2026-01-02", "--active"
      ),
    ],
  },
  {
    id: "initiatives-create-merge-e-idempotencia",
    title: "cria, faz merge de campos, repete (changed:false) e acrescenta uma 2ª iniciativa",
    steps: [
      I("create", "--id", "gf-alfa", "--name", "Projeto Alfa", "--active"),
      I("create", "--id", "gf-alfa", "--status", "done", "--name", "Alfa renomeado"),
      I("create", "--id", "gf-alfa", "--status", "done", "--name", "Alfa renomeado"),
      I("create", "--id", "mod-beta", "--type", "modernization", "--mode", "brownfield"),
    ],
  },
  {
    id: "initiatives-create-sobre-arquivo-com-comentarios",
    title: "acrescenta iniciativa num initiatives.yaml escrito à mão (comentários, flow-style, active sem aspas)",
    fixture: { "ws/.github/artifacts/initiatives.yaml": INITIATIVES_COM_COMENTARIOS },
    steps: [I("create", "--id", "gf-gama", "--name", "Projeto Gama", "--active")],
  },
  {
    id: "initiatives-create-validacoes",
    title: "sem --id, --id vazio, e enums inválidos (status, mode, type)",
    steps: [
      I("create", "--name", "Sem id"),
      I("create", "--id", ""),
      I("create", "--id", "gf-alfa", "--status", "bogus"),
      I("create", "--id", "gf-alfa", "--mode", "hibrido"),
      I("create", "--id", "gf-alfa", "--type", "epico"),
    ],
  },

  // ---- initiatives switch-active ---------------------------------------
  {
    id: "initiatives-switch-active",
    title: "troca o active de um arquivo escrito à mão",
    fixture: { "ws/.github/artifacts/initiatives.yaml": INITIATIVES_COM_COMENTARIOS },
    steps: [I("switch-active", "--id", "mod-beta"), I("switch-active", "--id", "mod-beta")],
  },
  {
    id: "initiatives-switch-active-id-inexistente",
    title: "aceita id que não existe em initiatives e grava active para ele",
    knownBug: "switch-active não valida se a iniciativa existe",
    fixture: { "ws/.github/artifacts/initiatives.yaml": INITIATIVES_COM_COMENTARIOS },
    steps: [I("switch-active", "--id", "nao-existe")],
  },
  {
    id: "initiatives-switch-active-sem-arquivo",
    title: "sem initiatives.yaml: cria o arquivo só com active; sem --id: MISSING_FLAG",
    steps: [I("switch-active", "--id", "gf-alfa"), I("switch-active")],
  },

  // ---- initiatives bump-phase ------------------------------------------
  {
    id: "initiatives-bump-phase",
    title: "bump numa entrada flow-style, repetição idempotente, id inexistente e flag faltando",
    fixture: { "ws/.github/artifacts/initiatives.yaml": INITIATIVES_COM_COMENTARIOS },
    steps: [
      I("bump-phase", "--id", "mod-beta", "--phase", "discovery"),
      I("bump-phase", "--id", "mod-beta", "--phase", "discovery"),
      I("bump-phase", "--id", "nao-existe", "--phase", "product"),
      I("bump-phase", "--id", "gf-alfa"),
    ],
  },
  {
    id: "initiatives-bump-phase-sem-arquivo",
    title: "sem initiatives.yaml: INITIATIVE_NOT_FOUND, mas a pasta .github/artifacts/ é criada mesmo assim",
    steps: [I("bump-phase", "--id", "gf-alfa", "--phase", "product")],
  },

  // ---- initiatives upsert-wave-item ------------------------------------
  {
    id: "initiatives-wave-item-completo",
    title: "item com todas as flags, depois atualização parcial que preserva o resto",
    steps: [
      I("create", "--id", "mod-beta", "--type", "modernization"),
      I(
        "upsert-wave-item", "--id", "mod-beta", "--wave", "wave-1", "--item", "item-1.1", "--status", "done", "--repo", "app-ficticio",
        "--completed-at", "2026-01-03", "--artifact", "relatorio-a.md", "--artifact", "relatorio-b.md", "--summary", "Resumo fictício",
        "--commit", "abc1234", "--known-bug", "BUG-X: comportamento fictício", "--merge-block", "aguardando revisão", "--requires-approval"
      ),
      I("upsert-wave-item", "--id", "mod-beta", "--wave", "wave-1", "--item", "item-1.1", "--status", "in-progress", "--summary", "Resumo novo"),
      I("upsert-wave-item", "--id", "mod-beta", "--wave", "wave-1", "--item", "item-1.2", "--status", "planned"),
    ],
  },
  {
    id: "initiatives-wave-item-hierarquia",
    title: "--hierarchy epic-feature-backlog-task grava epic_status; legacy grava wave_status; valor inválido é recusado",
    steps: [
      I("create", "--id", "mod-beta"),
      I("upsert-wave-item", "--id", "mod-beta", "--wave", "E1", "--item", "F1.1", "--status", "done", "--hierarchy", "epic-feature-backlog-task"),
      I("upsert-wave-item", "--id", "mod-beta", "--wave", "wave-1", "--item", "item-1.1", "--status", "done", "--hierarchy", "legacy"),
      I("upsert-wave-item", "--id", "mod-beta", "--wave", "wave-1", "--item", "item-1.1", "--status", "done", "--hierarchy", "arvore"),
    ],
  },
  {
    id: "initiatives-wave-item-erros",
    title: "iniciativa inexistente, flags obrigatórias faltando e status fora do vocabulário (ADR-0022: antes era texto livre)",
    fixture: { "ws/.github/artifacts/initiatives.yaml": INITIATIVES_COM_COMENTARIOS },
    steps: [
      I("upsert-wave-item", "--id", "nao-existe", "--wave", "w", "--item", "i", "--status", "done"),
      I("upsert-wave-item", "--id", "gf-alfa", "--item", "i", "--status", "done"),
      I("upsert-wave-item", "--id", "gf-alfa", "--wave", "w", "--status", "done"),
      I("upsert-wave-item", "--id", "gf-alfa", "--wave", "w", "--item", "i"),
      I("upsert-wave-item", "--id", "gf-alfa", "--wave", "w", "--item", "i", "--status", "qualquer-coisa"),
    ],
  },

  // ---- delivery-state upsert-phase -------------------------------------
  {
    id: "ds-upsert-phase-global",
    title: "--global cria delivery-state.yaml; repetição devolve changed:false; 2ª fase entra no mesmo bloco phases",
    steps: [
      D("upsert-phase", "--global", "--phase", "business", "--status", "done", "--agent", "@business"),
      D("upsert-phase", "--global", "--phase", "business", "--status", "done", "--agent", "@business"),
      D("upsert-phase", "--global", "--phase", "product", "--status", "in-progress"),
    ],
  },
  {
    id: "ds-upsert-phase-iniciativa-completo",
    title: "--initiative com --completed-at e --artifact múltiplo; 2ª chamada troca a lista de artefatos inteira",
    steps: [
      D(
        "upsert-phase", "--initiative", "gf-alfa", "--phase", "product", "--status", "done", "--agent", "@product",
        "--completed-at", "2026-01-02T10:00:00Z", "--artifact", "docs/prd.md", "--artifact", "docs/visao.md"
      ),
      D("upsert-phase", "--initiative", "gf-alfa", "--phase", "product", "--status", "done", "--artifact", "docs/prd-v2.md"),
    ],
  },
  {
    id: "ds-upsert-phase-escopo-e-validacoes",
    title: "sem escopo (MISSING_SCOPE), --global vence --initiative, flags faltando e status fora do enum",
    steps: [
      D("upsert-phase", "--phase", "business", "--status", "done"),
      D("upsert-phase", "--global", "--initiative", "gf-alfa", "--phase", "business", "--status", "done"),
      D("upsert-phase", "--global", "--status", "done"),
      D("upsert-phase", "--global", "--phase", "business"),
      D("upsert-phase", "--global", "--phase", "business", "--status", "feito"),
    ],
  },
  {
    id: "ds-bug06-bloco-sombra-alias",
    title: "upsert-phase com o id do agente (sprint-planner) atualiza o bloco canônico (sprint-plan), sem bloco-sombra (BUG-06 corrigido na F3.1)",
    fixture: { "ws/.github/artifacts/delivery-state.yaml": "initiative_id: default\nphases:\n  bdd:\n    status: done\n  sprint-plan:\n    status: in-progress\n" },
    steps: [D("upsert-phase", "--global", "--phase", "sprint-planner", "--status", "done")],
  },
  {
    id: "ds-bug15-agent-com-aspas",
    title: "--agent com aspas é escapado: YAML válido com ok:true (BUG-15 corrigido na F3.1)",
    steps: [D("upsert-phase", "--global", "--phase", "qa", "--status", "done", "--agent", 'qa "lead"')],
  },
  {
    id: "ds-bug27-indentacao-4-espacos",
    title: "arquivo indentado com 4 espaços: a fase é achada e gravada na indentação do arquivo (BUG-27)",
    fixture: { "ws/.github/artifacts/delivery-state.yaml": "phases:\n    business:\n        status: in-progress\n" },
    steps: [D("upsert-phase", "--global", "--phase", "business", "--status", "done")],
  },
  {
    id: "ds-crlf-mistura-eol",
    title: "arquivo com CRLF: só a linha reescrita perde o \\r (EOL misto)",
    fixture: { "ws/.github/artifacts/delivery-state.yaml": "phases:\r\n  business:\r\n    status: pending\r\n" },
    steps: [D("upsert-phase", "--global", "--phase", "business", "--status", "done")],
  },
  {
    id: "ds-path-traversal-initiative",
    title: "id que vira caminho (--initiative, create/switch-active --id) com '..', '/' ou '\\' é recusado com USAGE (A20)",
    steps: [
      D("upsert-phase", "--initiative", "../../../../fora-do-workspace", "--phase", "business", "--status", "done"),
      D("upsert-checklist", "--initiative", "..\\..\\fora-do-workspace", "--phase", "business", "--item", "x", "--checked", "true"),
      D("upsert-phase", "--initiative", "..", "--phase", "business", "--status", "done"),
      I("create", "--id", "../fora-do-workspace"),
      I("switch-active", "--id", "gf-alfa/../../fora"),
    ],
  },
  {
    id: "ds-regex-injecao-phase",
    title: "--phase fora de [A-Za-z0-9_-] (metacaractere de regex, ':', espaço) é recusado com USAGE e o arquivo fica intacto (M2)",
    fixture: { "ws/.github/artifacts/delivery-state.yaml": DS_COM_FASES },
    steps: [
      D("upsert-phase", "--global", "--phase", "fase(1", "--status", "done"),
      D("upsert-phase", "--global", "--phase", "business|x", "--status", "pending"),
      D("upsert-checklist", "--global", "--phase", "fase[1", "--item", "x", "--checked", "true"),
      D("upsert-phase", "--global", "--phase", "fase: 1", "--status", "done"),
    ],
  },
  {
    id: "ds-lock-orfao-velho",
    title: "lock órfão com mais de 10 s é descartado e a escrita segue",
    fixture: { "ws/.github/artifacts/delivery-state.yaml": DS_COM_FASES },
    staleLock: "ws/.github/artifacts/delivery-state.yaml.lock",
    steps: [D("upsert-phase", "--global", "--phase", "product", "--status", "done")],
  },

  // ---- delivery-state upsert-checklist ---------------------------------
  {
    id: "ds-checklist-arquivo-novo",
    title: "sem arquivo: cria com linha em branco no topo; 2º item na mesma seção; --section checklist cria outra seção",
    steps: [
      D("upsert-checklist", "--global", "--phase", "business", "--item", "problem-section", "--checked", "true"),
      D("upsert-checklist", "--global", "--phase", "business", "--item", "kpi-defined", "--checked", "false"),
      D("upsert-checklist", "--global", "--phase", "business", "--item", "lint-ok", "--checked", "true", "--section", "checklist"),
      D("upsert-checklist", "--global", "--phase", "business", "--item", "kpi-defined", "--checked", "true"),
    ],
  },
  {
    id: "ds-checklist-alias",
    title: "--phase canônica (sprint-plan) acha o bloco escrito com o id do agente (sprint-planner)",
    fixture: { "ws/.github/artifacts/initiatives/gf-alfa/delivery-state.yaml": "phases:\n  sprint-planner:\n    status: in-progress\n" },
    steps: [D("upsert-checklist", "--initiative", "gf-alfa", "--phase", "sprint-plan", "--item", "backlog-ok", "--checked", "true")],
  },
  {
    id: "ds-checklist-validacoes",
    title: "--checked aceita só 'true'/'false' (case-sensitive); flags obrigatórias; sem escopo",
    steps: [
      D("upsert-checklist", "--global", "--phase", "business", "--item", "x", "--checked", "True"),
      D("upsert-checklist", "--global", "--phase", "business", "--item", "x", "--checked", "yes"),
      D("upsert-checklist", "--global", "--phase", "business", "--item", "x"),
      D("upsert-checklist", "--global", "--phase", "business", "--checked", "true"),
      D("upsert-checklist", "--phase", "business", "--item", "x", "--checked", "true"),
    ],
  },
  {
    id: "ds-bug15-checklist-item-e-secao",
    title: "--item com ': ' é escapado; --section status (chave duplicada) é recusado com INTERNAL, sem gravar (BUG-15 corrigido na F3.1)",
    fixture: { "ws/.github/artifacts/initiatives/gf-alfa/delivery-state.yaml": "phases:\n  qa:\n    status: in-progress\n" },
    steps: [
      D("upsert-checklist", "--global", "--phase", "qa", "--item", "testes: ok", "--checked", "true"),
      D("upsert-checklist", "--initiative", "gf-alfa", "--phase", "qa", "--item", "x", "--checked", "true", "--section", "status"),
    ],
  },

  // ---- kb (removido na F2.1) ---------------------------------------------
  // O Modo Online e o `kb push` saíram da v1 (ADR-0015). `kb` passa a ser um
  // artefato desconhecido: nada é lido, nem dentro nem fora do workspace.
  {
    id: "kb-removido",
    title: "kb não é mais artefato (Modo Online fora da v1): UNKNOWN_ARTIFACT, sem ler o arquivo, nem com --path ../",
    fixture: { "ws/docs/adr/0001-ficticio.md": "# ADR fictício\n", "fora-do-workspace.txt": "conteúdo fora do workspace\n" },
    steps: [
      K("push", "--path", "docs/adr/0001-ficticio.md", "--initiative", "gf-alfa", "--epic", "E1", "--wave", "W1"),
      K("push", "--path", "../fora-do-workspace.txt", "--initiative", "gf-alfa"),
    ],
  },

  // ---- defeitos transversais ---------------------------------------------
  {
    id: "bug32-cwd-subdiretorio",
    title: "rodar de um subdiretório cria um registro paralelo ali dentro",
    knownBug: "BUG-32: a raiz do CLI é process.cwd()",
    fixture: { "ws/repos/app-ficticio/README.md": "# repo fictício\n" },
    steps: [{ argv: ["initiatives", "create", "--id", "gf-alfa"], cwd: "ws/repos/app-ficticio" }],
  },
  {
    id: "bug04-parseargs-sem-envelope",
    title: "--help, flag desconhecida, flag sem valor, --bool=valor e posicional extra dão USAGE no envelope JSON, exit 1 (A15 / BUG-04)",
    steps: [
      I("create", "--help"),
      I("create", "--id"),
      I("create", "--id", "x", "--active=true"),
      I("create", "--id", "x", "extra"),
      I("switch-active", "--help"),
      I("bump-phase", "--id", "x", "--phase", "y", "--bogus"),
      I("upsert-wave-item", "--help"),
      I("upsert-wave-item", "--id", "x", "--wave", "w", "--item", "i", "--status", "s", "--requires-approval=true"),
      D("upsert-phase", "--help"),
      D("upsert-checklist", "--global", "--phase", "p", "--item", "i", "--checked"),
    ],
  },

  // ---- leitura (G2, ADR-0024 proposta) ----------------------------------
  {
    id: "leitura-initiatives-e-delivery-state",
    title: "initiatives get (tudo e por id), delivery-state get (inteiro, por fase, alias), e os erros de id, escopo e fase",
    fixture: { "ws/.github/artifacts/initiatives.yaml": INITIATIVES_COM_COMENTARIOS, "ws/.github/artifacts/delivery-state.yaml": DS_COM_FASES },
    steps: [
      I("get"),
      I("get", "--id", "mod-beta"),
      I("get", "--id", "nao-existe"),
      D("get", "--global"),
      D("get", "--global", "--phase", "product"),
      D("get", "--global", "--phase", "qa"),
      D("get"),
    ],
  },

  // ---- status de trabalho (F6.5, ADR-0022) --------------------------------
  {
    id: "status-de-trabalho",
    title: "blocked/failed/cancelled exigem --reason; o motivo sai quando o trabalho volta; item de onda sem texto livre; iniciativa cancelada",
    fixture: { "ws/.github/artifacts/initiatives.yaml": INITIATIVES_COM_COMENTARIOS, "ws/.github/artifacts/delivery-state.yaml": DS_COM_FASES },
    steps: [
      D("upsert-phase", "--global", "--phase", "product", "--status", "blocked"),
      D("upsert-phase", "--global", "--phase", "product", "--status", "blocked", "--reason", "falta o PRD revisado"),
      D("upsert-phase", "--global", "--phase", "product", "--status", "in-progress"),
      I("upsert-wave-item", "--id", "mod-beta", "--wave", "wave-1", "--item", "item-1", "--status", "finished"),
      I("upsert-wave-item", "--id", "mod-beta", "--wave", "wave-1", "--item", "item-1", "--status", "failed", "--reason", "suíte de integração quebrou"),
      I("upsert-wave-item", "--id", "mod-beta", "--wave", "wave-1", "--item", "item-2", "--status", "cancelled"),
      I("create", "--id", "gf-alfa", "--status", "cancelled"),
      I("create", "--id", "gf-alfa", "--status", "cancelled", "--reason", "a prioridade mudou"),
    ],
  },

  // ---- gates (G2, ADR-0024) ----------------------------------------------
  // Desde as decisões do titular (2026-11-15): quem aprova é o user.name do git (aqui, o .gitconfig
  // do HOME do sandbox), --by é sobrescrita, e D1/D2 têm regra de fechamento.
  {
    id: "gates-get-e-approve",
    title: "gates get e approve de D1 (por repo), D2 e D3 (por iniciativa), com --approved-at fixo, quem aprova vindo do git, e os erros",
    fixture: {
      "ws/.github/artifacts/initiatives.yaml": INITIATIVES_GATES,
      "ws/.github/artifacts/assessment/foundation-state.yaml": FOUNDATION_API_FECHADO,
      "home/.gitconfig": GITCONFIG_FICTICIO,
    },
    steps: [
      G("get", "--gate", "d2", "--initiative", "gf-alfa"),
      G("approve", "--gate", "d2", "--initiative", "gf-alfa", "--approved-at", "2026-11-15T12:00:00.000Z", "--by", "Outra Pessoa", "--note", "roadmap revisado"),
      G("approve", "--gate", "d3", "--initiative", "mod-beta", "--approved-at", "2026-11-15T13:00:00.000Z"),
      G("approve", "--gate", "d1", "--repo", "api", "--approved-at", "2026-11-15T14:00:00.000Z"),
      G("get", "--gate", "d1", "--repo", "api"),
      G("approve", "--gate", "d4", "--initiative", "gf-alfa"),
      G("approve", "--gate", "d1"),
      G("approve", "--gate", "d1", "--repo", "web"),
      G("approve", "--gate", "d3", "--initiative", "nao-existe"),
      G("remove"),
    ],
  },
  {
    id: "gates-aprovador-e-fechamento",
    title: "sem user.name no git a aprovação pede --by; D1 com fase aberta e D2 sem roadmap e matriz de risco são recusados com o que falta; design não conta sem frontend",
    fixture: {
      "ws/.github/artifacts/initiatives.yaml": INITIATIVES_GATES,
      "ws/.github/artifacts/assessment/foundation-state.yaml": FOUNDATION_FECHAMENTO,
      "ws/.github/artifacts/repos.yaml": REPOS_FECHAMENTO,
    },
    steps: [
      G("approve", "--gate", "d2", "--initiative", "gf-alfa"),
      G("approve", "--gate", "d2", "--initiative", "mod-beta", "--by", "Pessoa Fictícia"),
      G("approve", "--gate", "d1", "--repo", "web", "--by", "Pessoa Fictícia"),
      G("approve", "--gate", "d1", "--repo", "worker", "--by", "Pessoa Fictícia", "--approved-at", "2026-11-15T15:00:00.000Z"),
      G("approve", "--gate", "d2", "--initiative", "gf-alfa", "--by", "Pessoa Fictícia", "--approved-at", "2026-11-15T16:00:00.000Z"),
    ],
  },

  // ---- runs (F5.2, contrato agent-activity; fecha o H-GAP-02) ----------
  {
    id: "runs-append",
    title: "runs append grava eventos de agente em runs/<iniciativa>.jsonl (flags do contrato, em snake_case e com hífen); recusa decisão humana, caminho fora do workspace e iniciativa que não é nome de arquivo",
    steps: [
      R("append", "--event_type", "agent-started", "--agent_id", "@migration-agent", "--phase_id", "execution", "--initiative_id", "gf-alfa", "--harness", "claude-code", "--run_id", "r-golden", "--timestamp", "2026-11-15T12:00:00.000Z"),
      R("append", "--event-type", "artifact-written", "--artifact-path", ".github/artifacts/execution/relatorio.md", "--initiative-id", "gf-alfa", "--agent-id", "@migration-agent", "--run-id", "r-golden", "--timestamp", "2026-11-15T12:01:00.000Z"),
      R("append", "--event_type", "decision-requested", "--initiative_id", "gf-alfa", "--task_id", "epic-0/task-0.1", "--actor", "human", "--message", "titularidade do código", "--reason", "titularidade", "--run_id", "r-golden", "--timestamp", "2026-11-15T12:02:00.000Z"),
      R("append", "--event_type", "blocked", "--agent_id", "@ws", "--run_id", "r-golden", "--timestamp", "2026-11-15T12:03:00.000Z"),
      R("append", "--event_type", "gate-approved", "--initiative_id", "gf-alfa"),
      R("append", "--event_type", "artifact-written", "--artifact_path", "../fora/segredo.txt"),
      R("append", "--event_type", "agent-started", "--initiative_id", "../fora"),
      R("append", "--event_type", "agent-started", "--harness", "cursor"),
      R("append", "--agent_id", "@sem-tipo"),
      R("remove"),
    ],
  },
];
