/**
 * brand.ts — marca como dado, do lado do golden master.
 *
 * Os goldens de `tests/golden/__golden__/` foram gravados com a marca Helyx.
 * A F1.3 (ADR-0013) troca a marca do código e do kit para Jataí. A promessa
 * do Parallel Run (ADR-0012) é que essa troca mude **só a marca**. A prova é
 * mecânica: a saída nova passa por `normalizeBrand(texto, { from: JATAI, to:
 * HELYX })` e tem que bater byte a byte com o golden.
 *
 * Desde a F1.3 a marca atual é lida do `src/data/brand.json` (`name` →
 * `slug`, `displayName`), a mesma fonte que o código usa. Os outros tokens
 * do brand.json (`<slug>-state`, `<slug>.config.yaml`, `<SLUG>_`, …) são
 * derivados do slug nas duas marcas, então não precisam de `aliases`.
 */
import brandJson from "../../../src/data/brand.json";

export interface BrandSpec {
  /** Nome de exibição, com acento se houver: "Helyx", "Jataí". */
  readonly displayName: string;
  /** Forma ASCII minúscula usada em ids, comandos e arquivos: "helyx", "jatai". */
  readonly slug: string;
  /**
   * Pares extras por chave semântica (ex.: `{ cliName: "helyx-state" }`).
   * Só entram na troca quando as DUAS marcas declaram a mesma chave, e têm
   * prioridade sobre os tokens derivados. Ponto de extensão para a F1.3; vazio hoje.
   */
  readonly aliases?: Readonly<Record<string, string>>;
}

/** Marca com que os goldens foram gravados. Nunca muda sem regravar tudo. */
export const HELYX_BRAND: BrandSpec = { displayName: "Helyx", slug: "helyx" };

/**
 * Rascunho da marca nova a partir da ADR-0013 (nome "Jataí", ids ASCII
 * "jatai"). A F1.3 confere contra o `brand.json` antes de ligar.
 */
export const JATAI_BRAND_DRAFT: BrandSpec = { displayName: "Jataí", slug: "jatai" };

/** Marca em que os goldens estão gravados. */
export const GOLDEN_BRAND: BrandSpec = HELYX_BRAND;

/**
 * Marca que o código sob teste emite: a do `brand.json`. Enquanto for igual a
 * `GOLDEN_BRAND`, toda normalização de marca é identidade.
 */
export const CURRENT_BRAND: BrandSpec = { displayName: brandJson.displayName, slug: brandJson.name };

export interface BrandNormalization {
  readonly from?: BrandSpec;
  readonly to?: BrandSpec;
}

/** A normalização que o harness aplica em toda saída: da marca atual para a do golden. */
export function currentBrandNormalization(): BrandNormalization {
  return { from: CURRENT_BRAND, to: GOLDEN_BRAND };
}

function sameBrand(a: BrandSpec, b: BrandSpec): boolean {
  if (a.displayName !== b.displayName || a.slug !== b.slug) return false;
  const ka = Object.keys(a.aliases ?? {}).sort();
  const kb = Object.keys(b.aliases ?? {}).sort();
  if (ka.length !== kb.length) return false;
  return ka.every((k, i) => k === kb[i] && a.aliases?.[k] === b.aliases?.[k]);
}

/** `true` quando a normalização não muda nada (sem marcas, ou de uma marca para ela mesma). */
export function isIdentityBrand(opts?: BrandNormalization): boolean {
  return !opts?.from || !opts.to || sameBrand(opts.from, opts.to);
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Tokens de uma marca, na ordem de prioridade usada para desempatar quando
 * dois tokens da origem são a mesma string (ex.: em Helyx, "Helyx" é ao mesmo
 * tempo o nome de exibição e o slug capitalizado).
 */
function brandTokens(brand: BrandSpec): Array<[kind: string, token: string]> {
  return [
    ["displayName", brand.displayName],
    ["slugCapitalized", capitalize(brand.slug)],
    ["slug", brand.slug],
    ["slugUpper", brand.slug.toUpperCase()],
    ["displayLower", brand.displayName.toLowerCase()],
    ["displayUpper", brand.displayName.toUpperCase()],
  ];
}

const pairCache = new Map<string, Array<[string, string]>>();

/**
 * Pares `[de, para]` da troca, sem duplicata de origem. Para cada token, entra
 * também a forma NFD (acento decomposto), para "Jataí" casar nas duas formas
 * Unicode sem precisar normalizar o texto inteiro, o que alteraria bytes que
 * não são de marca.
 */
function replacementPairs(from: BrandSpec, to: BrandSpec): Array<[string, string]> {
  const cacheKey = JSON.stringify([from, to]);
  const cached = pairCache.get(cacheKey);
  if (cached) return cached;

  const pairs = new Map<string, string>();
  const add = (source: string, target: string): void => {
    for (const variant of new Set([source.normalize("NFC"), source.normalize("NFD")])) {
      if (variant === "" || pairs.has(variant)) continue; // o primeiro (mais prioritário) vence
      pairs.set(variant, target);
    }
  };
  for (const key of Object.keys(from.aliases ?? {}).sort()) {
    const target = to.aliases?.[key];
    const source = from.aliases?.[key];
    if (source !== undefined && target !== undefined) add(source, target);
  }
  const targetByKind = new Map(brandTokens(to));
  for (const [kind, token] of brandTokens(from)) {
    add(token, targetByKind.get(kind) ?? token);
  }
  // Mais longo primeiro: na mesma posição, o token maior vence na alternância da regex.
  const list = [...pairs.entries()].filter(([a, b]) => a !== b).sort((x, y) => y[0].length - x[0].length || (x[0] < y[0] ? -1 : 1));
  pairCache.set(cacheKey, list);
  return list;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Troca os tokens da marca `from` pelos da marca `to`, preservando a forma
 * (minúscula, MAIÚSCULA, Capitalizada, nome de exibição). Vale para conteúdo
 * e para paths: `helyx.config.yaml`, `@helyx`, `/helyx`, `HELYX_`,
 * `helyx-state.cjs`, `.helyx-tmp-`, `helyx.agent.md`, `helyx-template-`.
 *
 * - Sem `from`/`to`, ou com as duas marcas iguais: devolve o texto intacto.
 * - Uma passada só (alternância de regex), então uma troca nunca é trocada de novo.
 * - Casamento por substring, sem fronteira de palavra: `HelyxConfigSchema` também conta.
 */
export function normalizeBrand(text: string, opts?: BrandNormalization): string {
  if (isIdentityBrand(opts) || !opts?.from || !opts.to) return text;
  const pairs = replacementPairs(opts.from, opts.to);
  if (pairs.length === 0) return text;
  const lookup = new Map(pairs);
  const re = new RegExp(pairs.map(([source]) => escapeRegExp(source)).join("|"), "g");
  return text.replace(re, (match) => lookup.get(match) ?? match);
}

/**
 * Leva um valor da marca atual para a marca do golden: string, ou lista/objeto
 * simples com strings (valores e chaves). É o que mantém válidos os snapshots
 * e as listas pinadas gravados com a Helyx depois da troca de marca (F1.3): a
 * única diferença permitida é a marca (ADR-0012, Parallel Run). Outros tipos
 * passam intactos.
 */
export function toGoldenBrand<T>(value: T): T {
  const opts = currentBrandNormalization();
  if (isIdentityBrand(opts)) return value;
  const walk = (v: unknown): unknown => {
    if (typeof v === "string") return normalizeBrand(v, opts);
    if (Array.isArray(v)) return v.map(walk);
    if (v !== null && typeof v === "object" && Object.getPrototypeOf(v) === Object.prototype) {
      return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [normalizeBrand(k, opts), walk(x)]));
    }
    return v;
  };
  return walk(value) as T;
}

/**
 * Serializador de snapshot do vitest que grava toda string (valor ou chave)
 * na marca do golden. Com ele, um `toMatchSnapshot()` gravado com a Helyx
 * continua valendo depois da troca de marca, e só a marca pode ter mudado.
 * Uso: `expect.addSnapshotSerializer(goldenBrandSnapshotSerializer)`.
 */
export const goldenBrandSnapshotSerializer = {
  test(value: unknown): boolean {
    return typeof value === "string" && normalizeBrand(value, currentBrandNormalization()) !== value;
  },
  serialize(value: unknown, config: unknown, indentation: string, depth: number, refs: unknown, printer: (v: unknown, ...rest: unknown[]) => string): string {
    return printer(normalizeBrand(value as string, currentBrandNormalization()), config, indentation, depth, refs);
  },
};
