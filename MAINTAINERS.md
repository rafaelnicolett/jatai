# Mantenedores da Jataí

Quem mantém o projeto hoje, e em que áreas. Os papéis e o caminho para virar
mantenedor estão no [GOVERNANCE.md](GOVERNANCE.md).

## Mantenedores

| Pessoa | GitHub | Papel | Áreas |
|---|---|---|---|
| Rafael Nicoleti | [rafaelnicolett](https://github.com/rafaelnicolett) | Mantenedor principal e titular do projeto | Todas: kit, Cockpit, Wizard, CLI, mapa, CI e documentação |

## Mantenedores eméritos

Ninguém ainda.

## Como lançar uma versão

A release sai por uma tag e é automática, em `.github/workflows/release.yml`.
Só quem está em "Required reviewers" do environment `release` consegue
autorizar a publicação.

1. No `CHANGELOG.md`, troque "[Não lançado]" por "[X.Y.Z] - AAAA-MM-DD" e suba a
   versão com `npm version X.Y.Z --no-git-tag-version`.
2. Rode `npm run release:check -- --tag vX.Y.Z`: ele confere a tag, a versão e
   o CHANGELOG, e diz o que falta.
3. Abra o PR, espere o CI verde nos três sistemas e faça o merge na `main`.
4. Marque a tag na ponta da `main` e envie: `git tag -s vX.Y.Z && git push origin vX.Y.Z`.
5. Aprove o job "publicar". Ele envia o mesmo `.vsix` que passou nas
   verificações para o Marketplace do VS Code e para o Open VSX, e cria a
   GitHub Release com as notas do CHANGELOG.

Uma tag com sufixo (`v1.0.0-rc.1`) vira só uma GitHub Release de
pré-lançamento, sem passar pelas lojas. Para ensaiar sem publicar nada:
Actions → Release → Run workflow, com "publicar" desmarcado.

Configuração única, no Marketplace: crie o publisher `jatai` e uma política
em **Trusted Publishing** com repository owner `rafaelnicolett`, repository
`jatai`, workflow `release.yml` e environment `release`. O job `publicar`
pede um token OIDC de curta duração; não existe `VSCE_PAT`. No GitHub, em
Settings → Environments → release, configure os required reviewers e, se
quiser Open VSX, o segredo `OVSX_PAT` (token do namespace `jatai`). Quem não
tiver Open VSX fica sem essa loja, e o resumo do job avisa.

## Como falar com quem mantém

Use os canais públicos do projeto, para que a conversa ajude mais gente:

- **Dúvida:** abra uma issue com o template "Pergunta".
- **Bug ou ideia:** abra uma issue com o template certo.
- **Vulnerabilidade:** siga o [SECURITY.md](SECURITY.md). Nunca em issue
  pública.
- **Problema de conduta:** siga o [código de conduta](CODE_OF_CONDUCT.md).

Os mantenedores não dão suporte por mensagem pessoal nem por outras redes.
