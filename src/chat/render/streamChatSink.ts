/**
 * streamChatSink.ts — o `ChatSink` sobre o `ChatResponseStream` do VS Code.
 */

import * as vscode from "vscode";
import type { ChatSink } from "./ChatSink";

export function streamChatSink(stream: vscode.ChatResponseStream): ChatSink {
  return {
    markdown: (text) => stream.markdown(text),
    button: (button) => stream.button(button),
    anchor: (fsPath, title) => stream.anchor(vscode.Uri.file(fsPath), title),
  };
}
