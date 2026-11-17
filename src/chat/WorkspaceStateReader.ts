import * as fs from "fs";
import * as path from "path";
import { parseInitiativesYaml, readActiveInitiativeId } from "../data/initiatives-contract.pure";
import { findConfigPath, readProjectMode } from "../data/kit-version";
import { FOUNDATION_CONTRACTS } from "../data/foundation-contracts";

export interface InitiativeEntry {
  id: string;
  name: string;
  /** Valores esperados: "planned" | "in-progress" | "done" | "paused" — regex tolera qualquer string. */
  status: string;
  /** Valores esperados: "upstream" | "downstream" | "operation" | "foundation" — regex tolera qualquer string. */
  stream: string;
  /** Valores esperados: "foundation" | "feature" | "modernization" | "hotfix" — regex tolera qualquer string. */
  type?: string;
  current_phase: string;
  owner?: string;
  /** Valores esperados: "P0" | "P1" | "P2" — regex tolera qualquer string. */
  priority?: string;
  created_at?: string;
}

export interface PhaseEntry {
  /** Valores esperados: "pending" | "in-progress" | "done" | "skipped" — regex tolera qualquer string. */
  status: string;
  agent?: string;
  completed_at?: string;
  human_checklist?: Record<string, boolean>;
}

export interface DeliveryState {
  initiative_id?: string;
  phases: Record<string, PhaseEntry>;
}

export interface WorkspaceState {
  initiatives: InitiativeEntry[];
  activeId: string | null;
  activeInitiative: InitiativeEntry | null;
  deliveryState: DeliveryState | null;
  artifactsExist: string[];
  mode: "greenfield" | "brownfield" | null;
  maturityFrameworks: string[];
  brownfieldAssessmentReady: boolean;
}

/**
 * Reads Helyx workspace artefacts from disk (sync, no YAML library dependency).
 * Initiatives come from the same parser as the Cockpit; the rest is simple regex parsing.
 */
export class WorkspaceStateReader {
  constructor(private readonly root: string) {}

  read(): WorkspaceState {
    const state: WorkspaceState = {
      initiatives: [],
      activeId: null,
      activeInitiative: null,
      deliveryState: null,
      artifactsExist: [],
      mode: null,
      maturityFrameworks: [],
      brownfieldAssessmentReady: false,
    };

    try {
      this._readConfig(state);
      this._readInitiatives(state);
      if (state.activeId) {
        this._readDeliveryState(state);
      }
      this._scanArtifacts(state);
      this._detectBrownfieldAssessment(state);
    } catch {
      // return partial state on any error
    }

    return state;
  }

  // ── Config do workspace (mode + maturity frameworks) ──────────────────────

  private _readConfig(state: WorkspaceState): void {
    // L3 / H-BUG-22: o config vive na raiz (o da marca ou um nome legado); o
    // modo vem da mesma regra do aviso de kit e do migrateKit (`readProjectMode`).
    // `.github/ai-sdk.config.yaml` fica só como último recurso, onde o chat
    // sempre procurou.
    const rootConfig = findConfigPath(this.root);
    const cfgPath = rootConfig ?? path.join(this.root, ".github/ai-sdk.config.yaml");
    if (!fs.existsSync(cfgPath)) return;
    const raw = fs.readFileSync(cfgPath, "utf-8");

    if (rootConfig) {
      state.mode = readProjectMode(this.root);
    } else {
      const modeMatch = raw.match(/^\s+mode:\s*(greenfield|brownfield)/m);
      if (modeMatch) state.mode = modeMatch[1] as "greenfield" | "brownfield";
    }

    // assessment.maturity_frameworks: [a, b, c] or YAML list block
    const inlineList = raw.match(/maturity_frameworks:\s*\[([^\]]*)\]/);
    if (inlineList) {
      state.maturityFrameworks = inlineList[1]!
        .split(",")
        .map(s => s.trim().replace(/^["']|["']$/g, ""))
        .filter(Boolean);
    } else {
      const blockMatch = raw.match(/maturity_frameworks:\s*\n((?:\s+-\s+\S+\n?)+)/);
      if (blockMatch) {
        state.maturityFrameworks = blockMatch[1]!
          .split("\n")
          .map(l => l.match(/-\s+(\S+)/)?.[1])
          .filter((v): v is string => Boolean(v));
      }
    }
  }

  private _detectBrownfieldAssessment(state: WorkspaceState): void {
    // Foundation (F1) só é considerada pronta quando AMBOS report.md (técnico)
    // e business-context.md (negócio) existem — produzidos pelo @assessor + @business-archeologist.
    const artifacts = path.join(this.root, ".github/artifacts");
    const outOf = (phaseId: string): string => FOUNDATION_CONTRACTS.find((c) => c.phaseId === phaseId)!.out;
    const exists = (...relPaths: string[]): boolean => relPaths.some((rel) => fs.existsSync(path.join(artifacts, rel)));
    // O contrato do Foundation grava o contexto de negócio e o baseline em assessment/business/. A raiz de
    // assessment/ é o layout antigo, que o chat sempre procurou e que workspaces anteriores ainda têm.
    const hasReport   = exists("assessment/report.md");
    const hasBizCtx   = exists(outOf("business-context"), "assessment/business-context.md");
    const hasBaseline = exists(outOf("baseline"), "assessment/baseline-metrics.json");
    // Strict: precisa de pelo menos report + business-context (baseline pode estar em consolidação)
    state.brownfieldAssessmentReady = hasReport && hasBizCtx;
    // Mantém compat antiga (domain.json legado)
    if (!state.brownfieldAssessmentReady) {
      const domainPath = path.join(this.root, ".github/artifacts/assessment/domain.json");
      if (fs.existsSync(domainPath) && hasReport) state.brownfieldAssessmentReady = true;
    }
    // (hasBaseline reservado para futura distinção "gate F1 selado")
    void hasBaseline;
  }

  // ── Initiatives YAML ──────────────────────────────────────────────────────

  private _readInitiatives(state: WorkspaceState): void {
    const yamlPath = path.join(this.root, ".github/artifacts/initiatives.yaml");
    if (!fs.existsSync(yamlPath)) return;

    const raw = fs.readFileSync(yamlPath, "utf-8");

    // Extract top-level active: key
    state.activeId = readActiveInitiativeId(raw);

    // A lista vem do mesmo parser do Cockpit: indentada (o writer do CLI),
    // na coluna 0 ou flow-style. O leitor por regex só via `- id:` na coluna 0
    // e guardava as aspas dos valores (achado da F3.1, parte do H-BUG-22).
    // Os defaults do chat (stream upstream, fase business) continuam.
    for (const init of parseInitiativesYaml(raw).state?.initiatives ?? []) {
      state.initiatives.push({
        id:            init.id,
        name:          init.name,
        status:        init.status,
        stream:        init.stream ?? "upstream",
        type:          init.type,
        current_phase: init.current_phase ?? "business",
        owner:         init.owner,
        priority:      init.priority,
        created_at:    init.created_at,
      });
    }

    state.activeInitiative = state.initiatives.find(i => i.id === state.activeId) ?? null;
  }

  // ── Delivery state YAML ───────────────────────────────────────────────────

  private _readDeliveryState(state: WorkspaceState): void {
    const candidates = [
      path.join(this.root, `.github/artifacts/initiatives/${state.activeId}/delivery-state.yaml`),
      path.join(this.root, ".github/artifacts/delivery-state.yaml"),
    ];

    for (const p of candidates) {
      if (!fs.existsSync(p)) continue;
      const raw = fs.readFileSync(p, "utf-8");
      state.deliveryState = this._parseDeliveryState(raw);
      return;
    }
  }

  private _parseDeliveryState(raw: string): DeliveryState {
    const ds: DeliveryState = { phases: {} };
    const lines = raw.split("\n");

    const phasesIdx = lines.findIndex(l => /^phases:\s*$/.test(l));
    if (phasesIdx === -1) return ds;

    let currentPhase: string | null = null;
    let inChecklist = false;

    for (let i = phasesIdx + 1; i < lines.length; i++) {
      const line = lines[i]!;

      const phaseMatch = line.match(/^ {2}([a-z][a-z0-9-]+):\s*$/);
      if (phaseMatch) {
        currentPhase = phaseMatch[1]!;
        ds.phases[currentPhase] = { status: "pending" };
        inChecklist = false;
        continue;
      }

      if (!currentPhase) continue;
      const entry = ds.phases[currentPhase]!;

      if (/^\s{4}human_checklist:\s*$/.test(line)) {
        inChecklist = true;
        continue;
      }

      if (inChecklist) {
        const clMatch = line.match(/^\s{6}([\w-]+):\s*(true|false)/);
        if (clMatch) {
          entry.human_checklist ??= {};
          entry.human_checklist[clMatch[1]!] = clMatch[2] === "true";
          continue;
        }
        if (!/^\s{6}/.test(line)) inChecklist = false;
      }

      const statusMatch = line.match(/^\s{4}status:\s*(\S+)/);
      if (statusMatch) {
        entry.status = statusMatch[1]!;
        continue;
      }

      const agentMatch = line.match(/^\s{4}agent:\s*(.+)/);
      if (agentMatch) {
        entry.agent = agentMatch[1]!.trim();
      }
    }

    return ds;
  }

  // ── Artifacts scan ────────────────────────────────────────────────────────

  private _scanArtifacts(state: WorkspaceState): void {
    const candidates: string[] = [
      ".github/artifacts/business-brief.md",
      ".github/artifacts/prd.md",
      ".github/artifacts/feature-list.md",
      ".github/artifacts/sprint-backlog.yaml",
      "api/openapi.yaml",
    ];

    if (state.activeId) {
      const base = `.github/artifacts/initiatives/${state.activeId}`;
      candidates.push(
        `${base}/business-brief.md`,
        `${base}/prd.md`,
        `${base}/feature-list.md`,
        `${base}/sprint-backlog.yaml`,
      );
    }

    state.artifactsExist = candidates.filter(p => fs.existsSync(path.join(this.root, p)));

    // Directories
    for (const dir of ["features", "docs/domain", "docs/adr", "docs/architecture", "pipelines"]) {
      if (fs.existsSync(path.join(this.root, dir))) {
        state.artifactsExist.push(dir + "/");
      }
    }
  }

  // ── Context string for LLM ────────────────────────────────────────────────

  toContextString(state: WorkspaceState): string {
    const lines: string[] = ["## Workspace state\n"];

    if (state.mode) {
      lines.push(`Project mode: **${state.mode}**`);
      if (state.mode === "brownfield") {
        lines.push(`Maturity frameworks configured: ${state.maturityFrameworks.length ? state.maturityFrameworks.join(", ") : "(none)"}`);
        lines.push(`Foundation status: ${state.brownfieldAssessmentReady ? "ready (gate F1 ✓ — report.md + business-context.md present)" : "not started — needs @assessor (Foundation stream is mandatory before any initiative)"}`);
        lines.push("");
      }
    }

    if (state.initiatives.length === 0) {
      if (state.mode === "brownfield") {
        lines.push(state.brownfieldAssessmentReady
          ? "No initiatives yet — Foundation gate F1 ✓. Ready to spawn initiatives of type `feature` / `modernization` / `hotfix`."
          : "No initiatives yet — brownfield mode begins with the Foundation stream via @assessor (orchestrates technical sub-agents + @business-archeologist). Gate F1 is mandatory before any initiative.");
      } else {
        lines.push("No initiatives configured yet.");
      }
      return lines.join("\n");
    }

    lines.push(`Initiatives (${state.initiatives.length}):`);
    for (const i of state.initiatives) {
      const active = i.id === state.activeId ? " ← ACTIVE" : "";
      const typeStr = i.type ? ` | type: ${i.type}` : "";
      lines.push(`- ${i.id} | ${i.name} | ${i.status} | phase: ${i.current_phase} | stream: ${i.stream}${typeStr} | priority: ${i.priority ?? "—"}${active}`);
    }

    if (state.activeInitiative && state.deliveryState) {
      lines.push(`\n## Delivery state for ${state.activeId}`);
      for (const [phase, st] of Object.entries(state.deliveryState.phases)) {
        const humanOk = st.human_checklist?.["human-ok"] ? " (human-ok ✓)" : "";
        lines.push(`- ${phase}: ${st.status}${humanOk}`);
      }
    }

    if (state.artifactsExist.length > 0) {
      lines.push(`\n## Existing artifacts\n${state.artifactsExist.map(a => `- ${a}`).join("\n")}`);
    }

    return lines.join("\n");
  }
}
