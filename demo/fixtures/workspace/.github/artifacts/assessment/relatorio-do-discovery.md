# Relatório de Discovery · Biblioteca de Bairro

> Workspace demo fictício: os números e os achados abaixo são inventados.

Consolidado pelo `@assessor` em 2026-10-05. O Gate D1 foi aprovado por Pessoa
Exemplo nos dois repositórios.

| Repositório | Stack | Padrão hoje | Cobertura | Achados (críticos · altos · médios · baixos) |
|---|---|---|---|---|
| biblioteca-api | `python-fastapi` | camadas, 84% | 58% | 0 · 1 · 3 · 4 |
| biblioteca-web | `react-vite-typescript` | por feature, 79% | 24% | 0 · 0 · 2 · 3 |

## O que pesa

1. `EmprestimoService` mistura regra e acesso a dados (`debt-api-01`): é o
   achado alto e o motivo da modernização `mod-emprestimos-hexagonal`.
2. `prazo.py` não tem teste (`debt-api-02`): um erro de prazo passa sem aviso.
3. O portal não trata falha de rede (`debt-web-01`).

## Relatórios

- API: [tecnologia](repos/biblioteca-api/tech-stack/tech-radar.md), [arquitetura](repos/biblioteca-api/architecture/arch-discovery.md), [convenções](repos/biblioteca-api/coding-guidelines/project-coding-guide.md), [qualidade](repos/biblioteca-api/quality/quality-report.md), [dívida](repos/biblioteca-api/debt/tech-debt.md)
- Portal: [tecnologia](repos/biblioteca-web/tech-stack/tech-radar.md), [arquitetura](repos/biblioteca-web/architecture/arch-discovery.md), [convenções](repos/biblioteca-web/coding-guidelines/project-coding-guide.md), [design](repos/biblioteca-web/design/design-system.md), [qualidade](repos/biblioteca-web/quality/quality-report.md), [dívida](repos/biblioteca-web/debt/tech-debt.md)
- Entre os dois: [domínio](domain/context-map.md), [negócio](business/business-context.md), [linha de base](business/baseline-metrics.json), [grafo](repo-graph.yaml), [stack e skills](stack-skills.md)
