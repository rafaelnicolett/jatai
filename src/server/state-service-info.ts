/**
 * state-service-info.ts
 *
 * Ponte de descoberta de porta pro servidor MCP (item 2.4, roadmap
 * `mod-state-service`). `StateServiceServer` roda dentro do Extension Host;
 * a porta escolhida pelo SO hoje só fica em `context.globalState`
 * (`helyx.stateServicePort`), inacessível a um processo Node separado — o
 * servidor MCP é um processo standalone, spawned pelo cliente MCP/host de
 * agente, não pelo VS Code, e não enxerga o `ExtensionContext`.
 *
 * Este módulo é a ponte file-as-state: mesmo padrão já usado no resto do
 * workspace (`.github/artifacts/...`). `StateServiceServer.start()`
 * escreve este arquivo depois de resolver a porta; `.stop()` apaga —
 * ausência do arquivo é o sinal de "serviço não está no ar" pra quem for
 * consumir (o servidor MCP trata isso como erro claro, não exceção).
 *
 * ATENÇÃO — este arquivo carrega o token de auth do State Service (item 2.5,
 * `vscode.SecretStorage` é o registro canônico, ver `extension.ts` e
 * `state-service-auth.ts`). Colocar um segredo num arquivo comum de
 * file-as-state é uma concessão pragmática, não o design ideal: é a única
 * ponte possível pro processo MCP standalone (fora do Extension Host, sem
 * acesso a `SecretStorage`). Mitigado por dois lados — (1) o diretório já
 * está no `.gitignore` do workspace, nunca versionado; (2) o arquivo é
 * criado com permissão owner-only (`0o600`) em sistemas POSIX, tanto via a
 * opção `mode` do `writeFileSync` (aplicada só na criação) quanto via
 * `chmodSync` explícito logo depois (garante o modo mesmo se o arquivo já
 * existisse com permissão diferente). **Limitação conhecida no Windows**:
 * NTFS não usa o modelo de permissão POSIX (owner/group/other rwx) — `mode`
 * e `chmodSync` no Windows só conseguem alternar o atributo somente-leitura
 * (read-only), não restringir leitura a um único usuário do SO. Num
 * ambiente Windows, qualquer processo local rodando com a mesma conta de
 * usuário (não necessáriamente o mesmo processo) ainda consegue ler o
 * arquivo — o mesmo é verdade, na prática, pra qualquer arquivo do
 * workspace hoje; não é uma regressão introduzida aqui, mas o hardening de
 * 0o600 não fecha essa lacuna nesse SO. Ver relatório do item 2.5 para a
 * discussão completa do trade-off.
 */
import * as fs from "fs";
import * as path from "path";
import { BRAND } from "../data/brand.pure";

export const STATE_SERVICE_INFO_PATH = [".github", "artifacts", ".state-service", "server.json"] as const;

/** Permissão owner-only (leitura/escrita) aplicada ao `server.json` em sistemas POSIX — ver nota de segurança acima sobre a limitação no Windows. */
export const STATE_SERVICE_INFO_FILE_MODE = 0o600;

export interface StateServiceInfo {
  port: number;
  pid: number;
  startedAt: string;
  /** Token Bearer exigido por `StateServiceServer` em todo endpoint exceto `/health` (item 2.5). Registro canônico vive em `vscode.SecretStorage`; aqui é a cópia que o processo MCP standalone consegue ler. */
  token: string;
}

export function stateServiceInfoFilePath(root: string): string {
  return path.join(root, ...STATE_SERVICE_INFO_PATH);
}

/**
 * Escreve o arquivo de descoberta — chamado por `StateServiceServer.start()`
 * depois da porta resolvida. Grava com permissão owner-only (`0o600`) em
 * sistemas POSIX: a opção `mode` do `writeFileSync` só é aplicada pelo SO
 * quando o arquivo é criado agora (não se já existia com outro modo), por
 * isso o `chmodSync` explícito logo depois garante o modo em qualquer caso
 * (ex.: um `server.json` órfão de uma ativação anterior que não chegou a
 * rodar `stop()`). No Windows, ambas as chamadas só conseguem alternar o
 * atributo somente-leitura — ver nota de segurança no topo do arquivo.
 */
export function writeStateServiceInfo(root: string, info: StateServiceInfo): void {
  const filePath = stateServiceInfoFilePath(root);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(info, null, 2)}\n`, { encoding: "utf-8", mode: STATE_SERVICE_INFO_FILE_MODE });
  fs.chmodSync(filePath, STATE_SERVICE_INFO_FILE_MODE);
}

/** Apaga o arquivo de descoberta — chamado por `StateServiceServer.stop()`. Idempotente (ENOENT é silencioso). */
export function removeStateServiceInfo(root: string): void {
  const filePath = stateServiceInfoFilePath(root);
  try {
    fs.unlinkSync(filePath);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      console.error(`[${BRAND.name}] falha ao remover ${filePath}:`, err);
    }
  }
}

/** Lê o arquivo de descoberta — usado pelo servidor MCP (processo separado) pra achar a porta do State Service. */
export function readStateServiceInfo(root: string): StateServiceInfo | null {
  const filePath = stateServiceInfoFilePath(root);
  if (!fs.existsSync(filePath)) return null;
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw) as Partial<StateServiceInfo>;
    if (
      typeof parsed.port !== "number" ||
      typeof parsed.pid !== "number" ||
      typeof parsed.startedAt !== "string" ||
      typeof parsed.token !== "string"
    ) {
      return null;
    }
    return { port: parsed.port, pid: parsed.pid, startedAt: parsed.startedAt, token: parsed.token };
  } catch (err) {
    console.error(`[${BRAND.name}] falha ao ler ${filePath}:`, err);
    return null;
  }
}
