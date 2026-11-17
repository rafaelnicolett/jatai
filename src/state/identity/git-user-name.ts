/**
 * git-user-name.ts — quem aprova um gate (ADR-0024, decisão 2 do titular).
 *
 * O Cockpit e o CLI gravam em `by` o `user.name` do git do workspace, só o
 * nome. O e-mail nunca é lido: a consulta pede só a chave `user.name`
 * (ADR-0015, privacidade). Sem `user.name` (ou sem git), devolve `null`, e
 * quem chamou pede o nome ao humano.
 */
import { execFile } from "child_process";

/** Porta: o nome de quem aprova no workspace `root`, ou `null` quando não há. */
export type ApproverNameSource = (root: string) => Promise<string | null>;

const GIT_TIMEOUT_MS = 5_000;

/** `git config --get user.name`, lido na raiz do workspace (local > global > sistema). Nunca lança. */
export const gitUserName: ApproverNameSource = (root) =>
  new Promise((resolve) => {
    execFile("git", ["config", "--get", "user.name"], { cwd: root, timeout: GIT_TIMEOUT_MS, windowsHide: true }, (err, stdout) => {
      if (err) {
        resolve(null);
        return;
      }
      const name = String(stdout).trim();
      resolve(name === "" ? null : name);
    });
  });
