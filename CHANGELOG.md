<!--
Para quem mantém: este arquivo vai no pacote da extensão, e o Marketplace o
mostra na aba de mudanças. Escreva para quem usa, nunca com nome de classe,
id interno ou referência a documento que não é público. Daqui em diante, cada
entrada cita o PR, por exemplo: (#42).
-->

# Changelog

Todas as mudanças notáveis da Jataí ficam registradas aqui.

O formato segue o [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/),
e as versões seguem o [Versionamento Semântico](https://semver.org/lang/pt-BR/).

A Jataí é a edição aberta da extensão antes distribuída como Helyx. O
histórico começa aqui: as versões da edição anterior não fazem parte deste
registro.

## [1.2.2] - 2026-11-18

### Corrigido

- No pacote publicado, `jatai --version`, `jatai doctor` e o `kit_version`
  gravado no workspace voltam a ler a versão do pacote escopado
  (`@rafael_nicoleti/jatai`); antes devolviam `0.0.0`. (#5)

## [1.2.1] - 2026-11-17

### Corrigido

- O pacote da CLI passa a ser publicado como `@rafael_nicoleti/jatai`: o npm
  bloqueia o nome sem escopo `jatai` por semelhança com `jotai` e `jiti`. O
  comando instalado continua `jatai`. (#4)

## [1.2.0] - 2026-11-17

### Adicionado

- **CLI headless `jatai`.** Instala, diagnostica, atualiza e remove o kit sem
  abrir o VS Code, com o mesmo instalador da extensão: `jatai init
  --harness <copilot|claude|opencode>`, `jatai doctor`, `jatai update`,
  `jatai uninstall`, `jatai harness list` e `jatai state`. `--dry-run` mostra
  o plano; `--json` é a saída de automação; `update`/`uninstall` usam o
  `kit.lock.json` e preservam o que o time editou. O pacote vai para o npm
  como `jatai`, sem `postinstall` e sem rede na instalação. (#2)
- Guia público da CLI em `docs/cli.md`. (#2)

## [1.1.0] - 2026-11-17

### Adicionado

- **OpenCode como terceiro harness.** O kit instala agentes, skills,
  instruções e o comando `/jatai` em `.opencode/`, com o agente `jatai` como
  orquestrador (`primary`) e os especialistas como subagentes. A entrada é o
  agente `jatai` ou o comando `/jatai`.
- O Wizard oferece **OpenCode** ao lado de Claude Code e GitHub Copilot, e o
  Cockpit lê os agentes dos três layouts.
- O servidor MCP é configurado em `opencode.json(c)`, preservando os outros
  servidores e os comentários do arquivo do time.
- A atividade dos subagentes do OpenCode entra no mesmo registro do mapa:
  começou, terminou e bloqueou, com `harness: "opencode"`.
- O comando `runs append` aceita `--harness opencode`.

### Notas

- O suporte é para o OpenCode **2.x**; o V1 fica para uma decisão futura.
- A compatibilidade `.claude` do OpenCode (skills e comandos) continua, mas não
  substitui os agentes nativos de `.opencode/`.
- Esta versão vem depois da 1.0.0; a 1.0.0 continua sendo a primeira
  publicação.

## [1.0.0] - 2026-11-17

### Adicionado

- Código aberto sob a licença MIT, com a lista de licenças das dependências
  (`THIRD_PARTY_NOTICES.md`) junto do pacote.
- Suporte a Workspace Trust: a extensão não roda em workspace não confiável.
- Guia de contribuição, código de conduta, política de segurança, governança
  e templates de issue e de pull request.
- O verbo `runs append` do CLI de estado e a ferramenta `append_run_event` do
  servidor MCP registram a atividade dos agentes (começou, avançou, terminou,
  gravou um artefato, ficou bloqueado, pediu uma decisão). O registro guarda
  só metadados, nunca o conteúdo de arquivo, o prompt ou a saída de uma
  ferramenta. É a base do mapa da colmeia.
- Toda mudança de estado (tarefa, fase, gate) e toda decisão humana também
  entram nesse registro, com o nome de quem decidiu.
- `gates approve` registra quem aprovou: o nome do usuário do git, nunca o
  e-mail, ou o nome dado em `--by`. Sem nome, o comando pede um.
- O mapa da colmeia no Cockpit: uma vista isométrica, em tempo real, dos streams
  da iniciativa como ilhas ligadas pelos gates. Cada agente trabalhando é uma
  abelha na ilha dele, a guarda acende quando algo espera você, e cada entrega
  enche um pote. Abra pelo botão "Mapa" da barra superior e volte com
  "Voltar ao Cockpit" ou com Esc. Abelha bloqueada ou que falhou para, em cor de
  ferrugem e com o motivo escrito.
- Clicar numa ilha abre o painel dela: quem trabalha ali e a responsabilidade
  de cada agente, o passo atual, o que espera você, as entregas (que abrem o
  arquivo) e o checklist do gate. O modo lista mostra as mesmas informações
  em texto, é o padrão com leitor de tela, e o leitor é avisado de decisão
  nova, bloqueio e falha.
- O mapa tem a variante de dia e a de noite, pausa, e respeita "reduzir
  movimento" e o alto contraste: sem movimento a cena fica parada e completa.
  A escolha entre mapa e lista e entre dia e noite fica lembrada.
- A responsabilidade de cada agente vem do cabeçalho dos arquivos de agente do
  seu workspace (`.claude/agents` e `.github/agents`); o corpo do arquivo nunca
  é lido.

### Modificado

- A extensão só ativa sozinha em pasta que já tem o kit da Jataí, ou o da
  edição anterior. Numa pasta qualquer, ela abre pela view, por um comando ou
  pelo chat, e não grava nada na pasta até você instalar o kit nela.
- O kit de agentes e skills usa só exemplos fictícios.
- O Wizard desenha os ícones de tecnologia localmente, sem buscar imagem na
  internet.
- A comparação de versões de um artefato abre num documento em memória, sem
  deixar cópia na pasta temporária do sistema.
- O chat mostra o nome, o ícone e o agente certos de cada fase.
- Aprovar um gate pelo CLI exige o trabalho anterior fechado: o D1 de um
  repositório, as fases do Foundation dele concluídas; o D2, o roadmap e a
  matriz de risco aprovados. O erro lista o que falta.
- O Cockpit lê só o que foi acrescentado ao registro de atividade desde a
  última leitura, em vez de reler todos os arquivos a cada 4 segundos. Os
  arquivos do registro rodam a cada 5.000 eventos, por iniciativa.
- No Claude Code, o CLI de estado e o servidor MCP usam a pasta do projeto que
  ele informa, mesmo quando chamados de uma subpasta.

### Removido

- O envio de dados de iniciativa, projeto e fase para um servidor externo. A
  extensão não tem mais telemetria.
- O Modo Online e a sincronização da base de conhecimento com um serviço
  remoto, inclusive o verbo `kb` do CLI de estado.
- O download de templates de um registro remoto, o cache de templates na
  pasta pessoal e a chave de API que ele usava.
- O portal web e o dashboard remotos.
- As settings de telemetria, de chave e de endereço de API e do Modo Online.
- A edição só para projetos novos (greenfield).
- Do kit: um agente de uso interno do time que o mantinha e um conteúdo de
  terceiro que não podia ser redistribuído.

### Corrigido

- O pacote da extensão leva o kit de agentes completo. Antes ele podia sair
  sem as skills dos projetos novos e sem os arquivos de instrução dos
  harnesses.
- O Wizard não instala mais o kit dentro de um repositório de código: uma
  pasta com Git que não é workspace da Jataí é recusada, e uma pasta que só
  parece workspace pede a sua confirmação antes de receber o kit.
- Retomar a criação de um workspace preserva o que já existe: instruções,
  configuração do Foundation, documentos de entrada e artefatos.
- Com a iniciativa ativa gravada entre aspas, o chat, o Cockpit e as
  aprovações passam a usar a mesma pasta da iniciativa.
- Migrar o kit respeita o harness escolhido (Claude Code ou GitHub Copilot) e
  o tipo de projeto (novo ou existente), não reescreve os agentes de domínio
  do seu workspace e dá o mesmo resultado se rodar duas vezes.
- Aprovar uma fase não apaga mais o registro dela no estado de delivery.
- Fases gravadas com um nome alternativo são reconhecidas em todo lugar, e a
  aprovação delas não trava mais.
- Aprovar a fase de revisão ou a de incidente não encerra mais o pipeline antes
  da hora.
- Um valor que quebraria o arquivo de estado vira erro, em vez de um sucesso
  falso.
- O CLI de estado responde sempre com uma linha JSON: flag desconhecida,
  flag sem valor e `--help` dão erro de uso, em vez de derrubar o processo.
- Um id de fase com caractere especial dá erro de uso, em vez de erro interno
  ou de regravar outra fase.
- Um evento de atividade que chegava com horário anterior ao do último já
  mostrado só aparecia ao reabrir o Cockpit; agora aparece na hora, com o
  aviso.
- O kit que a Jataí instala nos projetos não afirma mais que a extensão envia
  os eventos de atividade para um servidor. Eles ficam na sua máquina, em
  `.github/artifacts/runs/`, fora do git, e os agentes os registram pelo CLI de
  estado, nunca à mão.
- Saíram do kit os resquícios da plataforma anterior: o guia de testes, os ADRs
  de exemplo e as referências a registry de templates, a ADRs que o seu projeto
  não tem e a skills que não existem. Os ADRs de exemplo agora descrevem a
  arquitetura de referência de cada stack.

### Segurança

- Um template em zip com entrada que escaparia da pasta do projeto faz a
  geração falhar sem gravar nada.
- Abrir ou revelar um arquivo pelo Cockpit ou pelo chat só funciona dentro do
  workspace, inclusive com links simbólicos.
- Um id de iniciativa que viraria caminho fora do workspace é recusado, no CLI
  e no State Service.
- O State Service limita o corpo de cada requisição a 1 MiB e compara o token
  em tempo constante.
- O nonce da política de segurança das telas vem de um gerador criptográfico.
- A política de segurança do Cockpit não libera mais imagem remota.
- O `.gitignore` gerado ignora a pasta do State Service, que guarda o token
  local, para ele nunca ser versionado.

[Não lançado]: https://github.com/rafaelnicolett/jatai/commits/main
