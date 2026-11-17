/**
 * sprint-backlog-writer.ts
 *
 * Escrita estrutural de `sprint-backlog.yaml` via `yaml` (eemeli) — mesmo
 * motivo de `initiatives-writer.ts`: o arquivo real já foi observado em 4
 * formas diferentes (ver `sprint-backlog-contract.pure.ts`), então um patch
 * regex/linha-a-linha (como `yamlUpsert.ts` faz para `delivery-state.yaml`,
 * que tem shape fixo) ficaria frágil demais. `parseDocument` + `setIn` num nó
 * já existente preserva o resto do arquivo (comentários, formatação,
 * ordenação de chaves) — só o campo `status` do item mexido muda.
 *
 * As 3 formas de array de item conhecidas (`sprints[].items[]` canônica,
 * `items[]` flat, `stories[]` flat) são testadas em ordem — a primeira que
 * contém um item com o `id` procurado vence.
 */

import { parseDocument, isCollection, type Document } from "yaml";

type YamlDoc = Document.Parsed;

function loadDoc(content: string): YamlDoc {
  return parseDocument(content.trim() ? content : "");
}

function seqLength(doc: YamlDoc, path: (string | number)[]): number {
  const node = doc.getIn(path, true);
  return isCollection(node) ? node.items.length : 0;
}

/** Acha o caminho até o item com `id` dado, testando as 3 formas reais de array de item. `null` se não achar em nenhuma. */
function findItemPath(doc: YamlDoc, itemId: string): (string | number)[] | null {
  const sprintsLen = seqLength(doc, ["sprints"]);
  for (let g = 0; g < sprintsLen; g++) {
    const itemsLen = seqLength(doc, ["sprints", g, "items"]);
    for (let i = 0; i < itemsLen; i++) {
      if (doc.getIn(["sprints", g, "items", i, "id"]) === itemId) return ["sprints", g, "items", i];
    }
  }

  const itemsLen = seqLength(doc, ["items"]);
  for (let i = 0; i < itemsLen; i++) {
    if (doc.getIn(["items", i, "id"]) === itemId) return ["items", i];
  }

  const storiesLen = seqLength(doc, ["stories"]);
  for (let i = 0; i < storiesLen; i++) {
    if (doc.getIn(["stories", i, "id"]) === itemId) return ["stories", i];
  }

  return null;
}

/**
 * Upsert de `status` de UM `SprintItem` por `id`, preservando o resto do
 * documento. `found: false` se nenhum item com esse `id` existir em nenhuma
 * das 3 formas conhecidas de array — o chamador decide como reportar isso
 * (nunca escreve um item novo do zero; isso não é um upsert de existência,
 * só de campo).
 */
export function upsertSprintItemStatus(content: string, itemId: string, status: string): { content: string; found: boolean } {
  const doc = loadDoc(content);
  const itemPath = findItemPath(doc, itemId);
  if (!itemPath) return { content, found: false };
  doc.setIn([...itemPath, "status"], doc.createNode(status));
  return { content: String(doc), found: true };
}
