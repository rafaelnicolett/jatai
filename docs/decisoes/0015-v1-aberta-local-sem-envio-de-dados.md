# ADR-0015: Escopo da v1 aberta, 100% local e sem envio de dados por padrão

## Status

aceita em 2026-11-14, pelo titular do projeto.

## Contexto

- O produto anterior enviava, a cada início, conclusão e aprovação de fase, o id e o
  nome da iniciativa, o identificador do projeto e a fase para um serviço privado.
  Não havia opt-in, e o envio ignorava as configurações de telemetria do usuário e
  do VS Code.
- Outras dependências de serviços privados:
  - um registro de templates, com uma chave guardada em texto plano;
  - um modo online, com sincronização de iniciativas e de documentos;
  - links para portal e dashboard de destinos privados.
- A extensão ativava em qualquer pasta. Em qualquer pasta aberta, ela:
  - subia o State Service;
  - gravava `server.json` (com token) e um comando em `.claude/commands/`, mesmo fora
    de workspaces da metodologia;
  - não declarava suporte a Workspace Trust.

## Decisão

- Remover da v1: o cliente de sincronização, o buffer de telemetria e a setting
  dela, o registro de templates e as chaves dele, o modo online, o portal e o
  dashboard, a edição só para projeto novo e os ícones carregados de CDN.
- Deixar **portas com implementação Null** (`TelemetrySink`, `TemplateSource`,
  `RemoteSyncProvider`). Assim, uma extensão companheira pode plugar recursos online
  sem fork ([ADR-0023](0023-api-de-extensao-portas-com-consentimento.md)).
- Comportamento de ativação:
  - ativar só em workspace da Jataí (ou de um produto anterior), via
    `workspaceContains`;
  - suportar Workspace Trust, e rodar só em workspace confiável;
  - incluir `server.json` no `.gitignore` gerado;
  - não gravar nada fora de um workspace da Jataí.
- Um teste de CI garante **zero egress** de rede por padrão: ele reprova URL remota
  no código, nos bundles e na política de segurança das telas, e roda os fluxos
  principais com a rede cortada no socket.

## Consequências

- (+) Confiança para o lançamento público e conformidade com a orientação de
  telemetria do VS Code e com a LGPD.
- (+) Os cortes eliminam a maior parte das chaves de configuração e das variáveis de
  ambiente que o produto anterior tinha.
- (−) Os recursos online deixam de existir na edição aberta até a fronteira de plugin
  da ADR-0023 ser implementada.
