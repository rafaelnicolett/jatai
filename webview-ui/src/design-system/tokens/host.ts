/**
 * Marca o documento como servido pelo VS Code (`<html data-host="vscode">`).
 *
 * É o sinal que liga o bloco 6 do `tokens.css` (DS v2, §2.2): dentro do VS
 * Code, os neutros seguem o tema do usuário (`--vscode-*`, inclusive alto
 * contraste) e os acentos da marca vêm por cima. Sem o atributo (mock,
 * catálogo, testes), valem os neutros dos protótipos.
 *
 * Só as entradas de produção (Cockpit e Wizard) chamam isto; o mock não.
 */
export function markVsCodeHost(doc: Document = document): void {
  doc.documentElement.setAttribute("data-host", "vscode");
}
