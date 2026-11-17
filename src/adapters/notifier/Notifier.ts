/**
 * Notifier.ts — porta das mensagens ao usuário e do progresso em
 * notificação (F3.6).
 *
 * As ações são os rótulos dos botões; a promessa resolve com o rótulo
 * escolhido, ou `undefined` quando o usuário fecha a mensagem. Sem `vscode`
 * nem I/O.
 */

export interface NotifyOptions {
  /** Diálogo modal, que bloqueia até a escolha. */
  modal?: boolean;
  /** Texto de apoio, mostrado abaixo da mensagem no modal. */
  detail?: string;
}

/** Um passo de progresso: o texto do passo e quanto do total ele representa (0–100). */
export interface ProgressStep {
  message?: string;
  increment?: number;
}

export interface Notifier {
  info(message: string, ...actions: string[]): Promise<string | undefined>;
  warn(message: string, ...actions: string[]): Promise<string | undefined>;
  error(message: string, ...actions: string[]): Promise<string | undefined>;
  /** Aviso que pede uma decisão, com opções (modal, detalhe). */
  ask(message: string, options: NotifyOptions, ...actions: string[]): Promise<string | undefined>;
  /** Roda `task` com uma notificação de progresso não cancelável. */
  progress<T>(title: string, task: (report: (step: ProgressStep) => void) => PromiseLike<T>): Promise<T>;
}

export interface RecordedNotification {
  kind: "info" | "warn" | "error" | "ask" | "progress";
  message: string;
  actions: string[];
  options?: NotifyOptions;
}

/** Notificador que grava as mensagens e responde com o que o teste programar. */
export class RecordingNotifier implements Notifier {
  readonly recorded: RecordedNotification[] = [];

  constructor(private readonly _answer: (n: RecordedNotification) => string | undefined = () => undefined) {}

  info(message: string, ...actions: string[]): Promise<string | undefined> {
    return this._record({ kind: "info", message, actions });
  }

  warn(message: string, ...actions: string[]): Promise<string | undefined> {
    return this._record({ kind: "warn", message, actions });
  }

  error(message: string, ...actions: string[]): Promise<string | undefined> {
    return this._record({ kind: "error", message, actions });
  }

  ask(message: string, options: NotifyOptions, ...actions: string[]): Promise<string | undefined> {
    return this._record({ kind: "ask", message, actions, options });
  }

  async progress<T>(title: string, task: (report: (step: ProgressStep) => void) => PromiseLike<T>): Promise<T> {
    this.recorded.push({ kind: "progress", message: title, actions: [] });
    return task(() => undefined);
  }

  private _record(n: RecordedNotification): Promise<string | undefined> {
    this.recorded.push(n);
    return Promise.resolve(this._answer(n));
  }
}
