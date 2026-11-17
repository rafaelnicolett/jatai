# Como contribuir com a Jataí

Que bom que você chegou. A Jataí é uma extensão do VS Code, um kit de agentes e
uma metodologia de delivery, tudo aberto sob a licença MIT. Ela funciona com
Claude Code e com GitHub Copilot, e fala português primeiro.

Toda ajuda conta: relatar um bug, melhorar um texto, escrever um teste, propor
um agente novo ou corrigir uma falha. Este guia mostra como montar o ambiente,
como conferir seu trabalho antes de abrir o PR e quais são as regras da casa.
Se algo aqui não estiver claro, isso também é um bug: abra uma issue.

Escreva em português. Se preferir inglês, tudo bem.

## Antes de começar

- Leia o [código de conduta](CODE_OF_CONDUCT.md). Ele vale em issues, PRs,
  revisões e qualquer outro espaço do projeto.
- Achou uma vulnerabilidade? **Não abra issue pública.** Siga o
  [SECURITY.md](SECURITY.md).
- Procure nas issues abertas antes de criar uma nova. Se já existe, comente
  lá.
- Para mudança grande (feature nova, agente novo, mudança de contrato), abra
  uma issue antes de escrever código. Assim ninguém perde trabalho.
- Quer um primeiro passo? Procure as labels `boa primeira issue` e
  `ajuda bem-vinda`.

## Montar o ambiente

### O que você precisa

- **Git**.
- **Node.js 20**, a versão que o CI usa. Outra versão costuma funcionar, mas
  um resultado diferente do CI pode vir daí (o `ci:local` avisa).
- **VS Code 1.90 ou mais novo**, para rodar a extensão.
- Opcional: o [gitleaks](https://github.com/gitleaks/gitleaks) no `PATH`, para
  a varredura de segredos rodar também na sua máquina. Sem ele, o passo é
  pulado localmente e roda no CI.
- Opcional: Claude Code ou GitHub Copilot, para experimentar o kit de agentes
  num workspace de teste.

No Windows, use um terminal **Git Bash** ou o **WSL**: os scripts do projeto
são POSIX `sh`. E clone com a conversão de fim de linha desligada, como o CI
faz. Sem isso, testes que leem frontmatter quebram:

```bash
git clone -c core.autocrlf=false -c core.eol=lf https://github.com/rafaelnicolett/jatai.git
```

### Clonar e instalar

```bash
git clone https://github.com/rafaelnicolett/jatai.git
cd jatai
npm ci --ignore-scripts
npm ci --ignore-scripts --prefix webview-ui
```

São duas instalações: a raiz (extensão, CLI, servidor MCP) e o `webview-ui/`
(a interface do Cockpit, em React). O `--ignore-scripts` é o mesmo do CI:
nenhum passo de desenvolvimento precisa dos scripts de instalação das
dependências.

### Compilar e rodar a extensão

```bash
npm run build
code --extensionDevelopmentPath="$PWD"
```

O segundo comando abre uma janela do VS Code com a sua versão da extensão
carregada. Abra nela uma pasta de teste, nunca um projeto real.

Para gerar o pacote e instalar como usuário:

```bash
npm run package
code --install-extension <arquivo gerado>.vsix
```

### Onde fica cada coisa

| Pasta | O que tem |
|---|---|
| `src/` | O código da extensão: comandos, Cockpit (lado do host), Wizard, chat, State Service, CLI e servidor MCP |
| `webview-ui/` | A interface do Cockpit em React, com testes próprios |
| `kit/` | A fonte única do kit de agentes e skills (`kit.manifest.yaml` diz o que cada edição recebe: greenfield e brownfield). O build materializa as edições em `dist/kit/`, fora do git |
| `tests/` | Testes do host, incluindo golden master (`tests/golden/`), contratos (`tests/contract/`) e caracterização (`tests/characterization/`) |
| `scripts/` | Os gates do CI: conteúdo do pacote, licenças, conteúdo proibido, DCO |
| `media/` | Ícones e imagens da extensão |

## Conferir tudo antes do PR: `npm run ci:local`

```bash
npm run ci:local
```

Roda na sua máquina os mesmos passos do CI, na mesma ordem, e termina com uma
tabela de resumo. Um passo que falha não interrompe os outros, então você vê
tudo de uma vez:

1. instalação limpa (`npm ci`) na raiz e no `webview-ui/`;
2. typecheck do host e do webview;
3. lint do host e do webview (no webview, também as fronteiras `ds-is-leaf` e `no-cross-feature`, ADR-0016);
4. testes do host e do webview;
5. build completo e validação do kit;
6. árvore limpa: o build e os testes não podem alterar arquivo versionado;
7. empacotamento e conferência do conteúdo do `.vsix`;
8. segredos (gitleaks, se estiver no `PATH`);
9. conteúdo proibido (dado de cliente, conteúdo pago de terceiro);
10. licenças das dependências e `THIRD_PARTY_NOTICES` em dia;
11. DCO dos seus commits em relação à `main`.

Opções:

- `npm run ci:local -- --skip-install` pula os dois `npm ci` e usa o
  `node_modules` que já existe. É mais rápido quando você só mudou código.
- `CI_LOCAL_TMPDIR=<pasta>` muda onde ficam os logs e o `.vsix` de teste.

O CI do GitHub roda os mesmos passos em Ubuntu, macOS e Windows, com Node 20.
Um PR só é aceito com o CI verde nos três.

## Regras da casa

Estas regras existem para proteger uma coisa: o núcleo da metodologia, o que a
Jataí instala e grava no workspace de quem usa. Elas parecem muitas no
começo, mas todas cabem numa ideia: **cada PR faz uma coisa só, e prova o que
fez.**

### Um item por PR

Um PR resolve uma issue, corrige um bug, dá um passo de refactor ou entrega
uma feature. Só um. PR pequeno é revisado rápido, e se algo der errado, é
revertido sem levar outra coisa junto.

### Refactor, correção e feature nunca no mesmo PR

- **Refactor** muda a estrutura sem mudar o comportamento. A prova é que os
  testes, o golden master e os contratos ficam iguais.
- **Correção** muda um comportamento errado para o certo.
- **Feature** acrescenta um comportamento novo.

Misturar os três esconde mudança de comportamento dentro de um refactor, e
ninguém consegue revisar isso com segurança. Se no meio de um refactor você
achar um bug, anote numa issue e corrija num PR separado.

### Teste antes de refactor

Só refatore código que tem teste cobrindo o comportamento atual. Se a área não
tem cobertura, o primeiro PR é só de teste: um teste de caracterização, que
registra o comportamento de hoje, mesmo que esteja errado. O refactor vem
depois, num PR próprio, com esses testes verdes do começo ao fim.

### Correção vem com o teste que falhava antes

Todo PR de correção traz um teste que **falha sem a correção** e passa com ela.
Escreva o teste primeiro, veja falhar, depois corrija.

Você vai encontrar testes com `@known-bug:` no nome. Eles registram um bug
conhecido, fixando o comportamento errado de hoje. Corrigir um desses bugs é
inverter o teste: o `@known-bug` sai, o teste passa a exigir o comportamento
certo (os existentes usam o prefixo `REGRESSÃO:`) e a correção entra no mesmo
PR. São bons pontos de partida para uma primeira contribuição.

### BDD antes de feature nova

Feature nova começa por cenários em Gherkin, antes de qualquer código. Por
exemplo:

```gherkin
# language: pt
Funcionalidade: Aprovar um gate pelo Cockpit
  Cenário: checklist completo libera a aprovação
    Dado uma iniciativa parada no gate D2
    E todos os itens do checklist humano marcados
    Quando eu clico em "Aprovar"
    Então a iniciativa avança para Execution
```

Escreva os cenários na issue da feature e espere o aceite de quem mantém.
Com os cenários combinados, a implementação tem um alvo claro, e a revisão
confere se ele foi atingido.

### Golden master: regenere só quando a mudança é a intenção

O golden master (`tests/golden/`) congela, byte a byte, o que a Jataí instala
no workspace (o gerador, nos dois kits e nos dois harnesses) e o que o CLI de
estado responde e grava. É a prova mecânica de que o núcleo da metodologia não
mudou sem ninguém ver.

Para rodar:

```bash
npx vitest run --no-cache tests/golden
```

Se ele falhar, pergunte antes de tudo: **eu queria mudar isso?**

- **Não queria** (refactor, por exemplo): o golden está certo e o código é que
  mudou demais. Volte e ajuste o código. PR de refactor nunca altera golden.
- **Queria** (correção ou feature que muda o que é instalado): regenere e
  revise o diff.

```bash
UPDATE_GOLDEN=1 npx vitest run --no-cache tests/golden
git diff --stat -- tests/golden/__golden__
```

- A regravação só roda localmente. Com a variável `CI` definida, ela recusa.
- Ela regrava o grupo inteiro (gerador ou CLI) e recusa rodar com `-t`, para não
  apagar os casos que ficaram de fora. Para regravar só um grupo, passe o
  arquivo: `UPDATE_GOLDEN=1 npx vitest run --no-cache tests/golden/cli.golden.test.ts`.
- No PR, explique cada arquivo que mudou no diff do golden.
- `GOLDEN_KEEP_SANDBOX=1` mantém as pastas temporárias para você depurar.

Os testes de contrato e de caracterização usam snapshots do Vitest. A regra é a
mesma: atualize com `-u` só quando a mudança é a intenção, e só o arquivo que
você mexeu:

```bash
npx vitest run -u tests/characterization/<arquivo>.test.ts
```

Os detalhes do golden estão em [`tests/golden/README.md`](tests/golden/README.md).

### Contratos congelados

Outras ferramentas, agentes e workspaces já existentes dependem de alguns
formatos. Eles estão congelados, e os testes em `tests/contract/` reprovam
qualquer mudança:

- os caminhos e os schemas YAML dos artefatos em `.github/artifacts/` do
  workspace;
- os protocolos dos agentes;
- o CLI de estado: o envelope JSON, os códigos de erro e os códigos de saída;
- as ferramentas do servidor MCP e a API HTTP do State Service;
- os ids de comando, as settings e as mensagens entre a extensão e as telas
  (Cockpit e Wizard).

Precisa mudar um contrato? Abra uma issue primeiro. A mudança aceita é aditiva:
acrescenta, sem renomear nem remover. Renomear ou remover só com uma ADR (ver
[GOVERNANCE.md](GOVERNANCE.md)) e um caminho de migração para quem já usa. Em
todos os casos, vai num PR de comportamento, nunca dentro de um refactor.

### Zero envio de dados

A Jataí é 100% local. A extensão não tem telemetria e não envia nada para
servidor nenhum. Não acrescente:

- chamada de rede, a não ser para o State Service em `127.0.0.1`;
- telemetria, analytics ou relatório de erro remoto;
- recurso remoto nas telas (CDN, fonte da web, imagem externa).

Dois testes de contrato vigiam isso no CI:

- `tests/contract/zero-egress.contract.test.ts` reprova URL remota no código,
  nos bundles e na política de segurança (CSP) das telas;
- `tests/contract/zero-egress-runtime.contract.test.ts` ativa a extensão e
  percorre os fluxos principais com a rede cortada no socket. Qualquer
  tentativa de conexão fora do `127.0.0.1` reprova.

Se a sua ideia precisa de rede, converse numa issue antes. Um recurso que
envia dado para fora da máquina exige uma ADR e não pode vir ligado por
padrão.

### Conteúdo e dependências

- **Dados só fictícios.** Fixtures, exemplos e prints usam dados inventados. O
  scanner de conteúdo proibido (`node scripts/content-scan.mjs`) roda no CI e
  aponta `arquivo:linha` sem imprimir o texto achado.
- **Nada de conteúdo de terceiro sem licença compatível**, no código e no kit.
- **Dependência nova** precisa de licença aceita pelo gate
  (`node scripts/license-check.mjs`). Depois de mexer em dependências, rode
  `npm run notices` para regerar o `THIRD_PARTY_NOTICES.md` e versione o
  resultado. O `npm run notices:check` confere.
- **Bundles do CLI e do servidor MCP.** O CLI de estado e o servidor MCP vão
  para o kit já compilados, em `kit/scripts/`. Se o `git status` mostrar um
  deles alterado depois do `npm run build`, versione-o no mesmo commit. O passo
  "árvore limpa" do CI reprova quando eles ficam desatualizados.

## Commits

### Conventional Commits

As mensagens seguem o [Conventional Commits](https://www.conventionalcommits.org/pt-br/v1.0.0/),
em português:

```text
<tipo>(<escopo opcional>): <o que muda, em uma linha>

<por que muda, e o que mais alguém precisa saber para revisar>
```

| Tipo | Quando |
|---|---|
| `feat` | comportamento novo |
| `fix` | correção de bug |
| `refactor` | estrutura nova, mesmo comportamento |
| `test` | só teste |
| `docs` | só documentação |
| `build` | build e empacotamento |
| `ci` | workflows e gates |
| `chore` | manutenção que não cabe acima |

O escopo é opcional. Quando usar, prefira a área: `kit`, `cockpit`, `wizard`,
`cli`, `mapa`. Mudança que quebra compatibilidade leva `!` depois do tipo
(`feat(cli)!: ...`) e explica no corpo o que quebra.

Exemplo:

```text
fix(cli): id com ".." é recusado com USAGE e nada é gravado

O id da iniciativa vira nome de pasta. Com "../", o CLI gravava fora do
workspace. Agora qualquer id que não seja um único segmento de caminho dá
USAGE (exit 1).
```

### DCO: assine cada commit com `git commit -s`

A Jataí usa o [Developer Certificate of Origin](https://developercertificate.org/)
(DCO) no lugar de um CLA. Ao assinar, você declara que escreveu a contribuição
ou que tem o direito de enviá-la sob a licença do projeto. Você não cede seus
direitos autorais: a contribuição entra sob a mesma licença MIT.

Assinar é acrescentar uma linha no fim da mensagem, e o Git faz isso por você:

```bash
git commit -s -m "docs: corrige o passo de instalação no Windows"
```

O resultado é uma linha `Signed-off-by: Seu Nome <seu-email>`, com o nome e o
e-mail do seu `git config`. O workflow de DCO confere todo commit do PR:

- o e-mail do `Signed-off-by` precisa ser o mesmo do autor do commit
  (maiúsculas e minúsculas não importam);
- commits de merge e de bots são pulados.

Não quer expor seu e-mail? Use o endereço `noreply` que o GitHub oferece nas
configurações de e-mail da sua conta, tanto no `git config user.email` quanto
no commit.

Esqueceu de assinar?

```bash
git commit --amend -s --no-edit         # só o último commit
git rebase --signoff main               # todos os commits da branch
git push --force-with-lease
```

## Propor um agente ou uma skill para o kit

O kit é o coração da Jataí: são os agentes e as skills que a extensão instala
no workspace, para o Claude Code e para o GitHub Copilot.

1. **Abra uma issue** com o template de feature e a área "kit". Conte:
   - que problema o agente ou a skill resolve, e para quem;
   - em que stream e fase ele atua (Discovery, Planning, Execution ou
     Operation) e quais agentes conversam com ele;
   - se é para projetos novos (greenfield), existentes (brownfield) ou os
     dois;
   - como ele funciona nos dois harnesses. Um agente que só funciona num deles
     ainda não está pronto.
2. **Espere o aceite** antes de escrever. O kit está indo para uma fonte única
   com adaptadores por harness, e a estrutura de pastas pode mudar. A conversa
   na issue evita que você escreva no lugar errado.
3. **Escreva** seguindo o que já existe:
   - agentes em `kit/content/agents/<stream>/<id>.agent.md` (ou em
     `kit/variants/<edição>/` quando a edição muda o arquivo), e a edição que
     o recebe em `kit/kit.manifest.yaml`;
   - skills em `kit/content/skills/<id>/SKILL.md`, listadas nas edições do
     `kit/kit.manifest.yaml`;
   - frontmatter YAML válido, com um `description` que diga quando usar;
   - skill nova do greenfield registrada também em
     `kit/content/skills/registry.yaml` e declarada no `uses_skills` dos
     agentes que a usam;
   - texto em português, sem dado real e sem conteúdo de terceiro.
4. **Confira**:

   ```bash
   node scripts/copy-templates.js                            # o kit está completo
   npx vitest run tests/skills-declared-vs-packaged.test.ts  # skills declaradas existem
   npx vitest run --no-cache tests/golden                    # o que muda na instalação
   ```

   Um agente ou uma skill nova muda o que a Jataí instala, então o golden do
   gerador muda. É esperado: regenere com `UPDATE_GOLDEN=1` e explique o diff no
   PR. O `ci:local` confere também que o arquivo novo vai no `.vsix`.

## Rodar só uma parte dos testes

Enquanto você trabalha, rode só o que interessa:

```bash
npm test -- tests/workspace-path.test.ts   # um arquivo
npx vitest run tests/contract              # uma pasta (contratos)
npx vitest run tests/characterization      # caracterização
npx vitest run -t "zip-slip"               # testes cujo nome contém o texto
npm run test:watch                         # roda de novo a cada mudança
```

No webview (Cockpit):

```bash
npm run test:webview                                # tudo
npm run test:webview -- tests/ProgressRail.test.ts  # um arquivo
```

Typecheck e lint separados:

```bash
npm run typecheck
npm run typecheck:webview
npm run lint
npm run lint:webview
```

Antes de abrir o PR, rode o `npm run ci:local` completo.

## Abrir o pull request

1. Crie uma branch a partir da `main`.
2. Faça seus commits assinados (`git commit -s`).
3. Rode o `npm run ci:local` e confira a tabela.
4. Abra o PR e preencha o template. O checklist dele repete estas regras.
5. Se a mudança aparece para quem usa, acrescente uma linha na seção
   "Não lançado" do [CHANGELOG.md](CHANGELOG.md), escrita para quem usa.

Quem mantém o projeto revisa assim que puder. Comentário de revisão é sobre o
código, nunca sobre você. Pode perguntar, discordar e pedir ajuda.

Como as decisões são tomadas e quem mantém o projeto:
[GOVERNANCE.md](GOVERNANCE.md) e [MAINTAINERS.md](MAINTAINERS.md).

Obrigado por contribuir.
