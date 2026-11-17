/**
 * state-service-auth.ts
 *
 * Geração do token Bearer que autentica toda chamada ao State Service HTTP
 * local (item 2.5, roadmap `mod-state-service`). Um valor novo por ativação
 * da extensão (`activate()` chama isto uma vez, guarda o resultado em
 * `context.secrets` como registro canônico — ver `extension.ts` — e também
 * em `server.json`, ver `state-service-info.ts`).
 *
 * Deliberadamente NÃO precisa sobreviver a um restart do VS Code: cada
 * ativação gera um valor novo, e o valor da ativação anterior simplesmente
 * para de autenticar qualquer coisa assim que o servidor daquela ativação é
 * derrubado (`deactivate()`/reload). Não há problema de "token antigo ainda
 * válido" a resolver — não existe rotação, expiração nem revogação ativa
 * porque não existe reuso entre ativações.
 */
import * as crypto from "crypto";

/** Tamanho em bytes da entropia do token (256 bits) — hex dobra o comprimento textual (64 chars). */
const TOKEN_BYTES = 32;

/** Gera um token de auth novo, hex-encoded. Chame uma vez por ativação da extensão. */
export function generateStateServiceToken(): string {
  return crypto.randomBytes(TOKEN_BYTES).toString("hex");
}

/**
 * `true` se o header `Authorization` é exatamente `Bearer <token>` (A16d / L12).
 *
 * Compara em tempo constante: os dois lados viram SHA-256, que têm o mesmo
 * tamanho, então `timingSafeEqual` nunca lança e o tempo não depende nem de
 * onde aparece a primeira diferença nem do tamanho do header recebido.
 */
export function isBearerTokenValid(header: string | undefined, token: string): boolean {
  if (typeof header !== "string") return false;
  const expected = crypto.createHash("sha256").update(`Bearer ${token}`, "utf8").digest();
  const received = crypto.createHash("sha256").update(header, "utf8").digest();
  return crypto.timingSafeEqual(received, expected);
}
