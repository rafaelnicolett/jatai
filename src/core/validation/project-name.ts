/**
 * project-name.ts — a regra do nome do projeto novo (H-BUG-20, F4.3).
 *
 * É a mesma do `WizardStateSchema` (`src/types.ts`): de 1 a 63 caracteres,
 * só `[a-z0-9-]`. Vive no core porque o host (que valida no envio) e o
 * webview (que valida em linha, a cada digitação) precisam da MESMA regra:
 * antes só o host a conhecia, e um nome inválido só era recusado no último
 * passo, com "projectName: Invalid". Puro: sem I/O, importável pelo bundle
 * do webview (`webview-safe.ts`).
 */

export const PROJECT_NAME_MAX = 63;
export const PROJECT_NAME_PATTERN = /^[a-z0-9-]+$/;

export type ProjectNameCheck = { ok: true; value: string } | { ok: false; reason: string; suggestion: string | null };

/**
 * Nome válido mais próximo do que a pessoa digitou: sem acento, em minúsculas,
 * com hífen no lugar de qualquer sequência de caracteres fora de `[a-z0-9]`.
 * Vazio quando não sobra nada aproveitável.
 */
export function slugifyProjectName(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, PROJECT_NAME_MAX)
    .replace(/-+$/g, "");
}

/** Confere `raw` como está (quem chama aplica o `trim`, como o fluxo do Wizard faz). */
export function validateProjectName(raw: string): ProjectNameCheck {
  if (raw === "") return { ok: false, reason: "Informe o nome do projeto.", suggestion: null };
  const suggestion = slugifyProjectName(raw) || null;
  if (raw.length > PROJECT_NAME_MAX) {
    return { ok: false, reason: `O nome tem no máximo ${PROJECT_NAME_MAX} caracteres.`, suggestion };
  }
  if (!PROJECT_NAME_PATTERN.test(raw)) {
    return { ok: false, reason: "O nome só aceita letras minúsculas, números e hífen.", suggestion };
  }
  return { ok: true, value: raw };
}
