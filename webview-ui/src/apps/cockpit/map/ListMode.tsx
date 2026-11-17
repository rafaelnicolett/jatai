import type { ColmeiaBridge, ColmeiaGuard, ColmeiaVM, IslandDetail } from "@data";
import { StatusGlyph } from "../../../design-system/primitives";
import { islandEyebrow } from "./copy";
import { IslandDetailBody } from "./IslandDetailBody";
import { LiveFeed } from "./LiveFeed";
import s from "./ListMode.module.css";

interface ListProps {
  vm: ColmeiaVM;
  details: IslandDetail[];
  onOpenFile: (relPath: string) => void;
  onOpenDecision: (guard: ColmeiaGuard) => void;
  paused: boolean;
}

/** "Gate D1 aprovado" ou "Gate D3 por construir": o gate que liga esta ilha à vizinha, em texto. */
function gateLine(gate: ColmeiaBridge, direction: "before" | "after"): string {
  const state = gate.state === "approved" ? "aprovado" : "por construir";
  return direction === "before" ? `Chega pelo gate ${gate.gate}, ${state}` : `Sai pelo gate ${gate.gate}, ${state}`;
}

/**
 * O modo lista (R10, DS v2 §4.8): a mesma iniciativa, com as mesmas
 * informações da cena, como uma lista de streams na ordem do fluxo. Cada item
 * tem o nome, o estado, o gate antes e depois e o MESMO corpo do painel da ilha
 * (quem trabalha, guardas, entregas, checklist). Abaixo vem a atividade
 * recente completa. É o padrão com leitor de tela e em painel estreito.
 */
export function ListMode({ vm, details, onOpenFile, onOpenDecision, paused }: ListProps) {
  return (
    <div className={s.wrap} data-list>
      <ol className={s.list} aria-label="Etapas da iniciativa">
        {details.map((detail) => {
          const before = vm.bridges.find((b) => b.to === detail.islandId);
          const after = vm.bridges.find((b) => b.from === detail.islandId);
          const eyebrow = islandEyebrow(detail, after);
          return (
            <li key={detail.islandId} className={s.item} data-list-island={detail.islandId} data-state={detail.state}>
              <header className={s.header}>
                <h2 className={s.title}>{detail.label}</h2>
                <span className={s.chip} data-tone={eyebrow.status}>
                  <StatusGlyph status={eyebrow.status} size={14} color="inherit" />
                  {eyebrow.text}
                </span>
              </header>
              {(before || after) && (
                <p className={s.gates}>
                  {before && <span data-gate-line>{gateLine(before, "before")}</span>}
                  {after && <span data-gate-line>{gateLine(after, "after")}</span>}
                </p>
              )}
              <IslandDetailBody detail={detail} gateAfter={after} onOpenFile={onOpenFile} onOpenDecision={onOpenDecision} />
            </li>
          );
        })}
      </ol>
      <LiveFeed feed={vm.feed} guards={vm.guards} limit={8} title="Atividade recente" paused={paused} />
    </div>
  );
}
