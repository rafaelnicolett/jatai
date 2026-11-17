/**
 * Fitness functions de fronteira do webview (ADR-0016, F3.9 da
 * mod-missao-open-source), como regras locais de ESLint:
 *
 * - `ds-is-leaf`: o design system (`src/design-system/**`) é folha. Não
 *   importa `store/`, `features/`, `apps/` nem os pontos de entrada. Pode
 *   importar só a si mesmo, o núcleo (`@data`, `@shared`) e pacotes npm.
 * - `no-cross-feature`: uma feature (`src/features/<nome>/**`) não importa
 *   outra feature nem um app. O que é compartilhado vai para o design system
 *   ou para o `store/`; quem compõe features é o app (`src/apps/<app>/**`).
 *
 * A ADR-0016 prevê dependency-cruiser para as fitness functions do pacote
 * inteiro. Enquanto ele não existe no repositório, as duas regras do webview
 * vivem aqui, sem dependência nova, e rodam no `npm run lint:webview` (CI e
 * ci:local). Ao integrar o dependency-cruiser, elas podem migrar para lá.
 *
 * Toda aresta conta, inclusive `import type` e `export … from`: uma
 * dependência de tipo também amarra as camadas.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

const WEBVIEW_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(WEBVIEW_ROOT, "src");

/** Caminho absoluto do alvo de um import, ou `null` se não é código do webview (pacote npm, `@data`, `@shared`). */
function resolveTarget(fromFile, specifier) {
  if (specifier.startsWith("./") || specifier.startsWith("../")) {
    return path.resolve(path.dirname(fromFile), specifier);
  }
  if (specifier.startsWith("@/")) return path.join(SRC, specifier.slice(2));
  return null;
}

/** Primeiro segmento sob `src/` (`design-system`, `features`, `store`, `apps`, `main.tsx`…) e o segundo, quando houver. */
function layerOf(absPath) {
  const rel = path.relative(SRC, absPath);
  if (rel.startsWith("..") || path.isAbsolute(rel)) return null;
  const [top, second] = rel.split(path.sep);
  return { top, second };
}

function importSources(context, check) {
  const visit = (node) => {
    if (node.source && typeof node.source.value === "string") check(node, node.source.value);
  };
  return {
    ImportDeclaration: visit,
    ExportNamedDeclaration: visit,
    ExportAllDeclaration: visit,
    ImportExpression: visit,
  };
}

const dsIsLeaf = {
  meta: {
    type: "problem",
    docs: { description: "O design system é folha: não importa store/, features/, apps/ nem os pontos de entrada" },
    schema: [],
    messages: {
      forbidden: "design-system não pode importar '{{target}}' ({{layer}}): o design system é folha (ds-is-leaf, ADR-0016). Passe o dado ou o callback por props.",
    },
  },
  create(context) {
    const filename = context.filename;
    const from = layerOf(filename);
    if (!from || from.top !== "design-system") return {};
    return importSources(context, (node, specifier) => {
      const target = resolveTarget(filename, specifier);
      if (!target) return;
      const to = layerOf(target);
      if (!to) {
        context.report({ node: node.source, messageId: "forbidden", data: { target: specifier, layer: "fora de src/" } });
        return;
      }
      if (to.top !== "design-system") {
        context.report({ node: node.source, messageId: "forbidden", data: { target: specifier, layer: `src/${to.top}` } });
      }
    });
  },
};

const noCrossFeature = {
  meta: {
    type: "problem",
    docs: { description: "Uma feature não importa outra feature nem um app" },
    schema: [],
    messages: {
      crossFeature: "features/{{from}} não pode importar features/{{to}} (no-cross-feature, ADR-0016). Compartilhado vai para design-system/ ou store/; quem compõe features é o app.",
      upward: "features/{{from}} não pode importar src/{{to}} (no-cross-feature, ADR-0016): o app compõe as features, nunca o contrário.",
    },
  },
  create(context) {
    const filename = context.filename;
    const from = layerOf(filename);
    if (!from || from.top !== "features" || !from.second) return {};
    return importSources(context, (node, specifier) => {
      const target = resolveTarget(filename, specifier);
      if (!target) return;
      const to = layerOf(target);
      if (!to) return;
      if (to.top === "features" && to.second !== from.second) {
        context.report({ node: node.source, messageId: "crossFeature", data: { from: from.second, to: to.second } });
      } else if (to.top === "apps" || to.top === "main.tsx" || to.top === "mock-main.tsx") {
        context.report({ node: node.source, messageId: "upward", data: { from: from.second, to: to.top } });
      }
    });
  },
};

export default {
  meta: { name: "webview-boundaries" },
  rules: {
    "ds-is-leaf": dsIsLeaf,
    "no-cross-feature": noCrossFeature,
  },
};
