import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { DecisionRecordResult, GateApprovalResult } from "@shared/cockpit-protocol";
import { DecisionDialog, type DecisionChecklistView } from "../../../design-system/patterns";
import { cockpitStore } from "../../../store/CockpitStore";
import {
  openArtifact,
  requestDecisionRecord,
  requestFoundationGuardRailToggle,
  requestGateApproval,
  requestGuardRailToggle,
  requestPhaseApproval,
  requestSprintItemApproval,
  requestWaveItemApproval,
  talkToAgent,
} from "../../../store/decisionActions";
import type { DecisionRef } from "./decisionRef";
import { deriveDecision, type ChecklistItem } from "./deriveDecision";
import type { ViewContext } from "./viewTarget";

const NOTE = "A resposta fica registrada com o seu nome (o do git) e a data no histórico da iniciativa.";

type Result = GateApprovalResult | DecisionRecordResult;

function failureText(error: { code: string; message: string }): string {
  return error.code === "GATE_NOT_CLOSED" ? `O gate ainda não pode ser aprovado: ${error.message}. Nada foi gravado.` : `Não deu para registrar. ${error.message}. Nada foi gravado.`;
}

/**
 * O fluxo de uma decisão no Cockpit (F4.2): abre o painel para um `DecisionRef`,
 * deriva dele o que mostrar (regra de fechamento, checklist, botão) e leva o
 * clique ao host.
 *
 * - o painel se refaz a cada snapshot: se a decisão deixou de existir (outra
 *   pessoa decidiu, o estado mudou), ele fecha e avisa;
 * - o checklist marcado por quem o host grava (`toggleGuardRail`,
 *   `toggleFoundationGuardRail`) aparece marcado na hora (otimista) e volta a
 *   valer o estado gravado quando o snapshot chega;
 * - gate e decisão esperam a resposta do host (`gates/approve-result`,
 *   `decisions/record-result`): "Registrando…" até ela chegar; sem nome no git,
 *   o painel pede o nome e reenvia com `by`; gate com trabalho aberto mostra
 *   o que falta e nada é gravado;
 * - fase, tarefa e item de sprint usam os verbos que o host já tinha (sem
 *   resposta estruturada): o painel fecha ao enviar e o snapshot mostra o efeito.
 */
export function useDecisionFlow(ctx: ViewContext | null, announce: (text: string) => void): { open: (ref: DecisionRef) => void; node: ReactNode } {
  const [ref, setRef] = useState<DecisionRef | null>(null);
  const [optimistic, setOptimistic] = useState<Record<string, boolean>>({});
  const [acknowledged, setAcknowledged] = useState(false);
  const [text, setText] = useState("");
  const [name, setName] = useState("");
  const [askName, setAskName] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sentSeq = useRef(0);

  // As marcas que a tela já mostra entram na regra do botão: o checklist do host (otimista) e o reconhecimento de risco.
  const overrides = useMemo(() => ({ ...optimistic, ...(acknowledged ? { friction: true } : {}) }), [optimistic, acknowledged]);
  const model = useMemo(() => (ctx && ref ? deriveDecision(ctx, ref, overrides) : null), [ctx, ref, overrides]);

  const close = useCallback((): void => {
    setRef(null);
    setOptimistic({});
    setAcknowledged(false);
    setText("");
    setName("");
    setAskName(false);
    setSubmitting(false);
    setError(null);
    cockpitStore.clearDecisionResult();
  }, []);

  const open = useCallback(
    (next: DecisionRef): void => {
      close();
      setRef(next);
    },
    [close]
  );

  // A resposta do host chega pelo store; reagir aqui, no aviso do store, e não no corpo de um efeito.
  const waiting = submitting && ref !== null;
  useEffect(() => {
    if (!waiting) return;
    return cockpitStore.subscribe(() => {
      const latest = cockpitStore.getSnapshot().decisionResult;
      if (!latest || latest.seq <= sentSeq.current) return;
      const result: Result = latest.result;
      if (result.ok) {
        announce(result.type === "gates/approve-result" ? `Gate ${result.gate.toUpperCase()} aprovado por ${result.by}.` : `Decisão registrada por ${result.by}.`);
        cockpitStore.pushToast({
          id: `decision-${Date.now()}`,
          kind: "gate-approved",
          text: result.type === "gates/approve-result" ? `Gate ${result.gate.toUpperCase()} aprovado por ${result.by}` : `Decisão registrada por ${result.by}`,
          timestamp: new Date().toISOString(),
        });
        close();
        return;
      }
      cockpitStore.clearDecisionResult();
      setSubmitting(false);
      if (result.error.code === "MISSING_FLAG" && result.error.field === "by") {
        setAskName(true);
        setError("O git deste workspace não tem user.name. Diga o nome de quem decide e confirme de novo.");
      } else {
        setError(failureText(result.error));
      }
    });
  }, [waiting, announce, close]);

  // A decisão deixou de existir debaixo do painel (outra pessoa decidiu, o estado mudou): fecha e avisa.
  const gone = ref !== null && model === null && !submitting;
  useEffect(() => {
    if (!gone) return;
    const id = setTimeout(() => {
      announce("Esta decisão já foi tomada. O Cockpit foi atualizado.");
      close();
    }, 0);
    return () => clearTimeout(id);
  }, [gone, announce, close]);

  const checklist = useMemo<DecisionChecklistView[]>(() => {
    if (!model || !ref) return [];
    return model.checklist.map((item: ChecklistItem): DecisionChecklistView => {
      const base = { id: item.id, label: item.label, required: item.required, checked: item.checked, ...(item.hint ? { hint: item.hint } : {}) };
      if (!item.toggle) return base;
      if (item.toggle.via === "local") return { ...base, onToggle: (value: boolean) => setAcknowledged(value) };
      const toggle = item.toggle;
      return {
        ...base,
        onToggle: (value: boolean) => {
          setOptimistic((o) => ({ ...o, [item.id]: value }));
          if (toggle.type === "toggleGuardRail") requestGuardRailToggle(toggle.phaseId, item.id, value);
          else requestFoundationGuardRailToggle(toggle.phaseId, item.id, value);
        },
      };
    });
  }, [model, ref]);

  const submit = (): void => {
    const request = model?.primary?.request;
    if (!model || !request) return;
    const by = askName ? name.trim() : "";
    switch (request.type) {
      case "gates/approve":
        sentSeq.current = cockpitStore.getSnapshot().decisionResult?.seq ?? 0;
        setSubmitting(true);
        setError(null);
        requestGateApproval({ gate: request.gate, ...(request.repoId ? { repoId: request.repoId } : {}), ...(request.initiativeId ? { initiativeId: request.initiativeId } : {}), ...(by ? { by } : {}) });
        return;
      case "decisions/record":
        sentSeq.current = cockpitStore.getSnapshot().decisionResult?.seq ?? 0;
        setSubmitting(true);
        setError(null);
        requestDecisionRecord({ taskId: request.taskId, ...(request.initiativeId ? { initiativeId: request.initiativeId } : {}), ...(request.phaseId ? { phaseId: request.phaseId } : {}), message: text.trim(), ...(by ? { by } : {}) });
        return;
      case "approveAndAdvancePhase":
        requestPhaseApproval(request.phaseId);
        break;
      case "approveWaveItem":
        requestWaveItemApproval({ initiativeId: request.initiativeId, wave: request.wave, item: request.item, acknowledged });
        break;
      case "approveSprintItem":
        requestSprintItemApproval(request.sprintItemId);
        break;
    }
    // Sem resposta estruturada do host: o painel fecha e o snapshot seguinte mostra o efeito (ou o aviso do VS Code, se o host recusar).
    announce(`Pedido enviado: ${model.primary?.label ?? "aprovação"}.`);
    close();
  };

  let node: ReactNode = null;
  if (model) {
    // O que o próprio painel exige antes de enviar, além da regra do gate: o texto da decisão e, se pediu, o nome.
    const disabledReason = model.primary?.disabledReason ?? (model.needsText && text.trim() === "" ? "Diga o que você decidiu" : askName && name.trim() === "" ? "Diga o nome de quem decide" : undefined);
    node = (
      <DecisionDialog
        variant={model.variant}
        eyebrow={model.eyebrow}
        question={model.question}
        context={model.context}
        facts={model.facts}
        checklist={checklist}
        closure={model.closure}
        evidence={model.evidence.map((path) => ({ path, onOpen: () => openArtifact(path) }))}
        primary={model.primary ? { label: model.primary.label, onConfirm: submit, ...(disabledReason ? { disabledReason } : {}) } : null}
        textField={model.needsText ? { label: "O que você decidiu (curto)", value: text, maxLength: 140, onChange: setText } : null}
        nameField={askName ? { value: name, onChange: setName } : null}
        submitting={submitting}
        error={error}
        chatOnly={model.chatOnly}
        onChat={() => {
          talkToAgent(model.chatPrompt);
          close();
        }}
        onClose={close}
        note={NOTE}
      />
    );
  }

  return { open, node };
}
