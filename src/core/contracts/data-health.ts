/**
 * data-health.ts
 *
 * Canal de degradação dos loaders de `src/data/`.
 *
 * Hoje, toda falha de leitura/parse dos 8 módulos vai só para
 * `console.error` — visível no devtools do Extension Host, invisível na tela.
 * Isso viola a diretriz do projeto: o dashboard nunca pode mostrar estado
 * obsoleto ou inventado sem avisar. `onError` é o parâmetro opcional que cada
 * loader passa a aceitar para reportar `{source, message}` além do
 * `console.error` que já faziam — nunca dispara para arquivo simplesmente
 * ausente (isso é "ainda não começou", não degradado).
 *
 * Zero `fs`/`path` — pura, segura para o bundle do webview.
 */

export interface DataSourceIssue {
  /** Qual dos 8 módulos falhou — usado para o dedupe/roteamento do Shell. */
  source: string;
  message: string;
}

export type OnDataIssue = (issue: DataSourceIssue) => void;
