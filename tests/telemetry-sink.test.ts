import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as vscode from "vscode";
import { ConfigLoader } from "../src/adapters/config/ConfigLoader";
import { NullTelemetrySink, type TelemetryEvent } from "../src/adapters/telemetry/TelemetrySink";
import { createDeliveryStateAccess } from "../src/views/actions/deliveryStateAccess";
import { CockpitNextController } from "../src/views/CockpitNextController";
import { SystemClock } from "../src/adapters/clock/Clock";
import { VsCodeWorkspaceRoot } from "../src/adapters/workspace/VsCodeWorkspaceRoot";
import { VsCodeSettings } from "../src/adapters/settings/VsCodeSettings";
import type { ActionContext } from "../src/views/actions/CommandHandler";
import { installNetGuard, type NetGuard } from "./characterization/helpers/net-guard";
import { YamlStateRepository } from "../src/state/repository/StateRepository";

/**
 * C6 / H-BUG-13 (F2.1, ADR-0015): iniciar, concluir e aprovar fase mandavam
 * id e nome da iniciativa, slug do projeto e fase para `api.helyx.build`, sem
 * opt-in. A edição aberta liga a `NullTelemetrySink` por padrão: o evento
 * continua sendo montado (a porta existe para uma extensão companheira), mas
 * nada sai da máquina.
 */

const workspace = vscode.workspace as unknown as { workspaceFolders: Array<{ uri: { fsPath: string } }> | undefined };
const fakeContext = { subscriptions: [] } as unknown as vscode.ExtensionContext;

const EVENT: TelemetryEvent = {
  event_type: "phase_completed",
  initiative_id: "iniciativa-ficticia",
  initiative_name: "Iniciativa fictícia",
  project_slug: "projeto-ficticio",
  phase_id: "discovery",
};

let net: NetGuard;
let root: string;

beforeEach(() => {
  net = installNetGuard();
  root = fs.mkdtempSync(path.join(os.tmpdir(), "helyx-telemetry-sink-"));
  workspace.workspaceFolders = [{ uri: { fsPath: root } }];
});

afterEach(() => {
  net.restore();
  workspace.workspaceFolders = undefined;
  fs.rmSync(root, { recursive: true, force: true });
});

describe("TelemetrySink — a edição aberta não envia telemetria (C6 / H-BUG-13)", () => {
  it("REGRESSÃO: concluir uma fase pelo chat grava o delivery-state e não abre nenhuma conexão de saída", async () => {
    const statePath = path.join(root, ".github/artifacts/delivery-state.yaml");
    fs.mkdirSync(path.dirname(statePath), { recursive: true });
    fs.writeFileSync(statePath, "phases:\n  discovery:\n    status: in-progress\n", "utf-8");

    const access = createDeliveryStateAccess(fakeContext, new ConfigLoader(workspace.workspaceFolders as never), new YamlStateRepository());
    await access.markPhaseDoneFromChat("discovery");

    expect(fs.readFileSync(statePath, "utf-8")).toMatch(/discovery:\n\s+status: done/);
    expect(net.blocked).toEqual([]);
  });

  it("REGRESSÃO: o evento de telemetria das ações do Cockpit é descartado sem rede", () => {
    const controller = new CockpitNextController(fakeContext, { configLoader: new ConfigLoader(workspace.workspaceFolders as never), repository: new YamlStateRepository(), clock: new SystemClock(), workspaceRoot: new VsCodeWorkspaceRoot(), settings: new VsCodeSettings() });
    const ctx = (controller as unknown as { _buildActionContext(): ActionContext })._buildActionContext();
    ctx.pushTelemetry(EVENT);
    expect(net.blocked).toEqual([]);
  });

  it("NullTelemetrySink.push não lança e não chama a rede", () => {
    expect(() => new NullTelemetrySink().push(EVENT)).not.toThrow();
    expect(net.blocked).toEqual([]);
  });
});
