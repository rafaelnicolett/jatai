/**
 * cockpitModel.ts — tudo o que a tela do Cockpit mostra, derivado de uma vez
 * do snapshot e da visão escolhida: o contexto da iniciativa vista, a trilha,
 * o quadro, o "Agora" e os gates. É a composição das funções puras de `view/`;
 * o componente só desenha e a casca (o sino da barra) lê as mesmas decisões.
 */
import type { CockpitSnapshot } from "@shared/cockpit-protocol";
import { deriveAgora, type AgoraModel } from "./deriveAgora";
import { deriveBoard, type BoardModel } from "./deriveBoard";
import { deriveGates, type GatesModel } from "./deriveGates";
import { deriveTrack, type TrackModel } from "./deriveTrack";
import { buildViewContext, type ViewContext, type ViewTarget } from "./viewTarget";

export interface CockpitModel {
  ctx: ViewContext;
  track: TrackModel;
  board: BoardModel;
  agora: AgoraModel;
  gates: GatesModel;
}

export function buildCockpitModel(snapshot: CockpitSnapshot, target: ViewTarget, selectedStop: string | null): CockpitModel {
  const ctx = buildViewContext(snapshot, target);
  const track = deriveTrack(ctx, selectedStop);
  return { ctx, track, board: deriveBoard(ctx, track), agora: deriveAgora(ctx, track), gates: deriveGates(ctx, track) };
}
