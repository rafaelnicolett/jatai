<!--
PENDENTE (titular), quando o repositório público existir e antes de divulgar:
ativar o "Private vulnerability reporting" em Settings → Advanced Security
(seção "Security and quality"). Sem isso, o botão "Report a vulnerability"
descrito abaixo não aparece. Detalhes: relatório da F7.3.
-->

# Segurança na Jataí

## Versões com correção de segurança

Antes da versão 1.0, só a **última versão publicada** recebe correção de
segurança. Se você usa uma versão anterior, atualize antes de relatar, e
confira se o problema continua.

| Versão | Recebe correção |
|---|---|
| Última versão publicada | Sim |
| Qualquer versão anterior | Não |

Esta política será revista quando a 1.0 sair.

## Como relatar uma vulnerabilidade

**Não abra issue, PR nem discussão pública sobre a falha.** Use o relato
privado do GitHub, que não pede e-mail:

1. Abra a aba **Security** do repositório e clique em **Report a
   vulnerability**. O caminho direto é
   <https://github.com/rafaelnicolett/jatai/security/advisories/new>.
2. Descreva:
   - a versão da Jataí, o sistema operacional e o harness (Claude Code ou
     GitHub Copilot);
   - o que um atacante consegue fazer e em que condição;
   - os passos para reproduzir, de preferência num workspace de teste;
   - se já existe correção ou contorno que você conheça.
3. Não mande segredo real, dado pessoal nem conteúdo de cliente. Use dados
   fictícios na reprodução.

O relato fica visível só para você e para quem mantém o projeto.

Se o botão **Report a vulnerability** não aparecer, abra uma issue curta
pedindo um canal privado, **sem nenhum detalhe da falha**. Quem mantém
responde por lá.

## O que esperar depois

A Jataí é mantida por uma pessoa, sem equipe de plantão e sem suporte
comercial. Não há prazo garantido de resposta. O que você pode esperar:

1. Uma confirmação de que o relato chegou, quando ele for lido.
2. A conversa continua no próprio relato privado: reprodução, gravidade e
   correção. Se precisar, o GitHub oferece ali um fork privado temporário
   para preparar a correção sem expor a falha.
3. A correção sai numa versão nova. Depois disso, o aviso de segurança é
   publicado, com crédito a você, se você quiser. Quando fizer sentido, o
   projeto pede um identificador CVE pelo próprio GitHub.

Pedimos que você não divulgue a falha antes de a correção sair, ou antes de
combinarmos uma data no relato.

O projeto não tem programa de recompensa.

## Escopo

**Dentro do escopo:**

- o código deste repositório: a extensão, o Cockpit, o Wizard, o chat, o
  State Service, o CLI de estado, o servidor MCP e o gerador que instala o
  kit;
- o kit de agentes e skills, quando uma instrução dele leva o agente a expor
  dado, a executar algo perigoso ou a escrever fora do workspace;
- o pacote publicado (`.vsix`) e o CI deste repositório (por exemplo, um
  workflow que vaze segredo ou rode código não confiável com permissão de
  escrita).

**Fora do escopo:**

- falhas do VS Code, do Claude Code, do GitHub Copilot ou dos modelos de
  linguagem. Relate a quem os mantém;
- falhas de dependências. Relate ao projeto da dependência. Se a Jataí for
  afetada, avise pelo relato privado;
- o que o modelo de linguagem decide fazer por conta própria, além do que as
  instruções do kit pedem;
- ataques que exigem já ter acesso à conta do usuário no sistema operacional;
- as limitações conhecidas listadas abaixo, a menos que você encontre um jeito
  de ir além delas;
- resultado de scanner automático sem demonstração de impacto.

## Como a Jataí se protege hoje

Tudo abaixo pode ser conferido no código e nos testes indicados.

### 100% local, sem telemetria

- A extensão não tem telemetria e não envia dado para servidor nenhum,
  nem do projeto, nem de terceiros.
- As telas (Cockpit e Wizard) têm uma política de segurança de conteúdo (CSP)
  que não libera nenhuma origem remota: nada de CDN, fonte da web ou imagem
  externa. O nonce dessa política vem de gerador criptográfico e muda a cada
  renderização.
- **Onde conferir:** `tests/contract/zero-egress.contract.test.ts` reprova URL
  remota no código, nos bundles e na CSP. O
  `tests/contract/zero-egress-runtime.contract.test.ts` ativa a extensão,
  percorre os fluxos principais com a rede cortada no socket e reprova
  qualquer conexão fora do `127.0.0.1`. Os dois rodam no CI.

A rede só é usada quando **você** pede:

- sincronizar os repositórios declarados no workspace roda `git clone` contra
  os endereços que você mesmo escreveu na lista;
- o participante de chat usa a API de modelos de linguagem do VS Code. A
  conversa vai para o provedor do seu harness (por exemplo, o GitHub
  Copilot), sob as regras e a configuração dele.

Os agentes do kit rodam dentro do seu harness. O que eles enviam ao modelo é
decidido pelo Claude Code ou pelo GitHub Copilot, não pela Jataí.

### State Service: só na máquina, com token

O State Service é a API HTTP local que o Cockpit, o CLI e o servidor MCP usam
para ler e gravar o estado do workspace.

- Escuta só em `127.0.0.1`, numa porta escolhida pelo sistema operacional.
  Nunca em `0.0.0.0` nem na rede.
- Toda chamada exige `Authorization: Bearer <token>`. A única exceção é
  `GET /health`, que responde apenas `{ "ok": true }`, sem dado nenhum.
- O token tem 256 bits aleatórios e é novo a cada ativação da extensão. A
  comparação é feita em tempo constante, e a resposta de erro é a mesma para
  token ausente e token errado.
- O corpo de cada requisição tem limite de 1 MiB.
- O token fica no armazenamento de segredos do VS Code. Uma cópia vai para
  `.github/artifacts/.state-service/server.json`, a única forma de o servidor
  MCP (um processo separado) encontrá-lo. Esse arquivo é criado só com
  permissão do dono (`0600`) em macOS e Linux, e a pasta entra no `.gitignore`
  que a Jataí gera, para nunca ser versionada.
- **Onde conferir:** `src/server/StateServiceServer.ts`,
  `src/server/state-service-auth.ts`, `src/server/state-service-info.ts` e os
  testes `tests/state-service-*.test.ts`.

### Workspace Trust e ativação respeitosa

- A extensão declara que não roda em workspace não confiável. Em modo
  restrito, o VS Code nem a ativa.
- Ela só ativa sozinha em pasta que já tem o arquivo de configuração do kit.
  Numa pasta qualquer, ela ativa quando você abre a view, roda um comando dela
  ou chama o participante de chat, e mesmo assim não grava nada na pasta até
  você instalar o kit nela pelo Wizard.
- O State Service e o observador de artefatos só sobem num workspace da Jataí
  confiável.
- **Onde conferir:** `capabilities.untrustedWorkspaces` e `activationEvents`
  no `package.json`, e `src/data/workspace-activation.ts`.

### Caminhos sempre dentro do workspace

- Abrir ou revelar um arquivo a pedido do Cockpit ou do chat só funciona
  dentro do workspace, inclusive depois de resolver links simbólicos
  (`src/data/workspace-path.ts`).
- Ao extrair um template em zip, qualquer entrada que escaparia da pasta do
  projeto faz a geração inteira falhar, sem gravar nada
  (`src/generator/zip-entry-path.ts`).
- O CLI e o State Service recusam ids que virariam caminho fora do workspace
  e ids de fase com caracteres especiais (`src/cli/lib/validation.ts`).

### Cadeia de suprimentos

- O CI instala com `npm ci --ignore-scripts`, a partir dos lockfiles.
- As actions de terceiros estão fixadas pelo SHA completo do commit, e os
  workflows rodam com permissão de só leitura.
- Todo PR passa por varredura de segredos (gitleaks), gate de licenças das
  dependências, scanner de conteúdo proibido e conferência do conteúdo do
  `.vsix`.
- **Onde conferir:** `.github/workflows/ci.yml` e os scripts em `scripts/`.

### Limitações conhecidas

- **Windows:** a permissão `0600` não existe no NTFS. Qualquer processo
  rodando com a mesma conta de usuário consegue ler o `server.json` e o token.
  Isso vale, na prática, para qualquer arquivo do workspace.
- Qualquer processo local que tenha o token consegue usar a API do State
  Service. É assim que o servidor MCP funciona.
- A Jataí grava no workspace (`.github/artifacts/`) e roda `git`. Por isso ela
  exige workspace confiável.
