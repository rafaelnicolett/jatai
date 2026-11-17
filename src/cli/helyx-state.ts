#!/usr/bin/env node
/**
 * helyx-state.ts — entry point do CLI determinístico de escrita de estado.
 *
 * Agentes de IA chamam isto via Bash (`node .github/scripts/helyx-state.cjs
 * <artefato> <verbo> --flags`) em vez de editar `initiatives.yaml`/
 * `delivery-state.yaml`/etc. manualmente com Read/Edit. Bundlado num único
 * `.cjs` via esbuild (ver `npm run build:cli`) — zero dependência de runtime
 * no projeto do usuário, roda com o `node` que já vem com o Claude Code.
 *
 * Contrato: a raiz do workspace é a pasta do projeto que o Claude Code
 * informa (`CLAUDE_PROJECT_DIR`, quando existe: os hooks do kit chamam o CLI
 * de qualquer subpasta) ou, fora dele, a pasta de onde o CLI roda
 * (`process.cwd()`). Sempre imprime UMA linha JSON no stdout
 * (`lib/cli-io.ts`), nunca lança pra
 * fora — qualquer erro inesperado vira `{ok:false, error:{code:"INTERNAL"}}`
 * com exit 2, erro de uso/validação vira exit 1, sucesso exit 0.
 *
 * Cobertura atual (v1 — Wave 1 do rollout): `delivery-state` e `initiatives`,
 * os dois artefatos que causam a maior parte da divergência de status
 * observada no dashboard hoje. `gates` (G2, ADR-0024) e `runs` (F5.2, os
 * eventos de atividade de agente, contrato agent-activity) vieram depois.
 * `sprint-backlog` e `foundation-state` ficam para uma v2 — os agentes que
 * escrevem esses dois ainda editam o YAML diretamente até lá (ver
 * `workspace-tools/SKILL.md`).
 *
 * O artefato `kb` (`kb push`, espelho para o `helyx-cloud-api` no Modo
 * Online) saiu da v1 aberta, que é 100% local (ADR-0015). Um espelho remoto
 * volta, se voltar, pela porta `RemoteSyncProvider`.
 */

import { runDeliveryStateCommand } from "./commands/delivery-state";
import { runInitiativesCommand } from "./commands/initiatives";
import { runGatesCommand } from "./commands/gates";
import { runRunsCommand } from "./commands/runs";
import { printInternalError, printUsageError } from "./lib/cli-io";
import { BRAND } from "../data/brand.pure";

const KNOWN_ARTIFACTS = ["delivery-state", "initiatives", "gates", "runs"] as const;

/** Motivo legível de cada erro do `parseArgs` (`code` estável do Node desde a 18). */
const PARSE_ARGS_REASONS: Record<string, string> = {
  ERR_PARSE_ARGS_UNKNOWN_OPTION: "flag desconhecida para",
  ERR_PARSE_ARGS_INVALID_OPTION_VALUE: "flag sem valor, ou com valor numa flag booleana, em",
  ERR_PARSE_ARGS_UNEXPECTED_POSITIONAL: "argumento posicional não aceito por",
};

/**
 * Rejeição assíncrona de um comando (A15 / H-BUG-04). Os comandos são
 * `async`, então o `TypeError` do `parseArgs` (flag desconhecida, flag sem
 * valor, `--bool=valor`, posicional extra) virava promise rejeitada sem
 * handler: stack no stderr, stdout vazio, exit 1. Agora erro de parse vira
 * `USAGE` (exit 1) e qualquer outra exceção vira `INTERNAL` (exit 2), sempre
 * no envelope de uma linha. `--help` não existe: a saída é sempre JSON.
 */
function onCommandFailure(artifact: string, verb: string, argv: readonly string[]): (err: unknown) => void {
  return (err) => {
    const code = (err as { code?: unknown } | null)?.code;
    if (typeof code === "string" && code.startsWith("ERR_PARSE_ARGS_")) {
      const context = `'${artifact} ${verb}'`;
      const reason = `${PARSE_ARGS_REASONS[code] ?? "argumentos inválidos para"} ${context}`;
      const wantsHelp = argv.includes("--help") || argv.includes("-h");
      const message = wantsHelp ? `o ${BRAND.cliName} não tem --help: a saída é sempre uma linha JSON (${reason})` : reason;
      printUsageError("USAGE", message, { artifact, verb, reason: code, detail: (err as Error).message });
    } else {
      printInternalError(err);
    }
  };
}

function main(): void {
  const [artifact, verb, ...rest] = process.argv.slice(2);

  if (!artifact || !verb) {
    printUsageError(
      "USAGE",
      `uso: ${BRAND.cliName} <artefato> <verbo> [--flags]. Artefatos disponíveis: ` + KNOWN_ARTIFACTS.join(", "),
      { artifacts: KNOWN_ARTIFACTS }
    );
    return;
  }

  switch (artifact) {
    case "delivery-state":
      // Fire-and-forget deliberado (`void` explícito, convenção do repo): os
      // dois comandos viraram `async` no item 3.1 (tentam o State Service
      // antes do fallback em YAML) mas SEMPRE terminam chamando
      // `printSuccess`/`printUsageError`/`printInternalError`, que encerram
      // o processo — não há nada útil pra `main()` fazer com a promise (e
      // não dá pra `await` aqui: o bundle deste arquivo é CJS, sem
      // top-level await). Qualquer exceção não tratada dentro do comando é
      // responsabilidade do próprio comando converter em
      // `printInternalError` (ver docblock de `commands/*.ts`); o que escapar
      // (ex.: o `parseArgs`, A15) cai em `onCommandFailure`.
      void Promise.resolve(runDeliveryStateCommand(verb, rest)).catch(onCommandFailure(artifact, verb, rest));
      return;
    case "initiatives":
      void Promise.resolve(runInitiativesCommand(verb, rest)).catch(onCommandFailure(artifact, verb, rest));
      return;
    case "gates":
      // G2 (ADR-0024, proposta): leitura e aprovação humana de D1, D2 e D3.
      void Promise.resolve(runGatesCommand(verb, rest)).catch(onCommandFailure(artifact, verb, rest));
      return;
    case "runs":
      // F5.2 (contrato agent-activity, H-GAP-02): eventos de atividade de agente, chamados pelos hooks do kit.
      void Promise.resolve(runRunsCommand(verb, rest)).catch(onCommandFailure(artifact, verb, rest));
      return;
    default:
      printUsageError(
        "UNKNOWN_ARTIFACT",
        `artefato desconhecido: '${artifact}'. Esperado: ${KNOWN_ARTIFACTS.join(", ")}.`,
        { artifact, artifacts: KNOWN_ARTIFACTS }
      );
  }
}

try {
  main();
} catch (err) {
  printInternalError(err);
}
