import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import type { ColmeiaBridge, ColmeiaGuard, IslandDetail } from "@data";
import { Button, StatusGlyph } from "../../../design-system/primitives";
import { islandEyebrow } from "./copy";
import { IslandDetailBody } from "./IslandDetailBody";
import s from "./IslandPanel.module.css";

interface PanelProps {
  detail: IslandDetail;
  gateAfter?: ColmeiaBridge;
  onClose: () => void;
  onOpenFile: (relPath: string) => void;
  onOpenDecision: (guard: ColmeiaGuard) => void;
}

/**
 * O painel da ilha (DS v2 §4.8): uma região não modal ao lado da cena, com o
 * status, o nome, quem trabalha ali, as entregas e o que falta para o gate.
 * Ao abrir, o foco vai para o título (para o leitor de tela ler primeiro onde
 * está); Esc fecha e devolve o foco à ilha (quem trata é a vista). O mapa só
 * acompanha: "Abrir a decisão" leva ao Cockpit e não registra nada.
 */
export function IslandPanel({ detail, gateAfter, onClose, onOpenFile, onOpenDecision }: PanelProps) {
  const title = useRef<HTMLHeadingElement>(null);
  const eyebrow = islandEyebrow(detail, gateAfter);

  useEffect(() => {
    title.current?.focus();
  }, [detail.islandId]);

  return (
    <aside id="island-panel" className={s.panel} role="region" aria-labelledby="island-panel-title" data-panel={detail.islandId}>
      <header className={s.header}>
        <div className={s.heading}>
          <span className={s.eyebrow} data-tone={eyebrow.status} data-panel-status>
            <StatusGlyph status={eyebrow.status} size={14} color="inherit" />
            {eyebrow.text}
          </span>
          <h2 id="island-panel-title" ref={title} tabIndex={-1} className={s.title}>
            {detail.label}
          </h2>
        </div>
        <Button variant="icon" aria-label="Fechar detalhes da ilha" onClick={onClose}>
          <X size={16} strokeWidth={2} aria-hidden="true" />
        </Button>
      </header>
      <IslandDetailBody detail={detail} gateAfter={gateAfter} onOpenFile={onOpenFile} onOpenDecision={onOpenDecision} />
    </aside>
  );
}
