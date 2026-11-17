/**
 * Produtor de eventos em processo separado, para o cenário "Produtores gravando
 * ao mesmo tempo não perdem eventos" (eventos-de-atividade.feature). Bundlado
 * com esbuild pelo arquivo de steps e rodado com `node <bundle> <root>
 * <produtor> <quantidade>`. Grava as linhas grandes de propósito (mensagem e
 * motivo no teto de 140 caracteres), para uma intercalação de bytes aparecer
 * se o lock falhar.
 */
import { appendRunEvent } from "../../../src/state/runs/run-event-log";

async function main(): Promise<void> {
  const [root, producer, count] = process.argv.slice(2);
  for (let i = 0; i < Number(count); i++) {
    const result = await appendRunEvent(root!, {
      run_id: `r-${producer}`,
      event_type: "agent-progress",
      timestamp: new Date().toISOString(),
      initiative_id: "mod-x",
      agent_id: `@produtor-${producer}`,
      message: `${producer}:${i}:`.padEnd(140, "x"),
      metadata: { reason: "r".repeat(140), count: i },
    });
    if (!result.ok) {
      process.stderr.write(JSON.stringify(result.error));
      process.exit(1);
    }
  }
}

main().catch((err) => {
  process.stderr.write(String(err));
  process.exit(2);
});
