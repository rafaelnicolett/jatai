import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import {
  parseDevopsStatus,
  parseObservabilityStatus,
  parseIncidentsLog,
  parseSustainLog,
  hasAnyOperationsData,
  DEVOPS_STATUS_PATH,
  loadOperationsSnapshot,
} from "../src/data/operations-contract";

describe("operations-contract — path canônico", () => {
  it("aponta para .github/artifacts/operations/", () => {
    expect(DEVOPS_STATUS_PATH.join("/")).toBe(".github/artifacts/operations/devops-status.yaml");
  });
});

describe("parseDevopsStatus", () => {
  it("parseia repos com pipeline_health, last_deploy, iac_validated", () => {
    const { status, errors } = parseDevopsStatus(`
repos:
  helyx-vscode:
    pipeline_health: green
    last_deploy:
      at: "2026-08-25T00:00:00Z"
      environment: production
      status: success
    iac_validated: true
updated_at: "2026-08-25T00:00:00Z"
`);
    expect(errors).toEqual([]);
    expect(status.repos["helyx-vscode"]).toMatchObject({
      pipeline_health: "green",
      last_deploy: { at: "2026-08-25T00:00:00Z", environment: "production", status: "success" },
      iac_validated: true,
    });
  });

  it("pipeline_health inválido é descartado silenciosamente (degrada, não quebra)", () => {
    const { status, errors } = parseDevopsStatus(`
repos:
  x:
    pipeline_health: "roxo"
`);
    expect(errors).toEqual([]);
    expect(status.repos["x"]?.pipeline_health).toBeUndefined();
  });

  it("YAML inválido devolve status vazio + erro", () => {
    const { status, errors } = parseDevopsStatus("repos: [not: valid");
    expect(status).toEqual({ repos: {} });
    expect(errors.length).toBeGreaterThan(0);
  });

  it("arquivo vazio/sem repos devolve objeto vazio, sem erro", () => {
    expect(parseDevopsStatus("").errors).toEqual([]);
    expect(parseDevopsStatus("").status.repos).toEqual({});
  });
});

describe("parseObservabilityStatus", () => {
  it("parseia health_checks e active_alerts", () => {
    const { status, errors } = parseObservabilityStatus(`
repos:
  helyx-vscode:
    health_checks:
      - service: api
        status: healthy
    active_alerts:
      - id: alert-001
        severity: critical
        message: "latência alta"
        since: "2026-08-25T00:00:00Z"
`);
    expect(errors).toEqual([]);
    expect(status.repos["helyx-vscode"]?.health_checks).toEqual([{ service: "api", status: "healthy" }]);
    expect(status.repos["helyx-vscode"]?.active_alerts).toEqual([
      { id: "alert-001", severity: "critical", message: "latência alta", since: "2026-08-25T00:00:00Z" },
    ]);
  });

  it("alerta sem id/message é descartado", () => {
    const { status } = parseObservabilityStatus(`
repos:
  x:
    active_alerts:
      - severity: warning
`);
    expect(status.repos["x"]?.active_alerts).toEqual([]);
  });
});

describe("parseIncidentsLog", () => {
  it("parseia incidente completo", () => {
    const { log, errors } = parseIncidentsLog(`
incidents:
  - id: inc-001
    title: "API fora do ar"
    severity: critical
    status: resolved
    started_at: "2026-08-25T00:00:00Z"
    resolved_at: "2026-08-25T01:00:00Z"
    post_mortem: .github/artifacts/incidents/inc-001.md
`);
    expect(errors).toEqual([]);
    expect(log.incidents).toEqual([
      {
        id: "inc-001",
        title: "API fora do ar",
        severity: "critical",
        status: "resolved",
        started_at: "2026-08-25T00:00:00Z",
        resolved_at: "2026-08-25T01:00:00Z",
        post_mortem: ".github/artifacts/incidents/inc-001.md",
      },
    ]);
  });

  it("incidente sem id/title/started_at é descartado e reportado", () => {
    const { log, errors } = parseIncidentsLog(`
incidents:
  - title: "sem id"
`);
    expect(log.incidents).toEqual([]);
    expect(errors.length).toBe(1);
  });

  it("severity/status fora do enum caem no default (minor/active)", () => {
    const { log } = parseIncidentsLog(`
incidents:
  - id: inc-002
    title: "x"
    started_at: "2026-08-25T00:00:00Z"
    severity: "catastrofico"
    status: "sei-la"
`);
    expect(log.incidents[0]).toMatchObject({ severity: "minor", status: "active" });
  });
});

describe("parseSustainLog", () => {
  it("parseia patch completo", () => {
    const { log, errors } = parseSustainLog(`
patches:
  - repo: helyx-vscode
    kind: cve-fix
    description: "Vitest CVE-2026-47429"
    applied_at: "2026-08-25T00:00:00Z"
    pr: "#42"
`);
    expect(errors).toEqual([]);
    expect(log.patches).toEqual([
      { repo: "helyx-vscode", kind: "cve-fix", description: "Vitest CVE-2026-47429", applied_at: "2026-08-25T00:00:00Z", pr: "#42" },
    ]);
  });

  it("patch sem repo/description/applied_at é descartado e reportado", () => {
    const { log, errors } = parseSustainLog(`patches:\n  - kind: cve-fix\n`);
    expect(log.patches).toEqual([]);
    expect(errors.length).toBe(1);
  });
});

describe("hasAnyOperationsData", () => {
  it("null → false", () => {
    expect(hasAnyOperationsData(null)).toBe(false);
  });

  it("snapshot com os 4 blocos vazios → false (nenhum agente escreveu nada ainda)", () => {
    expect(hasAnyOperationsData({ devops: { repos: {} }, observability: { repos: {} }, incidents: { incidents: [] }, sustain: { patches: [] } })).toBe(false);
  });

  it("qualquer bloco com dado real → true", () => {
    expect(hasAnyOperationsData({ devops: null, observability: null, incidents: { incidents: [{ id: "i", title: "t", severity: "minor", status: "active", started_at: "x" }] }, sustain: null })).toBe(true);
  });
});

let tmpDir: string;
const write = async (rel: string, body: string) => {
  const full = path.join(tmpDir, rel);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, body);
};

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "helyx-ops-"));
});
afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("loadOperationsSnapshot", () => {
  it("nenhum dos 4 arquivos existe → todos os blocos null, sem lançar", () => {
    const snapshot = loadOperationsSnapshot(tmpDir);
    expect(snapshot).toEqual({ devops: null, observability: null, incidents: null, sustain: null });
  });

  it("só devops-status.yaml existe → só esse bloco vem preenchido", async () => {
    await write(".github/artifacts/operations/devops-status.yaml", "repos:\n  x:\n    pipeline_health: green\n");
    const snapshot = loadOperationsSnapshot(tmpDir);
    expect(snapshot.devops?.repos["x"]?.pipeline_health).toBe("green");
    expect(snapshot.observability).toBeNull();
    expect(snapshot.incidents).toBeNull();
    expect(snapshot.sustain).toBeNull();
  });

  it("os 4 arquivos existem → snapshot inteiro preenchido", async () => {
    await write(".github/artifacts/operations/devops-status.yaml", "repos: {}\n");
    await write(".github/artifacts/operations/observability-status.yaml", "repos: {}\n");
    await write(".github/artifacts/operations/incidents.yaml", "incidents: []\n");
    await write(".github/artifacts/operations/sustain-log.yaml", "patches: []\n");
    const snapshot = loadOperationsSnapshot(tmpDir);
    expect(snapshot.devops).not.toBeNull();
    expect(snapshot.observability).not.toBeNull();
    expect(snapshot.incidents).not.toBeNull();
    expect(snapshot.sustain).not.toBeNull();
  });
});
