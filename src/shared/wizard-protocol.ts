/**
 * wizard-protocol.ts
 *
 * Contrato de mensagens entre o Extension Host e o webview do Wizard
 * (arquitetura-e-refatoracao.md §3.2, passo WZ1; ADR-0019). O protocolo é
 * congelado: a caracterização W0 (`tests/characterization/wizard-controller…`)
 * e o contrato `tests/contract/wizard-protocol.contract.test.ts` pinam os dois
 * sentidos, e a paridade com o app React do Wizard (W4) é medida contra ele.
 *
 * Mesmo desenho do `cockpit-protocol.ts`: vive em `src/shared/` porque nenhum
 * dos lados é dono, e todo import é `import type` (zero runtime), para o
 * bundle do webview poder importar este arquivo.
 */

import type { HostAdapter, TemplateManifest, WizardStatePartial, WizardStep } from "../types";

export type { HostAdapter, TemplateManifest, WizardStatePartial, WizardStep };

/**
 * Bootstrap do painel: o host escreve este objeto em JSON num
 * `<script type="application/json" id="hx-boot">` (W2, F3.10). O script
 * legado e o app React leem o mesmo bloco.
 */
export interface WizardBoot {
  schema: readonly WizardStep[];
  state: WizardStatePartial;
  brownfield: boolean;
  brand: { displayName: string; templatePrefix: string };
  /**
   * Pastas abertas no editor (aditivo, F4.3): `folder` é a primeira, onde o
   * projeto novo nasce quando a pessoa não escolhe outro lugar, e `null` sem
   * pasta aberta; `folderCount` > 1 é a janela com mais de uma pasta (a v1
   * usa uma por janela). Ausente: o host não informou.
   */
  workspace?: { folder: string | null; folderCount: number };
  /**
   * O host já trocou de modo a pedido da pessoa (`switchToBrownfield` ou
   * `switchToGreenfield`), então o painel re-renderizado reabre depois da
   * escolha do modo, e não na abertura (aditivo, F4.3). Ausente: não.
   */
  modeChosen?: boolean;
}

/** Webview → host. */
export type WizardMessage =
  /** Um campo por vez (e `resolvedTemplate` depois do manifest). O host faz merge raso no estado. */
  | { type: "stepUpdate"; payload: WizardStatePartial }
  /** Abre o seletor de pasta; o host responde `folderPicked` se o usuário escolher. */
  | { type: "pickFolder" }
  /** Pede o manifest do template (`<templatePrefix><backendStack>`); o host responde `templateManifest`. */
  | { type: "fetchTemplate"; templateId: string }
  /**
   * Gera (greenfield) ou instala (brownfield). Erro volta como `validationError` ou `generationError`;
   * sucesso fecha o painel. Com `keepOpen` (aditivo, F4.3), o painel fica aberto e o host responde
   * `installed`: é como o Wizard mostra o passo "Pronto" em vez de sumir.
   */
  | { type: "submit"; keepOpen?: boolean }
  | { type: "cancel" }
  /** Declarado, nunca emitido nem tratado (§1.7 / H-GAP-20, pinado como @known-bug no contrato). */
  | { type: "importRepo" }
  /** Troca para o schema brownfield: o host zera o estado e re-renderiza o painel inteiro. */
  | { type: "switchToBrownfield" }
  /**
   * Volta para o schema do projeto novo (aditiva, F4.3 / GAP-20), simétrica a
   * `switchToBrownfield`: o host zera o estado e re-renderiza o painel inteiro.
   * É como quem escolheu "Projeto existente" volta à escolha do modo.
   */
  | { type: "switchToGreenfield" }
  /** Abre o Cockpit (aditiva, F4.3): o botão do passo "Pronto". O host executa o comando de abrir o Cockpit. */
  | { type: "openCockpit" };

/** Origem do manifest mostrada no badge do preview. */
export type TemplateManifestSource = "cache" | "registry" | "local";

/**
 * Host → webview. O script legado também trata `templateError`, que o host
 * nunca envia (§1.7 / H-GAP-20): por isso o tipo não está na união.
 */
export type HostToWizardMessage =
  | { type: "templateManifest"; manifest: TemplateManifest; source: TemplateManifestSource }
  | { type: "folderPicked"; folder: string }
  /** `fieldErrors` do zod (greenfield) ou `{ targetDirectory: [motivo] }` (brownfield). O webview mostra o primeiro. */
  | { type: "validationError"; errors: Record<string, string[] | undefined> }
  | { type: "generationError"; message: string }
  /**
   * A geração ou a instalação terminou e o painel segue aberto (aditiva, F4.3; resposta ao `submit` com
   * `keepOpen`). `folder` é onde a estrutura foi escrita; `folderIsOpen`, se é a pasta aberta no editor
   * (então o Cockpit abre ali; senão a pessoa precisa abrir a pasta antes).
   */
  | { type: "installed"; mode: "greenfield" | "brownfield"; folder: string; hostAdapter: HostAdapter; folderIsOpen: boolean };
