---
id: ui-ux-design-system
name: ui-ux-design-system
type: skill
description: Padrão canônico de UI/UX para agentes @frontend-*. Define design tokens, grid, catálogo de componentes, motion/loaders, iconografia e A11y de forma agnóstica de framework. Não escolhe stack de styling (isso é ADR).
applicable_to:
  - Implementação de UIs em projetos gerados pelos templates frontend
  - Redesigns de portais/aplicações em React, Flutter, Compose, SwiftUI
  - Revisão visual por @reviewer e @quality
inputs:
  - PRD com escopo de páginas (`.github/artifacts/prd.md`)
  - ADR de stack de styling (decidido por @architecture)
  - Features Gherkin (`features/**/*.feature`)
outputs:
  - Componentes implementados conforme tokens e catálogo
  - Tokens versionados (`design-tokens/` ou equivalente da stack)
  - Storybook/Widgetbook/Preview (quando suportado pela stack)
  - Checklist de revisão visual anexado ao PR
---

# Skill: ui-ux-design-system

> Capacidade de **design system, motion e iconografia** para todos os
> `@frontend-*`. Não impõe framework de styling — define o **quê** entregar.
> Stack de styling é ADR de `@architecture`.

---

## 0. Quando NÃO usar

- Para mexer em backend ou infra.
- Para escolher entre Tailwind/CSS Modules/styled-components — isso é ADR.
- Para criar componente one-off sem reuso (delega ao agente da stack).

## 1. Princípios

1. **Tokens antes de componentes.** Nada hardcoded em componente.
2. **Estados explícitos.** Todo componente declara default/hover/focus/active/disabled/loading/error/empty.
3. **Motion com propósito.** Loader e transição reduzem percepção de espera, não decoram.
4. **Acessibilidade não é opcional.** WCAG 2.1 AA é mínimo, não meta.
5. **Iconografia única por app.** Misturar sets quebra coesão.
6. **Densidade configurável.** `comfortable` (default) e `compact` por preferência do usuário.
7. **Dark/Light desde o token zero.** Nunca retrofitar dark depois.
8. **Preview-first.** Storybook/Widgetbook/SwiftUI Preview obrigatório onde a stack suporta.

## 2. Design tokens (camada base)

Tokens são a fonte da verdade. Nomeação **semântica**, não literal.

### 2.1 Cor — paleta semântica

| Token | Uso |
|---|---|
| `color.bg.canvas` | Fundo da aplicação |
| `color.bg.surface` | Cards, panels |
| `color.bg.surface.raised` | Modal, popover, toast |
| `color.bg.muted` | Sub-fundos, hover sutil |
| `color.bg.inverse` | Sidebar dark sobre canvas light |
| `color.fg.default` | Texto primário |
| `color.fg.muted` | Texto secundário |
| `color.fg.subtle` | Placeholder, helper text |
| `color.fg.on-accent` | Texto sobre cor de marca |
| `color.border.default` | Bordas neutras |
| `color.border.strong` | Bordas em estado focus |
| `color.accent.primary` / `.hover` / `.active` / `.subtle` | Marca |
| `color.feedback.success` / `.warning` / `.danger` / `.info` | Semáforo |

Cada token tem variante `light` e `dark`. Contraste mínimo: 4.5:1 para texto regular, 3:1 para large/UI.

### 2.2 Tipografia

| Escala | Tamanho ref | Uso |
|---|---|---|
| `display` | 48 / 56 line | Hero |
| `h1` | 32 / 40 | Page title |
| `h2` | 24 / 32 | Section |
| `h3` | 20 / 28 | Subsection |
| `body-lg` | 16 / 24 | Texto longo |
| `body` | 14 / 22 | Texto padrão |
| `caption` | 12 / 18 | Labels, meta |
| `code` | 13 / 20 monospace | Trechos técnicos |

Pesos: `regular` (400), `medium` (500), `semibold` (600), `bold` (700). Stack de fontes: `Inter` (Latin) com fallback system. Justifique qualquer adição.

### 2.3 Espaçamento — escala 4pt

`space.0=0`, `space.1=4`, `space.2=8`, `space.3=12`, `space.4=16`, `space.5=20`, `space.6=24`, `space.8=32`, `space.10=40`, `space.12=48`, `space.16=64`. Sem valores fora da escala.

### 2.4 Radius

`radius.none=0`, `radius.sm=4`, `radius.md=8`, `radius.lg=12`, `radius.xl=16`, `radius.pill=9999`.

### 2.5 Elevação

`elevation.0` (flat), `elevation.1` (card), `elevation.2` (dropdown), `elevation.3` (modal), `elevation.4` (toast). Usar shadow + leve aumento de luminância no surface.

### 2.6 Breakpoints

`xs<480` (mobile), `sm≥640`, `md≥768` (tablet), `lg≥1024` (laptop), `xl≥1280` (desktop), `2xl≥1536` (wide).

### 2.7 Z-index

`z.base=0`, `z.docked=10`, `z.dropdown=1000`, `z.sticky=1100`, `z.overlay=1200`, `z.modal=1300`, `z.popover=1400`, `z.toast=1500`, `z.tooltip=1600`.

### 2.8 Motion

| Token | Valor |
|---|---|
| `motion.duration.instant` | 80ms |
| `motion.duration.fast` | 160ms |
| `motion.duration.base` | 240ms |
| `motion.duration.slow` | 360ms |
| `motion.easing.standard` | `cubic-bezier(0.2, 0, 0, 1)` |
| `motion.easing.emphasized` | `cubic-bezier(0.3, 0, 0, 1)` |
| `motion.easing.exit` | `cubic-bezier(0.4, 0, 1, 1)` |

Sempre respeitar `prefers-reduced-motion`: degradar para `instant` + remover transform/parallax.

## 3. Grid & layout (App Shell)

### 3.1 App Shell padrão

```
┌─────────────────────────────────────────────┐
│ Topbar (h=56)  [search] [notif] [profile]   │
├──────┬──────────────────────────────────────┤
│ Side │ Content (max-w=1280, padding 24)     │
│ bar  │                                      │
│ w240 │  ┌─ Breadcrumb ─────────────┐        │
│ /64  │  ├─ Page header ────────────┤        │
│      │  └─ Sections / cards ──────┘        │
└──────┴──────────────────────────────────────┘
```

- Sidebar: `expanded=240`, `collapsed=64`. Persiste preferência.
- Topbar: sticky, `elevation.1`.
- Content: max 1280, gutters 24/32 conforme breakpoint.
- Mobile (<md): sidebar vira drawer, topbar mantém ações principais.

### 3.2 Densidade

Atributo `data-density="comfortable|compact"`. Compact reduz padding em ~25% e tipografia 1 step.

## 4. Catálogo de componentes

Cada componente declara: **anatomia · props essenciais · estados · A11y**.

### 4.1 Navegação

- **Sidebar**: seções colapsáveis, ícones + label, badge de contagem, item ativo destacado, suporte multi-tenant (switcher no topo).
- **Topbar**: logo, search global (`/` para focar), bell de notificações, avatar com menu.
- **Breadcrumb**: separador `/`, último não-clicável, truncamento por ellipsis.
- **Tabs**: linha + sublinha, scroll horizontal em mobile.
- **Stepper**: numerado, suporta vertical/horizontal, estados pending/current/done/error.

### 4.2 Dados

- **Card**: header (título + ações), body, footer opcional.
- **KPI Card**: valor grande, delta com trend (↑/↓ + cor), sparkline opcional.
- **Table / DataGrid**: header sticky, sort, filtros, paginação (server ou client), ações inline (icon + menu), seleção multi.
- **EmptyState**: ícone, título, descrição, CTA primário.

### 4.3 Forms

- **Button**: variants `primary | secondary | ghost | danger | link`. Sizes `sm | md | lg`. Estado `loading` substitui label por spinner.
- **IconButton**: square 32/40/48, tooltip obrigatório.
- **Input**: label acima, helper text, error text com ícone, prefix/suffix slot.
- **Select / Combobox**: searchable, multi opcional, virtualizado >50 items.
- **Checkbox / Radio / Switch**: label clicável.
- **DatePicker / DateRange**: input + popover, navegação por teclado.

### 4.4 Feedback

- **Modal**: trap focus, ESC fecha, sobreposição clicável configurável.
- **Drawer**: side `right` (default) ou `left`, mesmo trap focus.
- **Toast**: timeout default 5s, ações inline, fila max 3 visíveis.
- **Tooltip**: delay 300ms, segue o ponteiro/focus.
- **Popover**: âncora + conteúdo, fecha em click-outside.
- **Banner / Alert**: severity success/info/warning/danger, dismissable opcional.

### 4.5 Loading

Ver seção 5.

### 4.6 Charts (wrappers, não engine)

Wrappers neutros expostos pelo design system: `LineChart`, `BarChart`, `DonutChart`, `Sparkline`, `MetricBlock`. Engine concreta (Recharts/Chart.js/fl_chart/Charts) é decisão do agente da stack — wrapper esconde.

## 5. Motion / Loaders / Page transitions

### 5.1 Loaders

| Tipo | Uso |
|---|---|
| **Skeleton** | Conteúdo cuja shape é conhecida (cards, table rows, listas). Default. |
| **Spinner inline** | Botões, ações localizadas. |
| **Progress bar topo** | Navegação de página, fetch global. |
| **Brand loader** | Splash inicial, telas de autenticação. Identidade visual. |

Regras:
- Skeleton aparece após 100ms (evita flash em respostas rápidas).
- Spinner inline em botões substitui label, mantém largura.
- Reduced motion: skeletons sem shimmer, spinner estático rotacionando passo a passo (sem easing).

### 5.2 Page transitions

- **Fade + 8px Y slide**, `motion.duration.base`, easing `standard`. Aplicado entre rotas.
- Em mobile: slide horizontal full-width.
- Mantém scroll position quando voltando.

### 5.3 Micro-interações

Hover/focus em `motion.duration.fast`. Modal/Drawer enter `base`, exit `fast`. Toast enter `base` com bounce sutil.

## 6. Iconografia

- **Set único por app**. Recomendados (em ordem): Lucide → Phosphor → Tabler. Justificar escolha em ADR ou no `tokens` do app.
- Tamanhos canônicos: `16 · 20 · 24 · 32`. Default 20 em UI, 16 inline com texto.
- Stroke width consistente com o set.
- Cor herda de `currentColor`. Estados via parent.
- **Logo/brand mark** é separado do set utilitário.

## 7. Acessibilidade (mínimo, não meta)

- Contraste AA (4.5:1 texto, 3:1 UI/large).
- Foco visível obrigatório (outline 2px `color.border.strong` + offset 2px). Nunca remover sem substituir.
- Navegação completa por teclado (Tab order lógico, Esc fecha overlays, setas em listas).
- ARIA roles corretos (`dialog`, `menu`, `tab`, `alert`).
- `prefers-reduced-motion`: degradar transições.
- `prefers-color-scheme` respeitado por padrão; preferência manual sobrepõe.
- Targets táteis ≥ 44×44 em mobile.
- Forms: cada input com `<label>` associado; erros vinculados via `aria-describedby`.

## 8. Estrutura de arquivos por stack

A skill define o **shape**, não o conteúdo. Stack-agnóstico.

### React (consumido por `@frontend-react`)
```
src/
├── design-system/
│   ├── tokens/        (cores, type, space, motion — fonte da verdade)
│   ├── primitives/    (Button, Input, Card, ...)
│   ├── patterns/      (AppShell, KPICard, EmptyState, DataGrid)
│   ├── motion/        (PageTransition, Skeleton, Loader)
│   └── icons/         (re-export do set escolhido)
└── features/<feature>/  (compõe primitives + patterns)
```

### Flutter (consumido por `@frontend-flutter`)
```
lib/
├── design_system/
│   ├── tokens/        (ThemeData + extensions)
│   ├── primitives/
│   ├── patterns/
│   ├── motion/
│   └── icons.dart
```

### Compose (consumido por `@frontend-android`)
```
ui/
├── theme/             (Colors.kt, Type.kt, Shapes.kt, Motion.kt)
├── primitives/
├── patterns/
├── motion/
└── icons/
```

### SwiftUI (consumido por `@frontend-ios`)
```
DesignSystem/
├── Tokens/
├── Primitives/
├── Patterns/
├── Motion/
└── Icons/
```

## 9. Checklist de revisão visual (consumido por `@reviewer` e `@quality`)

PR só passa se:

- [ ] Nenhum valor hardcoded — tudo via token.
- [ ] Componente usa primitive existente em vez de reimplementar.
- [ ] Estados default/hover/focus/disabled/loading/error/empty cobertos.
- [ ] Foco visível em qualquer elemento interativo.
- [ ] Contraste AA verificado (ferramenta automatizada no CI).
- [ ] Navegação por teclado completa (sem traps).
- [ ] Light + dark testados.
- [ ] Loader/skeleton implementado para qualquer chamada > 100ms esperada.
- [ ] `prefers-reduced-motion` respeitado.
- [ ] Iconografia do set único, sem ícones rasterizados.
- [ ] Storybook/Widgetbook/Preview com pelo menos 1 story por componente novo.
- [ ] Sem violações axe/eslint-jsx-a11y críticas.

## 10. Anti-padrões

- ❌ Importar CSS/HTML/JS de templates pagos (templates comerciais de terceiros são **inspiração visual**, nunca asset).
- ❌ Adicionar segunda biblioteca de ícones.
- ❌ Cores fora da paleta semântica.
- ❌ Spinner global cobrindo tela quando skeleton resolve.
- ❌ Animar entrada de elementos críticos para A11y (modal/alert) sem fallback reduced-motion.
- ❌ Componente novo sem story/preview.
- ❌ Acoplar a vendor de marca específica (logo da empresa, paleta corporativa hardcoded).
- ❌ Escolher framework de styling aqui — isso é ADR de `@architecture`.

## 11. Handoff para o agente de stack

Quando `@frontend-react` (ou outro) recebe sprint que invoca esta skill:

1. Ler `prd.md` (escopo) e ADR de styling stack.
2. Materializar tokens em código da stack (CSS vars, ThemeData, Compose Theme, SwiftUI Environment).
3. Implementar primitives faltantes antes de qualquer feature.
4. Compor patterns; nunca duplicar primitive.
5. Anexar ao PR: screenshots light+dark, link da story, checklist da §9 marcado.
