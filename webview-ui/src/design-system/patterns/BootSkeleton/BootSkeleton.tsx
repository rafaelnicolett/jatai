import s from "./BootSkeleton.module.css";

/**
 * O que aparece na janela entre o webview montar e o primeiro `shell/snapshot`
 * chegar — evita o flash em branco e evita o operador confundir "ainda
 * carregando" com "nada está rodando".
 */
export function BootSkeleton() {
  return (
    <div className={s.wrap} aria-busy="true" aria-label="Carregando estado do projeto">
      <div className={s.line} style={{ width: "40%" }} />
      <div className={s.line} style={{ width: "70%" }} />
      <div className={s.line} style={{ width: "55%" }} />
      <div className={s.block} />
    </div>
  );
}
