/**
 * Secrets.ts — porta do cofre de segredos (F3.6).
 *
 * Em produção é o `SecretStorage` do VS Code, apoiado no keychain do sistema
 * operacional. Nunca use a configuração para segredo (achado A02/A07 do
 * security-report). Sem `vscode` nem I/O.
 */

export interface Secrets {
  /** Grava o segredo sob a chave. Pode rejeitar: quem chama decide se é fatal. */
  store(key: string, value: string): Promise<void>;
}

/** Cofre em memória, para testes. */
export class InMemorySecrets implements Secrets {
  readonly values = new Map<string, string>();

  store(key: string, value: string): Promise<void> {
    this.values.set(key, value);
    return Promise.resolve();
  }
}
