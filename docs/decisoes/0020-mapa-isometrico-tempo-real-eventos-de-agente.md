# ADR-0020: Mapa isométrico em tempo real sobre eventos de atividade de agente

## Status

aceita em 2026-11-14, pelo titular do projeto.

## Contexto

- O diferencial pretendido é um **mapa interativo** isométrico:
  - mostra a metodologia e os agentes trabalhando em tempo real;
  - abre por um botão no topo do Cockpit;
  - clicar numa ilha abre os detalhes;
  - funciona como um "mini-jogo assistido".
- O que existia:
  - o estado é lido de YAML (iniciativas, Foundation, delivery-state);
  - existiam `RunEvent` em JSONL, um observador de `runs/` e o SSE do State Service;
  - não existia um evento padronizado de "agente começou, terminou, escreveu
    artefato ou espera um gate" que valesse para os dois harnesses.
- O Claude Code tem hooks (início e fim de subagente, antes e depois de ferramenta).
  O Copilot não oferece o mesmo, então o tempo real precisa de fontes alternativas.

## Decisão

- **Contrato `agent-activity`**, uma extensão aditiva de `RunEvent`: os tipos que já
  existiam continuam valendo, e entram dois (`decision-requested` e
  `decision-made`) e campos opcionais (iniciativa, tarefa, caminho do artefato, quem
  gerou o evento, autor humano de uma decisão e por onde o evento foi capturado). O
  stream não é gravado: é derivado da fase pelo catálogo único de fases.
- **Privacidade por construção.** Só metadados: a mensagem tem no máximo 140
  caracteres, `metadata` só aceita `reason`, `task`, `path` e `count`, e nenhum
  produtor grava conteúdo de arquivo, prompt, diff ou saída de ferramenta.
- **Fontes de evento por harness**, como adaptadores:
  - hooks do Claude Code, instalados pelo kit;
  - chamadas às tools MCP de estado;
  - mudanças de YAML pelo `StateCommands`;
  - um observador de artefatos em `.github/artifacts/` como fallback universal
    (Copilot).
- **Renderer no webview:**
  - motor isométrico próprio em SVG, sem game engine;
  - mundo "meliponário": as ilhas são as caixas de colônia de cada etapa, os agentes
    são abelhas no estilo Guarda, as guardas ficam nos gates e os potes de mel são as
    entregas;
  - botão "Mapa" na barra superior e painel de detalhe por ilha;
  - tempo real via SSE;
  - modo lista equivalente, para acessibilidade;
  - respeito a `prefers-reduced-motion` e orçamento de desempenho.
- **Replay:** a mesma cena tocada a partir do histórico de eventos, como time-lapse
  da iniciativa e modo demo para o README.
- É uma feature nova: BDD primeiro e PRs separados de qualquer refactor.

## Consequências

- (+) Um diferencial visual que torna legível o trabalho invisível dos agentes.
- (+) O mesmo modelo de eventos alimenta o Cockpit, as notificações e o replay.
- (−) No Copilot, o "tempo real" depende do fallback por artefato (granularidade
  menor) até existir um hook equivalente.
- (−) Exige direção de arte própria (ilustração isométrica) e testes de desempenho no
  webview.

O [workspace demo](../../demo/README.md) traz um histórico de eventos no formato do
contrato, e um roteiro para ver o mapa se mexendo.
