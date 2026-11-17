/**
 * process-capture.ts
 *
 * Suporte compartilhado só para os testes de `tests/cli/` que exercitam
 * `lib/cli-io.ts` e os comandos que dependem dele (`printSuccess`/
 * `printUsageError`/`printInternalError` chamam `process.exit` de verdade e
 * escrevem em `process.stdout` — o contrato inteiro do CLI é "uma linha JSON
 * + exit code", então é isso que capturamos em vez de deixar o teste matar o
 * worker do Vitest).
 *
 * Não é um `*.test.ts` — não roda como suíte própria (`vitest.config.ts` só
 * inclui `tests/**\/*.test.ts`), só é importado pelos arquivos de teste.
 *
 * IMPORTANTE (achado durante o backfill, documentado aqui e não no código-
 * fonte): `helyx-state.ts` (entrypoint) envolve `main()` num
 * `try { main(); } catch (err) { printInternalError(err); }`. Se
 * `process.exit` for mockado pra LANÇAR em vez de matar o processo, esse
 * lançamento sobe pelo `main()` e é recapturado pelo `catch` do próprio
 * módulo, virando um SEGUNDO exit (código INTERNAL) — um artefato do mock,
 * não o comportamento real (no mundo real, `process.exit` nunca devolve
 * controle pro JS). Por isso `helyx-state-entrypoint.test.ts` testa o
 * dispatch do entrypoint com `commands/*` mockados (sem `process.exit`
 * aninhado) e só usa este helper para os dois branches que o próprio
 * `main()` resolve sozinho (USAGE, UNKNOWN_ARTIFACT) — nenhum dos dois
 * aciona um comando aninhado, então não sofre esse artefato.
 */

import { vi } from "vitest";

export class ProcessExitSignal extends Error {
  constructor(public readonly code: number | undefined) {
    super(`process.exit(${code})`);
  }
}

export interface CliCapture<T> {
  /** Valor de retorno de `fn`, se ela retornou sem passar por `process.exit`. */
  result?: T;
  /** Código passado a `process.exit`, se `fn` chegou a chamá-lo. */
  exitCode?: number;
  /** Tudo que foi escrito em `process.stdout.write` durante a chamada, concatenado. */
  stdout: string;
  /** Qualquer erro que NÃO seja o sinal de exit simulado (exceção real do código sob teste). */
  threw?: unknown;
}

/** Roda `fn` capturando `process.stdout.write` e `process.exit` (síncrono). */
export function captureCli<T>(fn: () => T): CliCapture<T> {
  const writes: string[] = [];
  const writeSpy = vi.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
    writes.push(typeof chunk === "string" ? chunk : String(chunk));
    return true;
  });
  const exitSpy = vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
    throw new ProcessExitSignal(code);
  }) as unknown as typeof process.exit);

  try {
    const result = fn();
    return { result, stdout: writes.join("") };
  } catch (err) {
    if (err instanceof ProcessExitSignal) {
      return { exitCode: err.code, stdout: writes.join("") };
    }
    return { threw: err, stdout: writes.join("") };
  } finally {
    writeSpy.mockRestore();
    exitSpy.mockRestore();
  }
}

/** Variante async — necessária pra `import()` dinâmico (usado no teste do entrypoint pra resetar módulos entre cenários). */
export async function captureCliAsync<T>(fn: () => Promise<T>): Promise<CliCapture<T>> {
  const writes: string[] = [];
  const writeSpy = vi.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
    writes.push(typeof chunk === "string" ? chunk : String(chunk));
    return true;
  });
  const exitSpy = vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
    throw new ProcessExitSignal(code);
  }) as unknown as typeof process.exit);

  try {
    const result = await fn();
    return { result, stdout: writes.join("") };
  } catch (err) {
    if (err instanceof ProcessExitSignal) {
      return { exitCode: err.code, stdout: writes.join("") };
    }
    return { threw: err, stdout: writes.join("") };
  } finally {
    writeSpy.mockRestore();
    exitSpy.mockRestore();
  }
}

/** Parseia a única linha JSON esperada no stdout capturado (contrato do CLI: sempre uma linha). */
export function parseJsonLine(stdout: string): unknown {
  return JSON.parse(stdout.trim());
}

/**
 * Variante "passiva" pra `helyx-state.ts` (entrypoint): mocka `process.exit`
 * pra só REGISTRAR o código, sem lançar — necessária porque o módulo
 * envolve `main()` em `try { main(); } catch (err) { printInternalError(err) }`
 * NO PRÓPRIO ARQUIVO. Se `process.exit` lançasse (como em `captureCli`),
 * esse lançamento subiria direto pra esse catch (não tem outro try no meio)
 * e viraria um SEGUNDO exit (INTERNAL) — mascarando qual código de saída o
 * branch realmente produziu. Com um mock passivo, os dois branches diretos
 * de `main()` (USAGE, UNKNOWN_ARTIFACT) chamam `printUsageError` e retornam
 * logo em seguida (`return;` explícito, ou fim do `switch`) sem cair em
 * nenhum código que dependa de o processo já ter morrido — por isso é seguro
 * aqui. Não usar isso pra testar `cli-io.ts`/`commands/*.ts` isoladamente:
 * lá existem chamadas tipo `optionalEnum` que SEGUEM executando depois de um
 * `printUsageError` sem exit de verdade, o que produziria comportamento
 * fabricado pelo mock (não o comportamento real).
 */
export async function captureEntrypointRun(fn: () => Promise<unknown>): Promise<{ stdout: string; exitCodes: number[] }> {
  const writes: string[] = [];
  const exits: number[] = [];
  const writeSpy = vi.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
    writes.push(typeof chunk === "string" ? chunk : String(chunk));
    return true;
  });
  const exitSpy = vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
    exits.push(code ?? 0);
    return undefined as never;
  }) as unknown as typeof process.exit);

  try {
    await fn();
  } finally {
    writeSpy.mockRestore();
    exitSpy.mockRestore();
  }
  return { stdout: writes.join(""), exitCodes: exits };
}
