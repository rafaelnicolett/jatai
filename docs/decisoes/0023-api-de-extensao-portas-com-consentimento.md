# ADR-0023: API pública de extensão sobre as portas, com consentimento explícito

## Status

aceita em 2026-11-15, pelo titular do projeto, como está, para a v1.

## Contexto

- Os cortes da [ADR-0015](0015-v1-aberta-local-sem-envio-de-dados.md) trocaram o
  envio de dados e o registro de templates por portas com implementação Null:
  - `TelemetrySink`;
  - `TemplateSource` (manifesto e zip de template);
  - `RemoteSyncProvider` (sincronização remota).
- O núcleo é 100% local, e um teste garante zero egress por padrão.
- Quem usa a Jataí numa empresa pode querer integrar serviços próprios, templates
  internos ou painéis próprios. Isso só faz sentido se a integração puder se plugar
  **sem fork** e sem mudar a licença do núcleo.
- O VS Code já oferece o mecanismo: o valor que `activate()` devolve fica em
  `vscode.extensions.getExtension(id).exports` para outras extensões, que declaram
  `extensionDependencies`.

## Decisão

**1. A extensão exporta uma API versionada no `activate()`:**

```ts
interface JataiApi {
  readonly apiVersion: 1;
  registerTemplateSource(source: TemplateSource, meta: ProviderMeta): vscode.Disposable;
  registerRemoteSyncProvider(provider: RemoteSyncProvider, meta: ProviderMeta): vscode.Disposable;
  registerTelemetrySink(sink: TelemetrySink, meta: ProviderMeta): vscode.Disposable;
}
interface ProviderMeta {
  id: string;            // id da extensão que registra
  displayName: string;
  purpose: string;       // em uma frase, mostrado no pedido de consentimento
  destinations: string[]; // para onde os dados vão (domínios), mostrado ao usuário
}
```

**2. Instalar não liga nada.** Cada registro só passa a valer depois de um
consentimento explícito da pessoa, **por workspace**:
- o pedido mostra quem é a extensão, para que serve, para onde os dados vão e quais
  dados saem (a lista do item 4);
- o consentimento pode ser revogado num comando "Extensões conectadas", que lista o
  que está ligado;
- sem consentimento, a porta continua com a implementação Null.

**3. Workspace Trust:** em workspace não confiável, os registros são ignorados.

**4. Lista fechada de dados por porta**, igual à regra de privacidade do contrato de
atividade de agente ([ADR-0020](0020-mapa-isometrico-tempo-real-eventos-de-agente.md)):
- `TelemetrySink` recebe só eventos no formato `RunEvent`, com os campos da lista
  fechada do contrato, sem conteúdo de arquivo;
- `RemoteSyncProvider` recebe só os arquivos de `.github/artifacts/**` que a pessoa
  escolher no consentimento;
- `TemplateSource` só entrega template; não recebe dado do workspace além do id do
  template.

**5. O núcleo nunca faz rede.** Quem faz é a extensão registrada, sob a licença e a
responsabilidade dela. O teste de zero egress continua valendo para o núcleo:
- sem extensão, zero conexões;
- com uma extensão falsa consentida, saída só por ela.

**6. Um provedor ativo por porta.** Se houver mais de um registrado, a pessoa escolhe
qual liga.

**7. Tipos publicados** (MIT, só tipos) junto do repositório aberto, com semver.
`apiVersion` muda só em versão major. Extensões de terceiros podem ser proprietárias:
a MIT permite, e o núcleo nunca depende delas. Os testes usam implementações falsas.

## Consequências

- (+) Extensões de terceiros se integram sem fork, e quem usa a Jataí sabe o que cada
  uma pode ver e para onde vai.
- (+) O padrão "100% local" fica explícito e auditável: qualquer saída de dados passa
  por um consentimento visível e revogável.
- (−) Mais superfície pública para manter compatível entre versões.
- (−) O consentimento por workspace precisa de UI (no Cockpit) e de testes próprios.
- (−) Os nomes da API dependem da marca e das portas ligadas no container da
  extensão: a implementação vem depois deles.

A implementação é um PR de feature próprio, com BDD antes.
