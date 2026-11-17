# Glossário

As palavras que aparecem nos documentos e nos arquivos da Jataí, em ordem
alfabética.

| Termo | O que quer dizer |
|---|---|
| **ADR** | *Architecture Decision Record*: um registro curto de uma decisão, com o contexto, o que foi decidido e as consequências. As da Jataí estão em [decisões](../decisoes/README.md) |
| **agente** | um assistente de IA especializado numa tarefa. Nenhum faz tudo. Veja [agentes](agentes.md) |
| **agent-done** | o status de uma fase em que o agente terminou, mas ninguém confirmou ainda. Só vira `done` com a sua resposta |
| **artefato** | o arquivo que registra o que foi decidido ou descoberto. Nunca fica só na conversa |
| **bounded context** | um pedaço do domínio de negócio com linguagem e regras próprias (por exemplo "Empréstimos" e "Reservas"). Pode viver em mais de um repositório |
| **brownfield** | o ponto de partida em que o sistema já existe e já roda. Veja [projeto existente ou novo](brownfield-e-greenfield.md) |
| **Cockpit** | a aba do VS Code onde você acompanha e opera a iniciativa. Lê e escreve nos mesmos arquivos de estado |
| **contrato de saída** (`exit_contract`) | o que precisa valer para um agente passar adiante |
| **dívida técnica** | o custo futuro de uma escolha de hoje. Cada dívida tem juros: o que ela cobra a cada mudança |
| **épico** | o nome de uma onda de trabalho na hierarquia nova. Fecha quando todas as tarefas dele fecham |
| **estado** | o que está registrado nos arquivos de `.github/artifacts/`. Veja [estado em arquivos](estado-em-arquivos.md) |
| **file-as-state** | o princípio de que o arquivo é a fonte da verdade, e o Cockpit é uma janela sobre ele |
| **gate** | o ponto de aprovação humana: o trabalho automático para e espera você. D1, D2 e D3 no projeto existente, G1 e G2 no novo |
| **golden master** | a técnica de guardar uma saída como "esperado" e comparar byte a byte. Veja [golden master](praticas/golden-master.md) |
| **greenfield** | o ponto de partida em que o projeto ainda não existe |
| **guardião** | um agente que só entra nos gates do projeto novo e valida de ponta a ponta |
| **harness** | o ambiente de IA onde os agentes rodam: o Claude Code ou o GitHub Copilot |
| **hotfix** | a iniciativa que corrige um defeito em produção, em três ondas: diagnóstico, fix com testes e validação |
| **iniciativa** | uma unidade de trabalho com começo e fim: `feature`, `modernization` ou `hotfix`. Veja [iniciativas](iniciativas.md) |
| **kit** | os agentes, as skills e as instruções que a Jataí instala no seu projeto |
| **lock de modernização** | a regra de que, enquanto uma modernização está ativa, nenhuma iniciativa nova abre sobre os repositórios dela |
| **MCP** | o protocolo pelo qual os agentes chamam as ferramentas de estado. O kit instala e configura o servidor |
| **modernização** | a iniciativa que muda a forma do código sem mudar o que ele faz |
| **onda** | uma etapa dentro de uma iniciativa, com itens que fecham um a um antes de a onda fechar |
| **orquestrador** | o agente `jatai`, o único ponto de entrada. Valida os pré-requisitos e roteia |
| **scan_profile** | quanto de investigação um repositório merece na Descoberta: `deep`, `shallow` ou `ignore` |
| **side-car** | um agente que entra sob demanda, chamado por outro |
| **skill** | um pacote de conhecimento que um agente só carrega quando o declara em `uses_skills` |
| **State Service** | o servidor local, em `127.0.0.1`, que mantém o Cockpit sincronizado com os arquivos de estado |
| **stream** | cada uma das quatro etapas: Descoberta, Planejamento, Execução e Operação |
| **tarefa** | o item de trabalho de um épico ou de uma onda, com um [status de trabalho](estado-em-arquivos.md#status-de-trabalho) |
| **teste de caracterização** | o teste que fixa o comportamento de hoje, mesmo errado. Veja [testes de caracterização](praticas/testes-de-caracterizacao.md) |
