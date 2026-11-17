<!-- Gerado por scripts/gen-agent-catalog.mjs a partir de kit/. Não edite à mão: rode `npm run docs:agents`. -->

# @test-backfill-agent

> Execution: cria a rede de segurança (characterization tests) que pina o comportamento atual antes de qualquer refactor ou migração.

| Campo | Valor |
|---|---|
| Stream | Execução (`execution`) |
| Camada | `L2-phase` |
| Fase | `3a-test-backfill` |
| Escopo | um repositório por vez (`repo`) |
| Orçamento de contexto | alto |
| Edições do kit | projeto existente (brownfield) |
| Fonte | `kit/content/agents/execution/test-backfill-agent.agent.md` |

## O que faz

Execution: cria a rede de segurança (characterization tests) que pina o comportamento atual antes de qualquer refactor ou migração.

## Quando entra

- Recebe o trabalho de: [@jatai](jatai.md) (o orquestrador), [@refactor-agent](refactor-agent.md), [@migration-agent](migration-agent.md), [@feature-adder](feature-adder.md).
- Entrega para: [@jatai](jatai.md) (o orquestrador).
- Escala para: [@jatai](jatai.md) (o orquestrador).

## Skills

- `coding-guidelines-<repo-id>`: gerada pela Descoberta, uma por repositório, a partir do código dele. Não faz parte do kit.
- [`characterization-testing`](skills.md#characterization-testing): Testes de caracterização (Michael Feathers — Working Effectively with Legacy Code) — pinam o comportamento atual do sistema, mesmo se estiver errado, antes de qualquer refactor.
- [`qa-strategy`](skills.md#qa-strategy): Estratégia de qualidade — pirâmide de testes por stack, definição de cobertura, seleção de testes (smoke/regression/release), critérios de flakiness, mutation testing, contract testing.
- [`bdd-gherkin`](skills.md#bdd-gherkin): Padrão profundo de BDD/Gherkin — escrita de cenários executáveis em UL do domínio, given/when/then declarativos, scenario outline, tags por release/risco/persona.
- [`integration-testing`](skills.md#integration-testing): Padrão profundo de testes integrados — Testcontainers para infra real, contract testing entre serviços (Pact + OpenAPI), E2E API/UI, ambiente isolado por PR, observabilidade dos próprios testes.

## O que recebe

- `.github/artifacts/assessment/coverage-gaps.md`
- `repos/<repo-id>/**`

## O que produz

- `repos/<repo-id>/**/*test*`
- `repos/<repo-id>/**/*spec*`
- `.github/artifacts/execution/test-backfill-report.md`

## Contrato de saída

O agente só passa adiante quando isto vale.

- Characterization tests cobrindo comportamento atual (não desejado, ATUAL) do alvo
- Testes verdes ANTES de qualquer refactor
- Cobertura do módulo alvo ≥ threshold definido (default 70%)
- Testes determinísticos (sem sleep, sem retry, sem random sem seed)
- Snapshot/golden master se aplicável (legado complexo, output difícil de assertar)

## Regras de proteção

- MULTI-REPO: atue em UM repositório por vez (repos/&lt;repo-id>/) — nunca edite fora dele
- CONFORM: escreva no padrão descoberto do repo (arch_current em repos.yaml) — carregue a skill coding-guidelines-&lt;repo-id>
- Se o padrão for inadequado: NÃO refatore. Registre achado e sugira iniciativa modernization
- NÃO refatorar enquanto cria testes — só pinar comportamento existente
- NÃO mudar a interface pública para "facilitar" o teste — usa-se como está
- Testes devem falhar se o comportamento atual mudar (mesmo se for bug)
- Se um teste para um comportamento claramente errado, criar e marcar com `@known-bug` (não corrigir agora)

---

Volta ao [índice dos agentes](README.md) · [skills do kit](skills.md)
