import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import { RepoSync } from "../src/repos/RepoSync";
import type { GitRunner, GitResult } from "../src/adapters/git/GitRunner";
import { parseReposYaml, upsertPinnedSha, type ReposInventory } from "../src/data/repos-contract";

/**
 * Git falso: registra os comandos e simula o clone criando o diretório. O
 * `checkout` move o HEAD simulado para o commit pedido (`sha`), como o git.
 */
class FakeGit implements GitRunner {
  calls: Array<{ args: string[]; cwd?: string }> = [];
  failOn: string | null = null;
  sha = "a3f9c21e0000000000000000000000000000000";

  async run(args: string[], cwd?: string): Promise<GitResult> {
    this.calls.push({ args, ...(cwd ? { cwd } : {}) });

    if (this.failOn && args.join(" ").includes(this.failOn)) {
      throw new Error("remote hung up unexpectedly");
    }
    if (args[0] === "clone") {
      const dest = args[args.length - 1]!;
      await fs.mkdir(path.join(dest, ".git"), { recursive: true });
      return { stdout: "", stderr: "" };
    }
    if (args[0] === "rev-parse") {
      return { stdout: `${this.sha}\n`, stderr: "" };
    }
    if (args[0] === "checkout") {
      this.sha = args[args.length - 1]!;
      return { stdout: "", stderr: "" };
    }
    return { stdout: "", stderr: "" };
  }

  cloneArgs(): string[] | undefined {
    return this.calls.find((c) => c.args[0] === "clone")?.args;
  }

  checkoutArgs(): string[] | undefined {
    return this.calls.find((c) => c.args[0] === "checkout")?.args;
  }
}

let tmpDir: string;
let git: FakeGit;
let sync: RepoSync;

const inventoryOf = (yaml: string) => parseReposYaml(yaml).inventory;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "helyx-sync-"));
  git = new FakeGit();
  sync = new RepoSync(git);
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("clone — os flags que importam", () => {
  const inv = inventoryOf(`
repos:
  - id: billing-api
    source: git
    url: git@github.com:acme/billing.git
    ref: main
`);

  it("materializa em repos/<id>/", async () => {
    const [r] = await sync.syncAll(tmpDir, inv);
    expect(r!.status).toBe("cloned");
    expect(r!.dir).toBe(path.join(tmpDir, "repos", "billing-api"));
  });

  it("usa --filter=blob:none — preserva histórico sem baixar todos os blobs", async () => {
    await sync.syncAll(tmpDir, inv);
    expect(git.cloneArgs()).toContain("--filter=blob:none");
  });

  it("NÃO usa --depth 1 — mataria churn/hotspot, que é o que o brownfield precisa", async () => {
    await sync.syncAll(tmpDir, inv);
    expect(git.cloneArgs()).not.toContain("--depth");
  });

  it("respeita o ref declarado", async () => {
    await sync.syncAll(tmpDir, inv);
    const args = git.cloneArgs()!;
    expect(args).toContain("--branch");
    expect(args[args.indexOf("--branch") + 1]).toBe("main");
  });

  it("sem ref, não passa --branch (usa o default do remote)", async () => {
    await sync.syncAll(tmpDir, inventoryOf(`
repos:
  - id: sem-ref
    source: git
    url: git@x/y.git
`));
    expect(git.cloneArgs()).not.toContain("--branch");
  });
});

describe("pinned_sha — o que impede findings de apodrecerem", () => {
  it("captura o SHA do commit materializado", async () => {
    const [r] = await sync.syncAll(tmpDir, inventoryOf(`
repos:
  - id: billing-api
    source: git
    url: git@x/y.git
`));
    expect(r!.sha).toBe(git.sha);
    expect(git.calls.some((c) => c.args[0] === "rev-parse")).toBe(true);
  });

  // A8 / H-BUG-12: o clone trazia o HEAD do remote, ignorando o pin, e o sync
  // regravava o pin com esse HEAD. Os findings ficavam ancorados na versão errada.
  const PIN = "02a6222000000000000000000000000000000000";
  const pinned = (extra = ""): ReposInventory =>
    inventoryOf(`
repos:
  - id: billing-api
    source: git
    url: git@x/y.git
    pinned_sha: "${PIN}"${extra}
`);

  it("REGRESSÃO: com pinned_sha, depois do clone faz checkout do pin e devolve o commit do pin (A8 / H-BUG-12)", async () => {
    git.sha = "e211cd4000000000000000000000000000000000"; // HEAD do remote
    const [r] = await sync.syncAll(tmpDir, pinned());
    expect(r!.status).toBe("cloned");
    const checkout = git.calls.find((c) => c.args[0] === "checkout")!;
    expect(checkout.args).toContain(PIN);
    expect(checkout.cwd).toBe(path.join(tmpDir, "repos", "billing-api"));
    expect(r!.sha).toBe(PIN);
    expect(r!.pinnedSha).toBe(PIN);
    expect(r!.pinMismatch).toBeUndefined();
  });

  it("REGRESSÃO: pin que o checkout não acha é falha com motivo claro, não um clone ancorado no HEAD (A8 / H-BUG-12)", async () => {
    git.failOn = `checkout`;
    const [r] = await sync.syncAll(tmpDir, pinned());
    expect(r!.status).toBe("failed");
    expect(r!.error).toContain(PIN);
    expect(r!.error).toMatch(/pinned_sha/);
  });

  it("REGRESSÃO: pasta já materializada em outro commit: avisa a divergência e não mexe no HEAD (A8 / H-BUG-12)", async () => {
    await fs.mkdir(path.join(tmpDir, "repos", "billing-api", ".git"), { recursive: true });
    git.sha = "e211cd4000000000000000000000000000000000";
    const [r] = await sync.syncAll(tmpDir, pinned());
    expect(r!.status).toBe("already-present");
    expect(r!.sha).toBe("e211cd4000000000000000000000000000000000");
    expect(r!.pinnedSha).toBe(PIN);
    expect(r!.pinMismatch).toBe(true);
    expect(git.checkoutArgs()).toBeUndefined();
  });

  it("sem pinned_sha: nenhum checkout depois do clone, e não há pin para comparar", async () => {
    const [r] = await sync.syncAll(tmpDir, inventoryOf(`
repos:
  - id: billing-api
    source: git
    url: git@x/y.git
`));
    expect(git.checkoutArgs()).toBeUndefined();
    expect(r!.pinnedSha).toBeUndefined();
    expect(r!.pinMismatch).toBeUndefined();
  });
});

describe("idempotência", () => {
  it("repo já materializado não é re-clonado", async () => {
    await fs.mkdir(path.join(tmpDir, "repos", "billing-api", ".git"), { recursive: true });

    const [r] = await sync.syncAll(tmpDir, inventoryOf(`
repos:
  - id: billing-api
    source: git
    url: git@x/y.git
`));
    expect(r!.status).toBe("already-present");
    expect(git.cloneArgs()).toBeUndefined();
  });
});

describe("local-path — repositório do cliente não é tocado", () => {
  it("não clona nem move; só confirma que existe", async () => {
    const localRepo = path.join(tmpDir, "erp-existente");
    await fs.mkdir(path.join(localRepo, ".git"), { recursive: true });

    const [r] = await sync.syncAll(tmpDir, inventoryOf(`
repos:
  - id: erp
    source: local-path
    path: ${localRepo}
`));
    expect(r!.status).toBe("local-path");
    expect(r!.dir).toBe(localRepo);
    expect(git.cloneArgs()).toBeUndefined();
  });

  it("pasta local inexistente falha com motivo claro", async () => {
    const [r] = await sync.syncAll(tmpDir, inventoryOf(`
repos:
  - id: fantasma
    source: local-path
    path: /nao/existe/aqui
`));
    expect(r!.status).toBe("failed");
    expect(r!.error).toMatch(/não encontrada/i);
  });
});

describe("resiliência — um repo não derruba os outros", () => {
  it("falha de clone é isolada; os demais continuam", async () => {
    git.failOn = "repo-quebrado";

    const results = await sync.syncAll(tmpDir, inventoryOf(`
repos:
  - id: repo-quebrado
    source: git
    url: git@x/repo-quebrado.git
  - id: repo-ok
    source: git
    url: git@x/repo-ok.git
`));

    expect(results).toHaveLength(2);
    expect(results[0]!.status).toBe("failed");
    expect(results[0]!.error).toMatch(/remote hung up/);
    expect(results[1]!.status).toBe("cloned");
  });
});

describe("scan_profile: ignore", () => {
  it("repo ignorado não é clonado", async () => {
    const results = await sync.syncAll(tmpDir, inventoryOf(`
repos:
  - id: arquivo-morto
    source: git
    url: git@x/y.git
    scan_profile: ignore
`));
    expect(results).toHaveLength(0);
    expect(git.cloneArgs()).toBeUndefined();
  });
});

describe("progresso", () => {
  it("reporta cada repo com posição e total", async () => {
    const seen: string[] = [];
    await sync.syncAll(
      tmpDir,
      inventoryOf(`
repos:
  - id: a
    source: git
    url: git@x/a.git
  - id: b
    source: git
    url: git@x/b.git
`),
      (msg, cur, total) => seen.push(`${msg} ${cur}/${total}`)
    );
    expect(seen).toEqual(["a 1/2", "b 2/2"]);
  });
});

describe("P1 — one repo é multi repo com N=1", () => {
  it("N=1 percorre o mesmo caminho", async () => {
    const results = await sync.syncAll(tmpDir, inventoryOf(`
repos:
  - id: unico
    source: git
    url: git@x/u.git
`));
    expect(results).toHaveLength(1);
    expect(results[0]!.status).toBe("cloned");
  });

  it("inventário vazio não faz nada", async () => {
    expect(await sync.syncAll(tmpDir, null)).toEqual([]);
  });
});

describe("upsertPinnedSha — preserva o arquivo do agente", () => {
  const YAML = `version: 1
repos:
  # o principal
  - id: billing-api
    source: git
    url: git@x/b.git    # remote interno
    scan_profile: deep
  - id: legacy-erp
    source: git
    url: git@x/e.git
`;

  it("insere o sha no repo certo", () => {
    const out = upsertPinnedSha(YAML, "billing-api", "abc123");
    expect(out).toContain("pinned_sha: abc123");
    expect(parseReposYaml(out).inventory.repos[0]!.pinned_sha).toBe("abc123");
  });

  it("NÃO destrói comentários (yaml.dump apagaria)", () => {
    const out = upsertPinnedSha(YAML, "billing-api", "abc123");
    expect(out).toContain("# o principal");
    expect(out).toContain("# remote interno");
  });

  it("não contamina o outro repo", () => {
    const inv = parseReposYaml(upsertPinnedSha(YAML, "billing-api", "abc123")).inventory;
    expect(inv.repos[1]!.pinned_sha).toBeUndefined();
  });

  it("atualiza sha existente em vez de duplicar", () => {
    const once = upsertPinnedSha(YAML, "billing-api", "abc123");
    const twice = upsertPinnedSha(once, "billing-api", "def456");
    expect(twice.split("\n").filter((l) => l.includes("pinned_sha")).length).toBe(1);
    expect(parseReposYaml(twice).inventory.repos[0]!.pinned_sha).toBe("def456");
  });

  it("grava no último repo da lista sem invadir o fim do arquivo", () => {
    const out = upsertPinnedSha(YAML, "legacy-erp", "zzz999");
    const inv = parseReposYaml(out).inventory;
    expect(inv.repos[1]!.pinned_sha).toBe("zzz999");
    expect(inv.repos[0]!.pinned_sha).toBeUndefined();
  });

  it("repo inexistente devolve o conteúdo intacto", () => {
    expect(upsertPinnedSha(YAML, "nao-existe", "x")).toBe(YAML);
  });
});

/**
 * Cenário real: o cliente não dá acesso ao git e manda um zip. O "Download ZIP"
 * do GitHub não traz `.git` — é um snapshot morto.
 *
 * Isso quebra duas premissas do kit, e o perigo é que ambas falhariam em
 * silêncio: sem histórico não há churn/hotspot nem arqueologia de PR, e sem
 * commit não há pinned_sha para ancorar os findings.
 */
describe("snapshot — o zip que o cliente mandou (sem .git)", () => {
  async function seedZip(id: string): Promise<string> {
    const dir = path.join(tmpDir, "repos", id);
    await fs.mkdir(path.join(dir, "src", "main"), { recursive: true });
    await fs.writeFile(path.join(dir, "pom.xml"), "<project/>");
    await fs.writeFile(path.join(dir, "src", "main", "App.java"), "class App {}");
    return dir;
  }

  it("pasta sem .git é detectada como snapshot, não como repo normal", async () => {
    await seedZip("legado-zip");
    const [r] = await sync.syncAll(tmpDir, inventoryOf(`
repos:
  - id: legado-zip
    source: local-path
    path: repos/legado-zip
`));
    expect(r!.status).toBe("snapshot");
    expect(r!.hasHistory).toBe(false);
  });

  it("has_history: false é o que faz os agentes degradarem em vez de inventar", async () => {
    await seedZip("legado-zip");
    const [r] = await sync.syncAll(tmpDir, inventoryOf(`
repos:
  - id: legado-zip
    source: local-path
    path: repos/legado-zip
`));
    // churn/hotspot e arqueologia de PR dependem disto
    expect(r!.hasHistory).toBe(false);
    expect(r!.sha).toBeUndefined();
  });

  it("ganha content_sha — um finding ainda precisa dizer sobre qual versão é", async () => {
    await seedZip("legado-zip");
    const [r] = await sync.syncAll(tmpDir, inventoryOf(`
repos:
  - id: legado-zip
    source: local-path
    path: repos/legado-zip
`));
    expect(r!.contentSha).toMatch(/^[0-9a-f]{12}$/);
  });

  it("o content_sha é determinístico — mesmo conteúdo, mesmo hash", async () => {
    await seedZip("a");
    await seedZip("b");
    const inv = inventoryOf(`
repos:
  - id: a
    source: local-path
    path: repos/a
  - id: b
    source: local-path
    path: repos/b
`);
    const [ra, rb] = await sync.syncAll(tmpDir, inv);
    expect(ra!.contentSha).toBe(rb!.contentSha);
  });

  it("conteúdo diferente muda o hash (senão a âncora não valeria nada)", async () => {
    const dir = await seedZip("mutante");
    const inv = inventoryOf(`
repos:
  - id: mutante
    source: local-path
    path: repos/mutante
`);
    const [antes] = await sync.syncAll(tmpDir, inv);
    await fs.writeFile(path.join(dir, "src", "main", "Novo.java"), "class Novo {}");
    const [depois] = await sync.syncAll(tmpDir, inv);
    expect(antes!.contentSha).not.toBe(depois!.contentSha);
  });

  it("ignora pastas geradas — target/ e node_modules não podem mexer na âncora", async () => {
    const dir = await seedZip("com-build");
    const inv = inventoryOf(`
repos:
  - id: com-build
    source: local-path
    path: repos/com-build
`);
    const [antes] = await sync.syncAll(tmpDir, inv);

    await fs.mkdir(path.join(dir, "target", "classes"), { recursive: true });
    await fs.writeFile(path.join(dir, "target", "classes", "App.class"), "binário");
    await fs.mkdir(path.join(dir, "node_modules", "x"), { recursive: true });
    await fs.writeFile(path.join(dir, "node_modules", "x", "index.js"), "module.exports={}");

    const [depois] = await sync.syncAll(tmpDir, inv);
    expect(depois!.contentSha).toBe(antes!.contentSha);
  });

  it("pasta com .git de verdade NÃO é snapshot — tem histórico", async () => {
    const dir = await seedZip("com-git");
    await fs.mkdir(path.join(dir, ".git"), { recursive: true });
    const [r] = await sync.syncAll(tmpDir, inventoryOf(`
repos:
  - id: com-git
    source: local-path
    path: repos/com-git
`));
    expect(r!.status).toBe("local-path");
    expect(r!.hasHistory).toBe(true);
    expect(r!.sha).toBe(git.sha);
  });

  it("declarado 'git' mas a pasta já tem zip: não tenta clonar por cima e explica", async () => {
    // git clone numa pasta cheia falha com "destination path already exists",
    // e o erro do git não diria o que fazer.
    await seedZip("confuso");
    const [r] = await sync.syncAll(tmpDir, inventoryOf(`
repos:
  - id: confuso
    source: git
    url: git@x/confuso.git
`));
    expect(r!.status).toBe("snapshot");
    expect(r!.error).toMatch(/declare source: local-path/i);
    expect(git.cloneArgs()).toBeUndefined();
  });

  it("repo clonado normalmente tem histórico", async () => {
    const [r] = await sync.syncAll(tmpDir, inventoryOf(`
repos:
  - id: normal
    source: git
    url: git@x/n.git
`));
    expect(r!.status).toBe("cloned");
    expect(r!.hasHistory).toBe(true);
  });
});
