# Agentes: papéis e regras de conversa

Um **agente** é um assistente de IA especializado numa tarefa: um analisa a
arquitetura, outro escreve testes, outro registra decisões. Nenhum faz tudo. A
Jataí instala os agentes no seu projeto como arquivos de texto (`.agent.md` no
Claude Code e no Copilot, `.md` no OpenCode), no formato que os três leem. O
[catálogo](../agentes/README.md) tem uma ficha para cada um.

## O ponto de entrada

Você nunca fala direto com um agente especialista. Toda conversa começa no
**orquestrador**, o agente `jatai`:

- no Claude Code, é o agente `@jatai`;
- no Copilot, é o custom agent `jatai`, escolhido no seletor de agentes;
- no OpenCode, é o agente `jatai` (primary) ou o comando `/jatai`.

O orquestrador valida os pré-requisitos da etapa e roteia para o agente certo. Se
faltar um artefato de uma etapa anterior, ele bloqueia e manda você para a etapa
certa. Ele não executa trabalho de fase: só roteia. Quando a intenção é ambígua, ele
faz **uma** pergunta, nunca uma lista.

Na extensão do VS Code existe também o **guia** do chat. Ele mostra onde a
iniciativa está, explica o próximo passo e encaminha você para o agente `jatai`. Ele
não aciona agentes nem grava arquivos.

## Quem são os agentes

| Papel | O que faz | Exemplos |
|---|---|---|
| Orquestrador | recebe a sua intenção, valida e roteia | `@jatai` |
| Coordenador de etapa | conduz os sub-agentes de uma etapa, com a sua validação a cada passo | `@assessor` |
| Agente de fase | faz o trabalho de uma fase de uma etapa | `@tech-mapper`, `@risk-prioritizer`, `@refactor-agent`, `@devops` |
| Guardião | só entra nos gates do projeto novo e valida de ponta a ponta | `@stream-align`, `@arch-cross` |
| Side-car | entra sob demanda, chamado por outro agente | `@qa-tester`, `@security`, `@docs` |

As etapas e os agentes de cada uma estão em [etapas](streams.md). O catálogo agrupa
os agentes pelo mesmo critério e diz de quem cada um recebe o trabalho e para quem
o entrega.

## Como os agentes se falam

Cada agente declara o seu contrato no início do arquivo (o frontmatter):

| Campo | Para que serve |
|---|---|
| `description` | quando usar o agente, em uma frase |
| `receives_from`, `delivers_to`, `escalates_to` | de quem recebe o trabalho, para quem entrega e para quem escala |
| `inputs`, `outputs` | o que lê e o que grava |
| `exit_contract` | o que precisa valer para ele passar adiante |
| `guard_rails` | o que ele não faz |
| `uses_skills` | as skills que ele carrega |

Algumas regras de roteamento decorrem disso:

- **Mudar de etapa passa sempre pelo orquestrador.** Um agente de fase só conhece
  a próxima fase da mesma etapa; para sair dela, ele escala.
- **Um agente só passa adiante quando cumpre o `exit_contract`.** Se não cumpre,
  ele para e diz o que falta.
- **Guardião não executa fase**, e só é chamado nos gates. Chamá-lo a cada
  interação gastaria contexto sem motivo.
- **Side-car nunca chama outro side-car.** Se precisar de outro, escala para o
  orquestrador.
- **Um repositório por vez.** Os agentes de Execução e de Operação atuam num
  repositório alvo e nunca editam fora dele.

## Skills

Uma **skill** é um pacote de conhecimento específico, como "como refatorar com
segurança" ou "como escrever BDD". Ela não fica sempre carregada: só entra no
contexto de um agente quando o frontmatter dele a declara em `uses_skills`, nunca
por adivinhação.

Há duas famílias:

- as skills **do kit**, iguais em todo projeto: padrões de modernização, mapeamento
  de dívida técnica, arquiteturas de referência, testes e outras. Estão no
  [catálogo de skills](../agentes/skills.md);
- as skills **do seu repositório**, geradas pela Descoberta depois de uma revisão
  sua: uma com as convenções de código (`coding-guidelines-<repo-id>`) e uma com o
  padrão visual (`design-system-<repo-id>`). É o que faz o mesmo agente escrever
  num padrão num repositório e noutro padrão no repositório vizinho, sem confundir
  os dois.

Para criar um agente ou uma skill nova, veja
[criar agentes e skills](../criar-agentes-e-skills.md).
