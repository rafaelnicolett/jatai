import { Compass, Hexagon, Plus, Search } from "lucide-react";
import type { CockpitNotification, HelyxConfig, InitiativesState } from "@shared/cockpit-protocol";
import { BRAND } from "@data";
import { JataiMark } from "../../../../design-system/brand/JataiMark";
import { KIND_ICON } from "../../../../design-system/initiativeKindIcons";
import { Button } from "../../../../design-system/primitives";
import { postMessage } from "../../../../store/vscodeApi";
import type { ViewTarget } from "../../view/viewTarget";
import { NotificationCenter } from "../NotificationCenter/NotificationCenter";
import { InitiativeSwitcher, type SwitcherOption } from "./InitiativeSwitcher";
import { initiativeKindLabel, initiativeMeta } from "./initiativeSummary";
import { commandShortcutLabel } from "./commandShortcut";
import s from "./ContextBar.module.css";

interface ContextBarProps {
  config: HelyxConfig | null;
  /** Ver `isBrownfieldWorkspace`: o menu só oferece a Descoberta no workspace brownfield. */
  isBrownfield: boolean;
  initiatives: InitiativesState | null;
  /** O que a tela mostra: o seletor marca essa. */
  target: ViewTarget | null;
  /** Escolher é só visão (G15): nunca troca o `active:` do registro. */
  onSelectTarget: (target: ViewTarget) => void;
  /**
   * O botão "Mapa". A frente do Mapa (F5.3) liga a troca de visão; até lá o
   * botão existe, é focável e não faz nada.
   */
  onOpenMap?: () => void;
  onOpenCommands: () => void;
  notifications: CockpitNotification[];
  notificationsLastSeenAt: string | null;
  /** Decisões que esperam o operador: o sino ganha o ponto e o nome diz quantas. */
  pendingDecisions: number;
  /** Instalado e atual, quando o kit está desatualizado: o aviso mora na central de notificações. */
  kitNotice: { installed: string; current: string } | null;
  /**
   * Já chegou um snapshot. Sem ele (conectando, sem pasta, sem resposta) a barra não oferece
   * "Nova iniciativa": a página diz a ÚNICA ação possível e a barra não compete com ela.
   */
  connected?: boolean;
}

const DISCOVERY_KEY = "discovery";
const initiativeKey = (id: string): string => `initiative:${id}`;

/**
 * AppBar do DS v2 (§4.1), no lugar do ContextBar antigo: a marca, o seletor de
 * iniciativa, o botão "Mapa", a busca (⌘K) e as notificações. Sem
 * `StatChips`, sem o botão do portal e sem "Atualizar" (que vai para o ⌘K).
 *
 * `<header>` único da vista. O glifo da marca tem nome ("Jataí"), mas não é
 * título. O botão "Mapa" é `<button>` porque troca de vista; o valor padrão de
 * `onOpenMap` é uma função vazia.
 */
export function ContextBar({ config, isBrownfield, initiatives, target, onSelectTarget, onOpenMap = () => undefined, onOpenCommands, notifications, notificationsLastSeenAt, pendingDecisions, kitNotice, connected = true }: ContextBarProps) {
  const viewed = target?.kind === "initiative" ? initiatives?.initiatives.find((i) => i.id === target.id) : undefined;
  const hasChoices = isBrownfield || (initiatives?.initiatives.length ?? 0) > 0;

  const options: SwitcherOption[] = [
    ...(isBrownfield ? [{ key: DISCOVERY_KEY, label: "Descoberta", meta: "Foundation · workspace inteiro", icon: Compass, section: "Workspace" }] : []),
    ...(initiatives?.initiatives ?? []).map((i) => ({ key: initiativeKey(i.id), label: i.name, meta: initiativeMeta(i), icon: KIND_ICON[i.type ?? "feature"], section: "Iniciativas" })),
  ];

  const label = target?.kind === "discovery" ? "Descoberta" : (viewed?.name ?? "Sem iniciativa");
  const Icon = target?.kind === "discovery" ? Compass : KIND_ICON[viewed?.type ?? "feature"];
  const isActive = !!viewed && viewed.id === initiatives?.active;
  const accessibleName =
    target?.kind === "discovery"
      ? "Iniciativa: Descoberta do workspace"
      : viewed
        ? `Iniciativa: ${viewed.name}, ${initiativeKindLabel(viewed.type).toLowerCase()}, ${isActive ? "ativa" : "não é a ativa"}`
        : "Iniciativa: nenhuma";

  const shortcut = commandShortcutLabel(typeof navigator === "undefined" ? "" : navigator.platform || navigator.userAgent);

  return (
    <header className={s.bar}>
      <div className={s.brand}>
        <JataiMark size={26} wordmark />
      </div>
      <span className={s.sep} aria-hidden="true" />

      {hasChoices ? (
        <InitiativeSwitcher
          label={label}
          meta={viewed ? initiativeMeta(viewed) : undefined}
          icon={Icon}
          accessibleName={accessibleName}
          options={options}
          activeKey={target?.kind === "discovery" ? DISCOVERY_KEY : viewed ? initiativeKey(viewed.id) : null}
          onSelect={(key) => onSelectTarget(key === DISCOVERY_KEY ? { kind: "discovery" } : { kind: "initiative", id: key.slice("initiative:".length) })}
          onNew={() => postMessage({ type: "newInitiative" })}
        />
      ) : (
        // Sem iniciativa: o seletor vira o chamado (DS v2 §4.1, estado "empty"), mas só com estado conhecido.
        <>
          <span className={s.project}>{config?.project.name ?? BRAND.displayName}</span>
          {connected && (
            <Button variant="accent" icon={<Plus size={16} strokeWidth={2.5} aria-hidden="true" />} onClick={() => postMessage({ type: "newInitiative" })}>
              Nova iniciativa
            </Button>
          )}
        </>
      )}

      <div className={s.spacer} />

      <div className={s.actions}>
        <Button variant="accent" icon={<Hexagon size={18} strokeWidth={1.8} aria-hidden="true" />} onClick={onOpenMap}>
          Mapa
        </Button>
        <Button variant="command" icon={<Search size={18} strokeWidth={1.8} aria-hidden="true" />} kbd={shortcut} aria-label="Buscar e comandos" aria-keyshortcuts="Meta+K Control+K" onClick={onOpenCommands} />
        <NotificationCenter notifications={notifications} lastSeenAt={notificationsLastSeenAt} pendingDecisions={pendingDecisions} kitNotice={kitNotice} />
      </div>
    </header>
  );
}
