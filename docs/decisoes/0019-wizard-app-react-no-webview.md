# ADR-0019: Wizard como app React no webview, com o design system do Cockpit

## Status

aceita em 2026-11-14, pelo titular do projeto.

## Contexto

- O Wizard era um template literal de cerca de 1.280 linhas (HTML, CSS e JS) dentro
  de um controller.
- Um hotfix do produto anterior nasceu exatamente disso: um escape dentro do literal
  quebrou o `<script>` inteiro em tempo de execução, e a primeira tela ficou em
  branco.
- Outros defeitos do Wizard daquela base:
  - uma função era chamada e nunca definida;
  - no projeto existente, a tela piscava o schema do projeto novo antes de mostrar o
    certo;
  - os cartões de escolha eram `<div>` sem foco, então não dava para concluir o fluxo
    só com o teclado;
  - os ícones eram carregados de um CDN externo.
- O design system do webview não era reutilizável, porque importava store e features.

## Decisão

- Sequência Strangler, em seis passos:
  1. extrair a sessão (estado e regras) do controller;
  2. servir os assets como arquivos estáticos, eliminando o template literal;
  3. criar `apps/wizard` em React, no mesmo bundle do Cockpit, atrás de uma flag;
  4. garantir paridade com o protocolo entre o host e o Wizard, que fica congelado e
     testado;
  5. tornar o Wizard novo o padrão;
  6. remover o legado.
- O redesign do Wizard só começa depois da paridade, para não redesenhar duas vezes.

## Consequências

- (+) A classe de bug do template literal desaparece.
- (+) Wizard e Cockpit passam a ter a mesma linguagem visual e a mesma
  acessibilidade.
- (−) Durante a transição existem dois Wizards (o legado e o novo) atrás de uma flag.

Veja [Strangler](../metodologia/praticas/strangler.md).
