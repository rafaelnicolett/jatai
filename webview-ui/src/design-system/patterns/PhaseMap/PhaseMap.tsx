import type { PlanItemStatus } from "@data";
import s from "./PhaseMap.module.css";

export interface MapNode {
  /** Identifica o nó de forma única — vira `selectedKey`. Já é `PlanItem.key` na prática. */
  key: string;
  /** Rótulo curto embaixo do nó. */
  label: string;
  status: PlanItemStatus;
  kind?: "phase" | "gate";
}

interface PhaseMapProps {
  nodes: MapNode[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
  /** Rótulo acessível do mapa (ex.: nome do repositório, quando há um mapa por repo). */
  ariaLabel?: string;
}

/**
 * Mapa horizontal compacto: um nó por fase/gate, conectado por linha,
 * clicável — controla o que aparece no `PhaseBoard` abaixo. Nunca decide
 * o que é um nó nem o que ele significa — isso é responsabilidade de quem
 * chama (`planItemsToMapNodes` + os adapters por formato de iniciativa).
 */
export function PhaseMap({ nodes, selectedKey, onSelect, ariaLabel }: PhaseMapProps) {
  return (
    <div className={s.wrap} role="tablist" aria-label={ariaLabel ?? "Mapa de fases"}>
      {nodes.map((node, i) => {
        const isSelected = node.key === selectedKey;
        const isDone = node.status === "done";
        const isLive = node.status === "running" || node.status === "review";
        const prevDone = i > 0 && nodes[i - 1]!.status === "done";
        return (
          <div key={node.key} className={s.item}>
            {i > 0 && <div className={[s.line, prevDone && s["line--done"]].filter(Boolean).join(" ")} />}
            <button
              type="button"
              role="tab"
              aria-selected={isSelected}
              className={[
                s.node,
                s[`node--${node.status}`],
                isSelected && s["node--selected"],
                node.kind === "gate" && s["node--gate"],
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={() => onSelect(node.key)}
              title={node.label}
            >
              <span className={[s.dot, isLive && "hx-pulse"].filter(Boolean).join(" ")}>
                {isDone ? "✓" : node.kind === "gate" ? "⚑" : ""}
              </span>
              <span className={[s.label, isSelected && s["label--selected"]].filter(Boolean).join(" ")}>
                {node.label}
              </span>
            </button>
          </div>
        );
      })}
    </div>
  );
}
