/**
 * cards.ts — os cards do Concierge (F3.7, Extract Function do
 * `ConciergeParticipant.ts`, cluster K5): roteamento, iniciativa ativa,
 * lista de iniciativas, onboarding brownfield, gate HITL e checklist da fase.
 * Desde a ADR-0025 o chat é guia: o card da iniciativa ativa explica o próximo
 * passo e oferece continuar com o agente orquestrador, que aciona o da fase.
 * Escrevem num `ChatSink`; leem o disco só para as âncoras de artefato.
 */

import * as path from "path";
import * as fs from "fs";
import type { WorkspaceState, InitiativeEntry } from "../WorkspaceStateReader";
import { PHASE_CONTRACTS, type GuardRailItem } from "../../core/methodology/phase-contracts";
import { canonicalDeliveryPhaseId, chatPhaseMeta } from "../../core/methodology/phase-catalog.pure";
import { BRAND } from "../../data/brand.pure";
import { NEW_INITIATIVE_PROMPT, PHASE_TEMPLATE, PRIORITY_BADGE, STREAM_ICON } from "../catalog";
import { deliveryEntryOf } from "../hitl/HitlPolicy";
import type { ChatSink } from "./ChatSink";
import type { PhaseAgent } from "../PhaseAgentLoader";

// ── Routing card renderer ────────────────────────────────────────────────────

export function renderRoutingCard(
  stream: ChatSink,
  state: WorkspaceState | null,
  root: string | null,
  /** Persona do agente da fase ativa, se o kit a tiver; alimenta o "Próximo passo". */
  persona: PhaseAgent | null = null
): void {
  // No initiatives → minimal onboarding card
  if (!state || state.initiatives.length === 0) {
    if (state?.mode === "brownfield") {
      renderBrownfieldOnboarding(stream, state);
      return;
    }
    stream.markdown(
      [
        "---",
        `### 🧭 ${BRAND.guide.fullName}`,
        "",
        `> Ainda não há iniciativa. Quem abre a iniciativa e conduz o Business Brief é o agente **${BRAND.participant.name}**: preencha o template abaixo e envie para ele.`,
        "",
        "---",
        "",
      ].join("\n")
    );
    stream.button({ command: `${BRAND.commandPrefix}.openCockpitNext`,                  title: "$(rocket) Abrir Cockpit" });
    stream.button({ command: `${BRAND.commandPrefix}.concierge.startWithTemplate`,  title: "$(edit) Preencher Business Brief", arguments: ["business"] });
    stream.markdown("\n\n");
    return;
  }

  const init = state.activeInitiative;
  if (!init) {
    // Has initiatives but none is active — show list
    renderMultiInitiativeCard(stream, state.initiatives);
    return;
  }

  // Active initiative card
  renderActiveCard(stream, state, init, root, persona);
}

function renderActiveCard(
  stream: ChatSink,
  state: WorkspaceState,
  init: InitiativeEntry,
  root: string | null,
  persona: PhaseAgent | null
): void {
  // Alias-aware (F3.1): current_phase e o bloco do delivery-state podem usar o id do agente.
  const phaseId = canonicalDeliveryPhaseId(init.current_phase);
  const phase   = chatPhaseMeta(phaseId);
  const next    = phase?.next ? chatPhaseMeta(phase.next) : null;
  const phEntry = deliveryEntryOf(state.deliveryState?.phases, init.current_phase);
  const status  = phEntry?.status ?? "pending";
  const humanOk = phEntry?.human_checklist?.["human-ok"] === true;
  const prio    = PRIORITY_BADGE[init.priority ?? ""] ?? "";
  const sIcon   = STREAM_ICON[init.stream] ?? "⚪";

  const statusLabel =
    status === "in-progress"           ? "⏳ em andamento"
    : status === "done" && !humanOk   ? "👁 aguardando revisão"
    : status === "done"               ? "✅ concluída"
    : status === "skipped"            ? "⏭ skipped"
    : "⬜ pendente";

  // Compose table
  const rows = [
    `| ${sIcon} **Stream**  | \`${init.stream}\` |`,
    `| ${phase?.icon ?? "📌"} **Fase**     | \`${init.current_phase}\` — ${phase?.label ?? init.current_phase} |`,
    `| 🤖 **Agente**   | \`${phase?.agent ?? "—"}\` |`,
    `| 📊 **Status**   | ${statusLabel} |`,
    next ? `| ⏩ **Próximo**  | \`${next.agent}\` — ${next.label} |` : null,
    init.owner ? `| 👤 **Owner**    | \`${init.owner}\` |` : null,
  ].filter(Boolean).join("\n");

  const card = [
    "---",
    `### 🧭 \`${init.id}\`  ${prio}`,
    `> ${init.name}`,
    "",
    "| | |",
    "|:---|:---|",
    rows,
    "",
    "---",
    "",
  ].join("\n");

  stream.markdown(card);

  // Action buttons
  stream.button({ command: `${BRAND.commandPrefix}.openCockpitNext`, title: "$(rocket) Cockpit" });

  if (phase && PHASE_TEMPLATE[phaseId]) {
    stream.button({
      command: `${BRAND.commandPrefix}.concierge.startWithTemplate`,
      title: `$(edit) Preencher template → ${phase.agent}`,
      arguments: [phaseId],
    });
  }

  if (status === "done" && !humanOk) {
    stream.button({
      command: `${BRAND.commandPrefix}.openCockpitNext`,
      title: "$(eye) Revisar fase",
    });
  }

  // File anchors — initiative artifact folder
  if (root) {
    const initDir = path.join(root, `.github/artifacts/initiatives/${init.id}`);
    if (fs.existsSync(initDir)) {
      stream.anchor(initDir, `📂 ${init.id}/`);
    }

    // Link individual artifacts that exist
    if (phase?.artifactsExpected) {
      for (const art of phase.artifactsExpected) {
        if (art.endsWith("/")) continue; // skip dirs for anchors
        const perInit = path.join(initDir, art);
        const global  = path.join(root, art);
        const target  = fs.existsSync(perInit) ? perInit : fs.existsSync(global) ? global : null;
        if (target) {
          stream.anchor(target, path.basename(art));
        }
      }
    }
  }

  // ── Interactive HITL checklist (Etapa 1) ─────────────────────────────────
  renderPhaseChecklist(stream, phaseId, phEntry?.human_checklist ?? {});

  // ── Próximo passo e encaminhamento para o agente orquestrador (ADR-0025) ──
  if (phase) renderNextStep(stream, phaseId, phase, persona);

  stream.markdown("\n\n");
}

/**
 * `/continuar` (H-BUG-23): só o próximo passo da fase ativa e o botão para o
 * agente orquestrador. Sem iniciativa ativa com fase conhecida, o card de
 * roteamento de sempre (início ou lista).
 */
export function renderContinueCard(stream: ChatSink, state: WorkspaceState | null, root: string | null, persona: PhaseAgent | null): void {
  const init = state?.activeInitiative;
  const phaseId = init ? canonicalDeliveryPhaseId(init.current_phase) : "";
  const phase = init ? chatPhaseMeta(phaseId) : undefined;
  if (!phase) {
    renderRoutingCard(stream, state, root, persona);
    return;
  }
  stream.markdown(["---", `### ➡️ \`${init!.id}\` — continuar`, `> ${init!.name}`, ""].join("\n"));
  renderNextStep(stream, phaseId, phase, persona);
  stream.markdown("\n\n");
}

/** `/nova` (H-BUG-23): quem abre a iniciativa é o agente orquestrador; o guia oferece o botão. */
export function renderNewInitiativeCard(stream: ChatSink): void {
  stream.markdown(
    [
      "---",
      `### 🧭 ${BRAND.guide.fullName} — nova iniciativa`,
      "",
      `> Quem abre a iniciativa é o agente **${BRAND.participant.name}**: ele pergunta o tipo (feature, modernização ou hotfix), o nome e a prioridade, e grava a entrada em \`initiatives.yaml\`. O botão abaixo leva o pedido até ele.`,
      "",
      "---",
      "",
    ].join("\n")
  );
  stream.button({
    command: `${BRAND.commandPrefix}.concierge.runRawPrompt`,
    title: `$(add) Nova iniciativa com o agente ${BRAND.participant.name}`,
    arguments: [NEW_INITIATIVE_PROMPT],
  });
  stream.markdown("\n\n");
}

/**
 * O que vem agora na fase: quem trabalha, o que entrega e o que falta para a
 * aprovação humana, mais o botão que leva o pedido ao agente orquestrador. O
 * guia não aciona o agente da fase (ADR-0025).
 */
function renderNextStep(
  stream: ChatSink,
  phaseId: string,
  phase: { label: string; agent: string; artifactsExpected?: readonly string[] },
  persona: PhaseAgent | null
): void {
  const delivers = persona?.outputs.length ? persona.outputs : [...(phase.artifactsExpected ?? [])];
  const mandatory = PHASE_CONTRACTS[phaseId]?.guardRailChecklist.filter((i) => i.mandatory).length ?? 0;
  const approval = persona?.exitContract.length
    ? `${persona.exitContract.join("; ")}; e você marca os itens obrigatórios do checklist.`
    : mandatory > 0
      ? `você marca os ${mandatory} itens obrigatórios do checklist acima.`
      : "a aprovação é sua, no checklist ou no Cockpit.";
  stream.markdown(
    [
      "",
      "#### ➡️ Próximo passo",
      `A fase **${phase.label}** está com o agente \`${phase.agent}\`.`,
      delivers.length ? `- **O que ele entrega:** ${delivers.map((d) => `\`${d}\``).join(", ")}` : null,
      `- **Para a fase ser aprovada:** ${approval}`,
      "",
      `Quem aciona o \`${phase.agent}\` é o agente **${BRAND.participant.name}**. Eu sou o guia: mostro o caminho, não aciono agentes nem gravo arquivos.`,
      "",
    ]
      .filter((l): l is string => l !== null)
      .join("\n")
  );
  stream.button({
    command: `${BRAND.commandPrefix}.concierge.continuePhase`,
    title: `$(arrow-right) Continuar com o agente ${BRAND.participant.name}`,
    arguments: [phase.agent],
  });
}

/**
 * Renders a full-screen HITL gate card for a phase that completed without human approval.
 * Blocks the normal routing card and LLM call — the user MUST approve before continuing.
 */
export function renderHitlGateCard(
  stream: ChatSink,
  phaseId: string,
  checklist: Record<string, boolean>,
): void {
  const phase = chatPhaseMeta(phaseId);
  const contract = PHASE_CONTRACTS[phaseId];
  if (!contract) return;

  const mandatoryItems = contract.guardRailChecklist.filter(i => i.mandatory);
  const mandatoryDone  = mandatoryItems.filter(i => checklist[i.id] === true).length;
  const allDone        = mandatoryItems.length > 0 && mandatoryDone === mandatoryItems.length;

  stream.markdown([
    "---",
    `### 🛑 Gate HITL — Aprovação necessária`,
    "",
    `> A fase **${phase?.icon ?? "📌"} \`${phaseId}\`** *(${phase?.label ?? phaseId})* foi concluída pelo agente mas **ainda não foi aprovada pelo humano**.`,
    `> ⚠️ **O fluxo está pausado.** Valide cada item abaixo antes de avançar para a próxima fase.`,
    "",
    `**${mandatoryDone}/${mandatoryItems.length}** itens obrigatórios validados${allDone ? " ✅" : " — valide os itens 🟥 abaixo"}`,
    "",
    "---",
    "",
  ].join("\n"));

  renderPhaseChecklist(stream, phaseId, checklist);
}

export function renderPhaseChecklist(
  stream: ChatSink,
  phaseId: string,
  checklistState: Record<string, boolean>,
): void {
  const contract = PHASE_CONTRACTS[phaseId];
  if (!contract || contract.guardRailChecklist.length === 0) return;

  const items = contract.guardRailChecklist;
  const mandatoryItems = items.filter(i => i.mandatory);
  const mandatoryDone = mandatoryItems.filter(i => checklistState[i.id] === true).length;
  const totalDone = items.filter(i => checklistState[i.id] === true).length;
  const allMandatoryDone = mandatoryItems.length > 0 && mandatoryDone === mandatoryItems.length;
  const humanOk = checklistState["human-ok"] === true;

  const catEmoji: Record<GuardRailItem["category"], string> = {
    artifact: "📄",
    quality:  "✨",
    pattern:  "🚫",
    security: "🔒",
    coverage: "🧪",
    contract: "📜",
  };

  const headerEmoji = humanOk ? "✅" : (allMandatoryDone ? "🎯" : "☑️");
  const lines: string[] = [
    "",
    `#### ${headerEmoji} Checklist da fase \`${phaseId}\``,
    `> **${mandatoryDone}/${mandatoryItems.length}** mandatory ✓ · **${totalDone}/${items.length}** total ✓${humanOk ? " · 👤 humano aprovou" : ""}`,
    "",
  ];
  for (const it of items) {
    const checked = checklistState[it.id] === true;
    const box = checked ? "✅" : (it.mandatory ? "🟥" : "⬜");
    const cat = catEmoji[it.category] ?? "•";
    const opt = it.mandatory ? "" : " *(opcional)*";
    const hint = it.hint ? `<br/>&nbsp;&nbsp;&nbsp;&nbsp;<sub>${it.hint}</sub>` : "";
    lines.push(`- ${box} ${cat} **${it.label}**${opt}${hint}`);
  }
  lines.push("");
  stream.markdown(lines.join("\n"));

  // One toggle button per item (toggles to opposite state).
  for (const it of items) {
    const checked = checklistState[it.id] === true;
    stream.button({
      command: `${BRAND.commandPrefix}.concierge.toggleGuardRail`,
      title: `${checked ? "$(check)" : "$(circle-outline)"} ${_truncate(it.label, 48)}`,
      arguments: [phaseId, it.id, !checked],
    });
  }

  // Advance button — only when all mandatory are checked and not yet approved
  if (allMandatoryDone && !humanOk) {
    stream.markdown(
      "\n> 🎯 **Todos os itens mandatory estão ✓.** Pronto para o humano aprovar a fase.\n\n"
    );
    stream.button({
      command: `${BRAND.commandPrefix}.concierge.advancePhase`,
      title: `$(check-all) Aprovar e avançar fase`,
      arguments: [phaseId],
    });
  }
}

function _truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

function renderMultiInitiativeCard(
  stream: ChatSink,
  initiatives: InitiativeEntry[]
): void {
  const rows = initiatives.map(i => {
    const s = STREAM_ICON[i.stream] ?? "⚪";
    const p = PRIORITY_BADGE[i.priority ?? ""] ?? "—";
    return `| \`${i.id}\` | ${i.name} | ${s} \`${i.stream}\` | \`${i.current_phase}\` | ${p} |`;
  });

  const card = [
    "---",
    `### 🧭 ${BRAND.guide.fullName} — Iniciativas`,
    "",
    "| ID | Nome | Stream | Fase atual | Prioridade |",
    "|:---|:---|:---|:---|:---|",
    ...rows,
    "",
    "> Nenhuma iniciativa marcada como `active`. Defina `active: <id>` em `initiatives.yaml`.",
    "",
    "---",
    "",
  ].join("\n");

  stream.markdown(card);
  stream.button({ command: `${BRAND.commandPrefix}.openCockpitNext`, title: "$(rocket) Cockpit" });
  stream.markdown("\n\n");
}

// ── Brownfield onboarding card ───────────────────────────────────────

function renderBrownfieldOnboarding(
  stream: ChatSink,
  state: WorkspaceState
): void {
  const ready = state.brownfieldAssessmentReady;
  const fwks = state.maturityFrameworks.length
    ? state.maturityFrameworks.map(f => "`" + f + "`").join(", ")
    : "_(nenhum configurado)_";

  stream.markdown(
    [
      "---",
      `### 🏛 ${BRAND.guide.fullName} — modo **brownfield**`,
      "",
      ready
        ? "> **Foundation concluída** (gate F1 ✓). O projeto agora pode receber iniciativas de 3 tipos: nova feature, modernização ou hotfix. Escolha abaixo ou descreva o que quer fazer."
        : "> Estrutura agêntica instalada. Brownfield começa pelo stream **Foundation** — `@assessor` orquestra a engenharia reversa técnica + de negócio (`@business-archeologist`) para gerar o baseline imutável que toda gate posterior vai validar.",
      "",
      `**Frameworks de maturidade configurados:** ${fwks}`,
      "",
      "---",
      "",
    ].join("\n")
  );

  stream.button({ command: `${BRAND.commandPrefix}.openCockpitNext`, title: "$(rocket) Abrir Cockpit" });

  if (!ready) {
    stream.button({
      command: `${BRAND.commandPrefix}.concierge.runRawPrompt`,
      title: "$(law) Iniciar Foundation (@assessor)",
      arguments: [
        `@${BRAND.participant.name} Rode o @assessor neste repositório (stream Foundation). Orquestre @tech-mapper, @arch-discoverer, @domain-extractor, @quality-auditor, @debt-analyst` +
          (state.maturityFrameworks.length ? ", @maturity-assessor" : "") +
          ", @business-archeologist em paralelo. Produza .github/artifacts/assessment/{report.md, business-context.md, stakeholder-interview.md, baseline-metrics.json}.",
      ],
    });
  } else {
    // 3 botoes para os 3 tipos de iniciativa
    stream.button({
      command: `${BRAND.commandPrefix}.concierge.runRawPrompt`,
      title: "$(plus) Nova Feature",
      arguments: [
        `@${BRAND.participant.name} Quero abrir uma iniciativa do tipo \`feature\`. Lê o business-context.md e me ajude a definir um PRD-delta com @product (sem passar por @business — o produto já existe).`,
      ],
    });
    stream.button({
      command: `${BRAND.commandPrefix}.concierge.runRawPrompt`,
      title: "$(tools) Modernização",
      arguments: [
        `@${BRAND.participant.name} Quero abrir uma iniciativa do tipo \`modernization\`. Rode o @modernization-planner usando report.md + baseline-metrics.json para gerar roadmap incremental (Strangler Fig, Expand-Contract).`,
      ],
    });
    stream.button({
      command: `${BRAND.commandPrefix}.concierge.runRawPrompt`,
      title: "$(flame) Hotfix / Incident",
      arguments: [
        `@${BRAND.participant.name} Tenho um incidente em produção. Abre iniciativa do tipo \`hotfix\` e roteie para @incident.`,
      ],
    });
  }

  stream.markdown("\n\n");
}
