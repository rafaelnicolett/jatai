import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import { copyKitFile } from "../src/generator/kit-render";
import { BRAND } from "../src/data/brand.pure";

/**
 * O gerador copia o kit renderizando os placeholders `{{brand.*}}`
 * (ADR-0013, F1.2). Arquivo sem placeholder sai byte a byte igual.
 */

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "kit-render-"));
});
afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("copyKitFile — cópia do kit com a marca renderizada", () => {
  it("troca os placeholders pela marca do brand.json", async () => {
    const src = path.join(tmpDir, "agente.md");
    await fs.writeFile(src, "---\nname: \"{{brand.displayName}}\"\n---\nnode .github/scripts/{{brand.files.cli}} · @{{brand.participant.name}}\n");
    await copyKitFile(src, path.join(tmpDir, "saida.md"));
    expect(await fs.readFile(path.join(tmpDir, "saida.md"), "utf-8")).toBe(
      `---\nname: "${BRAND.displayName}"\n---\nnode .github/scripts/${BRAND.files.cli} · @${BRAND.participant.name}\n`
    );
  });

  it("arquivo sem placeholder sai byte a byte igual, inclusive binário", async () => {
    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0xff, 0x7b, 0x7b]);
    const src = path.join(tmpDir, "icone.png");
    await fs.writeFile(src, bytes);
    await copyKitFile(src, path.join(tmpDir, "copia.png"));
    expect((await fs.readFile(path.join(tmpDir, "copia.png"))).equals(bytes)).toBe(true);
  });

  it("mantém o modo do arquivo de origem nos dois caminhos (o CLI do kit é 755)", async () => {
    if (process.platform === "win32") return; // sem bit de execução no Windows
    const plain = path.join(tmpDir, "cli.cjs");
    const templ = path.join(tmpDir, "shim.cjs");
    await fs.writeFile(plain, "#!/usr/bin/env node\n");
    await fs.writeFile(templ, "#!/usr/bin/env node\n// {{brand.cliName}}\n");
    await fs.chmod(plain, 0o755);
    await fs.chmod(templ, 0o755);
    await copyKitFile(plain, path.join(tmpDir, "a.cjs"));
    await copyKitFile(templ, path.join(tmpDir, "b.cjs"));
    expect((await fs.stat(path.join(tmpDir, "a.cjs"))).mode & 0o777).toBe(0o755);
    expect((await fs.stat(path.join(tmpDir, "b.cjs"))).mode & 0o777).toBe(0o755);
  });

  it("sobrescreve o destino que já existe (a migração recopia o kit)", async () => {
    const src = path.join(tmpDir, "x.md");
    const dest = path.join(tmpDir, "y.md");
    await fs.writeFile(src, "{{brand.name}}");
    await fs.writeFile(dest, "antigo");
    await copyKitFile(src, dest);
    expect(await fs.readFile(dest, "utf-8")).toBe(BRAND.name);
  });
});
