/**
 * egress-guard.ts — trava de rede no nível do socket, para o teste de zero
 * egress (F2.1, ADR-0015).
 *
 * O `net-guard` da F0.4 troca só o `fetch` global. Este guard fica um nível
 * abaixo: intercepta `net.Socket.prototype.connect`, por onde passam `fetch`
 * (undici), `http`/`https`, `tls` e `net`, e `dns.lookup`. Conexão para
 * loopback (o State Service em 127.0.0.1) ou socket local (path) passa para
 * o original e é contada. Qualquer outro destino é gravado e o socket é
 * destruído com erro antes de sair da máquina, sem DNS e sem pacote.
 */

import * as net from "net";
// Import default (o objeto do módulo CommonJS): o namespace ESM é congelado e
// não aceita trocar `lookup`.
import dns from "dns";

export interface EgressAttempt {
  kind: "connect" | "dns";
  target: string;
}

export interface EgressGuard {
  /** Tentativas de saída para fora da máquina, na ordem. */
  attempts: EgressAttempt[];
  /** Conexões locais permitidas (loopback ou socket por path). */
  localConnects: number;
  restore(): void;
}

function isLocalHost(host: string | undefined): boolean {
  if (host === undefined || host === "") return true; // default do Node é localhost
  const h = host.replace(/^\[|\]$/g, "").toLowerCase();
  return h === "localhost" || h === "::1" || h === "0.0.0.0" || /^127\./.test(h) || /^::ffff:127\./.test(h);
}

interface ConnectTarget {
  path?: string;
  host?: string;
  port?: unknown;
}

/** Destino de `Socket.prototype.connect(...)`, nas três formas aceitas pelo Node (opções normalizadas, porta/host ou path). */
function targetOf(args: unknown[]): ConnectTarget {
  const first = Array.isArray(args[0]) ? (args[0] as unknown[])[0] : args[0];
  if (typeof first === "string") return { path: first };
  if (typeof first === "number") return { port: first, host: typeof args[1] === "string" ? args[1] : undefined };
  if (first && typeof first === "object") {
    const o = first as { path?: unknown; host?: string; port?: unknown };
    // Mesma regra do `net`: é socket local (pipe) só se `path` for string não vazia.
    // O `http` passa `path: null` nas opções de uma conexão TCP.
    const pipe = typeof o.path === "string" && o.path !== "" ? o.path : undefined;
    return { path: pipe, host: o.host, port: o.port };
  }
  return {};
}

export function installEgressGuard(): EgressGuard {
  const attempts: EgressAttempt[] = [];
  const guard: EgressGuard = { attempts, localConnects: 0, restore: () => undefined };

  const originalConnect = net.Socket.prototype.connect;
  net.Socket.prototype.connect = function patchedConnect(this: net.Socket, ...args: unknown[]): net.Socket {
    const t = targetOf(args);
    if (t.path !== undefined || isLocalHost(t.host)) {
      guard.localConnects++;
      return (originalConnect as (...a: unknown[]) => net.Socket).apply(this, args);
    }
    attempts.push({ kind: "connect", target: `${t.host}:${String(t.port)}` });
    // setImmediate (não nextTick): dá tempo de quem abriu o socket (http, undici)
    // registrar o listener de erro antes do destroy, como numa falha real.
    setImmediate(() => this.destroy(new Error(`egress-guard: conexão de saída bloqueada para ${t.host}:${String(t.port)}`)));
    return this;
  } as typeof net.Socket.prototype.connect;

  const originalLookup = dns.lookup;
  const patchedLookup = function (hostname: string, ...rest: unknown[]): void {
    if (isLocalHost(hostname)) {
      (originalLookup as (...a: unknown[]) => void)(hostname, ...rest);
      return;
    }
    attempts.push({ kind: "dns", target: hostname });
    const callback = rest[rest.length - 1];
    if (typeof callback === "function") {
      const err = Object.assign(new Error(`egress-guard: DNS bloqueado para ${hostname}`), { code: "ENOTFOUND" });
      process.nextTick(() => (callback as (e: Error) => void)(err));
    }
  };
  (dns as { lookup: unknown }).lookup = patchedLookup;

  const originalPromisesLookup = dns.promises.lookup;
  (dns.promises as { lookup: unknown }).lookup = (hostname: string, ...rest: unknown[]): Promise<unknown> => {
    if (isLocalHost(hostname)) return (originalPromisesLookup as (...a: unknown[]) => Promise<unknown>)(hostname, ...rest);
    attempts.push({ kind: "dns", target: hostname });
    return Promise.reject(Object.assign(new Error(`egress-guard: DNS bloqueado para ${hostname}`), { code: "ENOTFOUND" }));
  };

  guard.restore = () => {
    net.Socket.prototype.connect = originalConnect;
    (dns as { lookup: unknown }).lookup = originalLookup;
    (dns.promises as { lookup: unknown }).lookup = originalPromisesLookup;
  };
  return guard;
}
