/**
 * zip-template.ts
 *
 * Renderer do template em zip que uma `TemplateSource` plugada entrega
 * (F3.4, passo 2). As variáveis `{{var}}` e `{{var|filtro}}` vêm do estado do
 * Wizard; o sufixo `.tmpl` sai do nome. Quem valida o destino de cada entrada
 * (zip-slip) é o chamador, com `zipEntryDestination`.
 *
 * A marca do kit (`{{brand.*}}`) é outro renderer: `kit-render.ts`.
 */

import JSZip from "jszip";
import type { WizardState } from "../../types";
import type { GeneratedFile } from "../harness/HarnessAdapter";

export interface TemplateVars {
  project_name: string;
  svc_name: string;
  svc_name_snake: string;
  python_version: string;
  author: string;
}

export function buildVars(state: WizardState): TemplateVars {
  return {
    project_name: state.projectName,
    svc_name: state.projectName,
    svc_name_snake: state.projectName.replace(/-/g, "_"),
    python_version: "3.12",
    author: state.projectName,
  };
}

export function renderTemplate(content: string, vars: TemplateVars): string {
  return content.replace(/\{\{(\w+)(?:\|(\w+))?\}\}/g, (_match, key, filter) => {
    const raw = vars[key as keyof TemplateVars] ?? "";
    if (filter === "snake") return raw.replace(/-/g, "_");
    if (filter === "kebab") return raw.replace(/_/g, "-");
    if (filter === "pascal") return raw.split(/[-_]/).map(capitalize).join("");
    return raw;
  });
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export async function extractAndRender(
  zipBuf: Buffer,
  vars: TemplateVars
): Promise<GeneratedFile[]> {
  const jszip = await JSZip.loadAsync(zipBuf);
  const files: GeneratedFile[] = [];

  for (const [filename, file] of Object.entries(jszip.files)) {
    if (file.dir) continue;

    const rawContent = await file.async("string");
    const content = renderTemplate(rawContent, vars);

    // Strip .tmpl extension if present
    const relativePath = filename.replace(/\.tmpl$/, "");
    files.push({ relativePath, content });
  }

  return files;
}
