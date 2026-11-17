#!/usr/bin/env node
/**
 * dco-check.mjs: confere o DCO (`Signed-off-by`) dos commits de um PR (ADR-0014)
 *
 * A Jataí usa DCO no lugar de CLA: quem contribui certifica, em cada commit,
 * que tem o direito de enviar aquele código sob a licença do projeto
 * (https://developercertificate.org). A certificação é a linha
 * `Signed-off-by: Nome <email>` que o `git commit -s` acrescenta.
 *
 * Uso: node scripts/dco-check.mjs <base> <head>
 *   Confere cada commit de `<base>..<head>` (os commits do PR). No CI, a base
 *   é a ponta atual da branch de destino (`origin/<base_ref>`), não o
 *   `base.sha` do evento: com o `base.sha`, commits que entraram por um merge
 *   da main na branch do PR seriam cobrados como se fossem do PR.
 *
 * Regras (as mesmas do app DCO do GitHub):
 *   - a mensagem tem ao menos uma linha `Signed-off-by: Nome <email>`;
 *   - o email de uma dessas linhas é o email do autor do commit (sem
 *     diferenciar maiúsculas de minúsculas);
 *   - commits de merge não são conferidos;
 *   - commits de bot (`<nome>[bot]@users.noreply.github.com`) não são conferidos.
 *
 * Saída: exit 0 = todos assinados; 1 = commit sem DCO; 2 = uso errado ou git falhou.
 */

import { execFileSync } from "node:child_process";

const [base, head] = process.argv.slice(2);
if (!base || !head) {
  console.error("uso: node scripts/dco-check.mjs <base> <head>");
  process.exit(2);
}

function git(args) {
  try {
    return execFileSync("git", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
  } catch (err) {
    console.error(`dco-check: git ${args.join(" ")} falhou: ${(err.stderr || err.message).toString().trim()}`);
    process.exit(2);
  }
}

for (const rev of [base, head]) git(["rev-parse", "--verify", "--quiet", `${rev}^{commit}`]);

const FIELD = "\u001f";
const RECORD = "\u001e";
const raw = git(["log", "--no-merges", `--format=%H${FIELD}%an${FIELD}%ae${FIELD}%s${FIELD}%B${RECORD}`, `${base}..${head}`]);
const commits = raw
  .split(RECORD)
  .map((r) => r.replace(/^\n/, ""))
  .filter((r) => r.trim())
  .map((r) => {
    const [sha, authorName, authorEmail, subject, body] = r.split(FIELD);
    return { sha, authorName, authorEmail, subject, body: body ?? "" };
  });

const SIGNOFF = /^Signed-off-by:[ \t]*(.+?)[ \t]*<([^<>\s]+)>[ \t]*$/gim;
const BOT = /\[bot\]@users\.noreply\.github\.com$/i;

const failures = [];
let bots = 0;
for (const c of commits) {
  if (BOT.test(c.authorEmail)) {
    bots++;
    continue;
  }
  const emails = [...c.body.matchAll(SIGNOFF)].map((m) => m[2]);
  const short = `${c.sha.slice(0, 10)} "${c.subject}"`;
  if (emails.length === 0) {
    failures.push(`${short}: sem Signed-off-by (autor ${c.authorName} <${c.authorEmail}>)`);
  } else if (!emails.some((e) => e.toLowerCase() === c.authorEmail.toLowerCase())) {
    failures.push(`${short}: o Signed-off-by (${emails.join(", ")}) não é do autor <${c.authorEmail}>`);
  }
}

/** Encurta só SHA completo; nome de ref (origin/main) fica como está. */
const label = (rev) => (/^[0-9a-f]{40}$/i.test(rev) ? rev.slice(0, 10) : rev);

console.log(`dco-check: ${commits.length} commit(s) em ${label(base)}..${label(head)} (sem merges); ${bots} de bot`);
for (const f of failures) console.log(`  ✖ ${f}`);

if (failures.length > 0) {
  console.log(
    [
      "",
      "Todo commit precisa do DCO (ADR-0014): uma linha `Signed-off-by: Nome <email>` com o mesmo email do autor.",
      "  - commits novos: `git commit -s`",
      `  - commits já feitos: \`git rebase --signoff ${label(base)}\` e \`git push --force-with-lease\``,
    ].join("\n"),
  );
  console.log(`resumo: ${failures.length} de ${commits.length - bots} commit(s) sem DCO válido`);
  process.exit(1);
}
console.log(`resumo: ${commits.length - bots} commit(s) com DCO válido`);
