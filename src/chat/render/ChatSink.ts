/**
 * ChatSink.ts — para onde os renderers do chat escrevem (F3.7, Introduce
 * Parameter Object sobre o `ChatResponseStream`).
 *
 * Os cards do Concierge só conhecem esta interface: markdown, botão de
 * comando e âncora para um caminho do disco. O adaptador do VS Code
 * (`streamChatSink`) converte para o `ChatResponseStream`. Sem `vscode`.
 */

export interface ChatButton {
  command: string;
  title: string;
  arguments?: unknown[];
}

export interface ChatSink {
  markdown(text: string): void;
  button(button: ChatButton): void;
  /** Âncora clicável para um arquivo ou pasta (caminho absoluto). */
  anchor(fsPath: string, title: string): void;
}
