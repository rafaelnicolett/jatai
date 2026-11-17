# Skills

Skills L3 são **capacidades atômicas reutilizáveis** invocadas pelos agentes
via `uses_skills`. Nunca pelo usuário direto. Carregadas no contexto **só
quando declaradas** pela fase ativa (eficiência de token).

> **Mapa dinâmico completo**: ver [registry.yaml](registry.yaml) (machine-readable)
> e [docs/delivery-flow.md](../../docs/delivery-flow.md) (humano).

## Skills de referência

A lista completa, com os agentes que consomem cada skill, está no [registry.yaml](registry.yaml).

| Skill | Profundidade | Agentes consumidores principais |
|---|---|---|
| [ai-agent-author](ai-agent-author/SKILL.md) | profunda | `@backend-python-agentic` |
| [domain-driven-design](domain-driven-design/SKILL.md) | profunda | `@domain-modeler`, `@bdd`, `@architecture`, `@backend-*`, `@arch-cross` |
| [bdd-gherkin](bdd-gherkin/SKILL.md) | profunda | `@bdd`, `@qa-tester`, `@stream-align` |
| [qa-strategy](qa-strategy/SKILL.md) | profunda | `@qa-tester`, `@quality`, `@reviewer`, `@integration-tests`, `@backend-*`, `@frontend-*` |
| [integration-testing](integration-testing/SKILL.md) | profunda | `@integration-tests`, `@backend-*`, `@arch-cross` |
| [openapi-governance](openapi-governance/SKILL.md) | média | `@architecture`, `@arch-cross`, `@backend-*`, `@frontend-react` |
| [coding-guidelines](coding-guidelines/SKILL.md) | profunda | `@backend-*`, `@frontend-*`, `@reviewer`, `@arch-cross` |
| [ui-ux-design-system](ui-ux-design-system/SKILL.md) | profunda | `@frontend-*`, `@reviewer`, `@quality` |

## Como adicionar uma skill

Use a skill [ai-agent-author](ai-agent-author/SKILL.md) como referência e
siga o template:

```
<host-dir>/skills/<skill-id>/     # <host-dir> é .github (Copilot) ou .claude (Claude)
└── SKILL.md       # frontmatter + corpo profundo
```

E registre em [registry.yaml](registry.yaml) na seção `skills:` + atualize
`uses_skills` dos agentes consumidores.
