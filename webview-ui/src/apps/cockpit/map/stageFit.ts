import { useEffect, useState, type RefObject } from "react";
import { STAGE } from "./layout";

/**
 * Como o palco de 1440 × 900 cabe na área disponível (F5.3): escalado para
 * caber inteiro (`contain`) e centrado. Posições e alvos escalam juntos,
 * porque tudo mora dentro do mesmo palco; o texto dos rótulos não encolhe
 * (a escala é invertida neles).
 */
export interface StageFit {
  /** Escala do palco para caber na área. */
  k: number;
  /** Deslocamento que centra o palco já escalado. */
  x: number;
  y: number;
}

export function fitStage(width: number, height: number): StageFit {
  if (width <= 0 || height <= 0) return { k: 1, x: 0, y: 0 };
  const k = Math.min(width / STAGE.w, height / STAGE.h);
  return { k, x: (width - STAGE.w * k) / 2, y: (height - STAGE.h * k) / 2 };
}

export interface Size {
  width: number;
  height: number;
}

/**
 * O tamanho do elemento, atualizado quando o painel muda de largura. Sem
 * `ResizeObserver` (testes em jsdom), vale `fallback`.
 */
export function useElementSize(ref: RefObject<HTMLElement | null>, fallback: Size): Size {
  const [size, setSize] = useState<Size>(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = (): void => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) setSize({ width: rect.width, height: rect.height });
    };
    read();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (box && box.width > 0 && box.height > 0) setSize({ width: box.width, height: box.height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return size;
}

/** As faixas de largura do painel (DS v2 §3.12): decidem o feed, a legenda e o painel da ilha. */
export type MapSize = "wide" | "split" | "compact";
export const sizeClass = (width: number): MapSize => (width >= 1080 ? "wide" : width >= 600 ? "split" : "compact");
