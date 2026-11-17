<!--
Obrigado pelo PR. O checklist abaixo repete as regras do CONTRIBUTING.md.
Marque com [x] o que se aplica. Se um item não se aplica, deixe como está.
-->

## O que muda

<!-- Uma ou duas frases, pensando em quem usa a Jataí. Se houver issue: "Resolve #123". -->

## Tipo (só um)

- [ ] Correção de bug
- [ ] Refactor (mesmo comportamento)
- [ ] Feature
- [ ] Documentação
- [ ] Build, CI ou manutenção

## Checklist

**Sempre:**

- [ ] Um item só: este PR faz uma coisa e não mistura refactor, correção e feature.
- [ ] Todo commit tem `Signed-off-by` (DCO, `git commit -s`).
- [ ] As mensagens seguem Conventional Commits.
- [ ] O `npm run ci:local` ficou verde na minha máquina (resumo no fim).

**Correção:**

- [ ] Inclui um teste que falhava antes da correção e passa com ela. Nome do teste:

**Refactor:**

- [ ] A área já tinha teste cobrindo o comportamento antes do refactor.
- [ ] Golden master, snapshots e contratos não mudaram.

**Feature:**

- [ ] Os cenários BDD foram combinados na issue antes do código. Link:

**Golden master e contratos:**

- [ ] Nada mudou em `tests/golden/__golden__/` nem nos snapshots, **ou** mudou de propósito, foi regenerado com `UPDATE_GOLDEN=1` (ou `-u`) e cada arquivo está explicado abaixo.
- [ ] Nenhum contrato congelado mudou, **ou** a mudança é aditiva e está explicada abaixo. Renomear ou remover exige ADR.

**Dados e conteúdo:**

- [ ] Nenhuma chamada de rede nova, telemetria ou recurso remoto.
- [ ] Fixtures, exemplos e prints usam só dados fictícios.
- [ ] Se a mudança aparece para quem usa, há uma linha na seção "Não lançado" do `CHANGELOG.md`.

## Golden e contratos: o que mudou e por quê

<!-- Só se algo mudou. Um item por arquivo ou grupo de arquivos do diff. -->

## Resumo do `npm run ci:local`

<details>
<summary>Tabela</summary>

```text
cole aqui a tabela do fim do npm run ci:local
```

</details>
