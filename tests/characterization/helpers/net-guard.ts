/**
 * net-guard.ts — trava de rede para as suítes da F0.4 (lane B).
 *
 * Regra: nenhuma chamada sai da máquina. Várias god files fazem `fetch`
 * escondido (telemetria `ApiSyncClient.push`, registry `RegistryClient`), e o
 * default de `helyx.apiUrl` aponta para um backend proprietário. Este guard
 * substitui o `fetch` global: loopback (`127.0.0.1`/`localhost`, o State
 * Service local) passa para o `fetch` real; qualquer outro destino é GRAVADO
 * (vira efeito observável no golden — ex.: "tentou POST de telemetria") e
 * respondido pelo `route` do teste ou rejeitado como offline.
 */

import { vi } from "vitest";

export interface BlockedRequest {
  url: string;
  method: string;
  body?: unknown;
}

export interface NetGuard {
  /** Tentativas a destinos externos, na ordem. */
  blocked: BlockedRequest[];
  restore(): void;
}

export type ExternalRoute = (req: BlockedRequest) => { status: number; json: unknown } | undefined;

function isLoopback(url: string): boolean {
  return /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//.test(url);
}

export function installNetGuard(route?: ExternalRoute): NetGuard {
  const realFetch = globalThis.fetch;
  const blocked: BlockedRequest[] = [];

  const guarded = async (input: unknown, init?: { method?: string; body?: unknown }): Promise<unknown> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : String((input as { url?: string }).url ?? input);
    if (isLoopback(url)) return realFetch(input as Parameters<typeof fetch>[0], init as Parameters<typeof fetch>[1]);

    let body: unknown = undefined;
    if (typeof init?.body === "string") {
      try {
        body = JSON.parse(init.body);
      } catch {
        body = init.body;
      }
    }
    const req: BlockedRequest = { url, method: init?.method ?? "GET", ...(body !== undefined ? { body } : {}) };
    blocked.push(req);

    const answer = route?.(req);
    if (!answer) throw new TypeError(`fetch failed (net-guard: rede externa bloqueada — ${url})`);
    return {
      ok: answer.status >= 200 && answer.status < 300,
      status: answer.status,
      statusText: String(answer.status),
      json: async () => answer.json,
    };
  };

  vi.stubGlobal("fetch", guarded);
  return {
    blocked,
    restore: () => {
      vi.unstubAllGlobals();
    },
  };
}
