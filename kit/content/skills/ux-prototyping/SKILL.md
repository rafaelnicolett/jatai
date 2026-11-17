---
id: ux-prototyping
name: ux-prototyping
type: skill
description: Metodologia para criar protótipos HTML navegáveis e wireframes ASCII a partir de fluxos de usuário — sem framework JS. Produz artefatos validáveis por stakeholder antes do downstream. Consumida por @ux-designer.
applicable_to:
  - Fase UX Design (upstream) em qualquer stack de frontend
  - Validação de fluxo com stakeholder antes de codificar
  - Geração de user-flows.md, wireframes e prototype/
inputs:
  - .github/artifacts/prd.md
  - .github/artifacts/feature-list.md
outputs:
  - docs/design/user-flows.md
  - docs/design/wireframes/*.md
  - docs/design/prototype/index.html
  - docs/design/prototype/*.html
  - docs/design/design-tokens.yaml
---

# Skill: ux-prototyping

> Gerar **protótipos navegáveis** e **wireframes** a partir do PRD — rápidos
> o suficiente para validação, ricos o suficiente para informar domínio e BDD.

---

## 0. Princípios invioláveis

1. **Validação antes de código.** Protótipo serve para descobrir erros de UX
   de graça — antes que virem bugs caros no downstream.
2. **HTML puro.** Sem React/Vue/frameworks no protótipo. O stakeholder valida
   no browser, sem dependência de build tool.
3. **Fidelidade média intencional.** Suficiente para comunicar fluxo e hierarquia.
   Não é Dribbble, não é rascunho ilegível.
4. **Tokens desde o começo.** Cores e tamanhos como variáveis CSS — não hardcoded.
5. **Mobile-first.** Layout responde em 320px e 1024px ao menos.
6. **Acessibilidade mínima.** `alt` em imagens, `aria-label` em botões ícone,
   contraste AA por padrão.

---

## 1. Estrutura de artefatos

```
docs/design/
├── user-flows.md               # mapa completo de jornadas + aprovação
├── design-tokens.yaml          # fonte da verdade de tokens
├── wireframes/
│   ├── 00-overview.md          # mapa visual de todas as telas
│   ├── <feature>-<tela>.md     # wireframe por tela (ASCII + anotações)
│   └── ...
└── prototype/
    ├── index.html              # entry point / tela inicial
    ├── styles.css              # variáveis CSS dos tokens + reset + utilitários
    └── <tela>.html             # uma página por tela principal do happy path
```

---

## 2. Template de user-flows.md

```markdown
# User Flows — <Projeto>

> Produzido por: @ux-designer | Data: YYYY-MM-DD

## Personas ativas

| Persona | Objetivo primário | Entry point |
|---|---|---|
| <Nome> | <objetivo> | <URL/tela> |

---

## Jornada: <Persona> — <objetivo>

### Happy Path

| # | Tela | Ação do usuário | Sistema responde | Próxima tela |
|---|---|---|---|---|
| 1 | <tela-id> | <ação> | <resposta> | <próxima> |

### Alternative Paths

| Condição | Tela | Desvio |
|---|---|---|
| <condição> | <tela> | <o que muda> |

### Error States

| Tela | Erro | Mensagem exibida | Recuperação |
|---|---|---|---|
| <tela> | <tipo-erro> | "<texto>" | <próximo passo> |

---

## Aprovação

| Data | Stakeholder | Status | Observações |
|---|---|---|---|
| YYYY-MM-DD | — | ⏳ Pendente | — |
```

---

## 3. Template de wireframe (ASCII)

Cada tela em `docs/design/wireframes/<feature>-<tela>.md`:

```markdown
# Wireframe: <Nome da Tela>

**Rota:** `/path`
**Persona:** <persona>
**Objetivo:** <o que o usuário faz aqui>

## Layout

\`\`\`
┌──────────────────────────────────────────────────┐
│  HEADER: Logo          Nav Links         [Avatar] │
├──────────────────────────────────────────────────┤
│                                                  │
│  Breadcrumb > Subpágina                          │
│                                                  │
│  H1: Título Principal                            │
│  Subtítulo descritivo em até 2 linhas            │
│                                                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐       │
│  │ Card 1   │  │ Card 2   │  │ Card 3   │       │
│  │ [ícone]  │  │ [ícone]  │  │ [ícone]  │       │
│  │ label    │  │ label    │  │ label    │       │
│  │ 42       │  │ 17       │  │ 8        │       │
│  └──────────┘  └──────────┘  └──────────┘       │
│                                                  │
│  ┌────────────────────────────────────────┐     │
│  │ Lista de itens                          │     │
│  │ • Item A                [Ação]          │     │
│  │ • Item B                [Ação]          │     │
│  │ • Item C                [Ação]          │     │
│  └────────────────────────────────────────┘     │
│                                                  │
│                       [CTA Principal ▶]         │
│                                                  │
├──────────────────────────────────────────────────┤
│  FOOTER: versão · links                          │
└──────────────────────────────────────────────────┘
\`\`\`

## Anotações

- **Header**: sticky, colapsa em mobile para hamburger
- **Cards**: clicáveis → navegam para detalhe
- **CTA Principal**: desabilitado até ao menos 1 card selecionado
- **Estado vazio**: se lista vazia → mostrar empty-state com instrução

## Estados da tela

| Estado | Gatilho | Diferença visual |
|---|---|---|
| Default | — | lista preenchida |
| Empty | sem itens | empty-state centered |
| Loading | carregando dados | skeleton nos cards |
| Error | falha de rede | toast de erro + retry |

## Links de navegação

| Elemento | Destino | Condição |
|---|---|---|
| Card | `<tela-detalhe>.html` | sempre |
| CTA | `<próxima-tela>.html` | card selecionado |
| Nav > Home | `index.html` | sempre |
```

---

## 4. Template de página HTML do protótipo

Estrutura base para cada `docs/design/prototype/<tela>.html`:

```html
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>[Nome da Tela] — Protótipo</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>

  <!-- NAVIGATION -->
  <nav class="nav">
    <a href="index.html" class="nav-brand">🔷 Produto</a>
    <ul class="nav-links">
      <li><a href="dashboard.html">Dashboard</a></li>
      <li><a href="settings.html">Config</a></li>
    </ul>
    <div class="nav-avatar">RF</div>
  </nav>

  <!-- MAIN CONTENT -->
  <main class="main">
    <div class="container">

      <!-- PAGE HEADER -->
      <div class="page-header">
        <h1 class="page-title">Título da Tela</h1>
        <p class="page-desc">Descrição breve do objetivo desta tela.</p>
      </div>

      <!-- CONTENT AREA -->
      <!-- ... conteúdo específico da tela ... -->

      <!-- PRIMARY CTA -->
      <div class="cta-row">
        <a href="proxima-tela.html" class="btn btn-primary">Próximo passo ▶</a>
      </div>

    </div>
  </main>

  <!-- PROTOTYPE BADGE (remover antes de entregar para stakeholder) -->
  <div class="proto-badge">Protótipo — não funcional</div>

</body>
</html>
```

---

## 5. Template de styles.css

```css
/* ── TOKENS (de design-tokens.yaml) ── */
:root {
  /* Color */
  --color-brand:       #0078d4;
  --color-bg-canvas:   #ffffff;
  --color-bg-surface:  #f5f5f5;
  --color-bg-muted:    #e8e8e8;
  --color-fg:          #1b1b1b;
  --color-fg-muted:    #6e6e6e;
  --color-fg-subtle:   #a0a0a0;
  --color-success:     #107c10;
  --color-warning:     #c57b00;
  --color-error:       #d13438;
  --color-border:      rgba(0,0,0,.12);

  /* Typography */
  --font-body:  system-ui, -apple-system, sans-serif;
  --font-mono:  ui-monospace, "Cascadia Code", monospace;
  --text-xs: 11px;  --text-sm: 13px;  --text-md: 15px;
  --text-lg: 18px;  --text-xl: 24px;  --text-2xl: 32px;

  /* Spacing (4pt grid) */
  --sp-1: 4px; --sp-2: 8px; --sp-3: 12px; --sp-4: 16px;
  --sp-6: 24px; --sp-8: 32px; --sp-12: 48px;

  /* Radius */
  --radius-sm: 4px;  --radius-md: 8px;  --radius-lg: 12px;
  --radius-full: 9999px;
}

/* ── RESET ── */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: var(--font-body); background: var(--color-bg-canvas);
       color: var(--color-fg); font-size: var(--text-md); line-height: 1.6; }
a { color: var(--color-brand); text-decoration: none; }
a:hover { text-decoration: underline; }

/* ── LAYOUT ── */
.container { max-width: 1200px; margin: 0 auto; padding: 0 var(--sp-6); }
.nav { display: flex; align-items: center; gap: var(--sp-4); padding: var(--sp-3) var(--sp-6);
       background: var(--color-bg-surface); border-bottom: 1px solid var(--color-border); }
.nav-brand { font-weight: 700; color: var(--color-fg); }
.nav-links { display: flex; gap: var(--sp-4); list-style: none; flex: 1; }
.nav-avatar { width: 32px; height: 32px; border-radius: var(--radius-full);
              background: var(--color-brand); color: #fff;
              display: flex; align-items: center; justify-content: center;
              font-size: var(--text-xs); font-weight: 700; }
.main { padding: var(--sp-8) 0; }
.page-header { margin-bottom: var(--sp-8); }
.page-title { font-size: var(--text-2xl); font-weight: 800; letter-spacing: -.02em; }
.page-desc { color: var(--color-fg-muted); margin-top: var(--sp-2); }

/* ── COMPONENTS ── */
.btn { display: inline-flex; align-items: center; gap: var(--sp-2);
       padding: var(--sp-3) var(--sp-6); border-radius: var(--radius-md);
       font-size: var(--text-sm); font-weight: 700; cursor: pointer;
       border: none; transition: opacity .12s; }
.btn-primary { background: var(--color-brand); color: #fff; }
.btn-primary:hover { opacity: .88; text-decoration: none; }
.btn-secondary { background: transparent; border: 1px solid var(--color-border);
                 color: var(--color-fg); }
.card { background: var(--color-bg-surface); border: 1px solid var(--color-border);
        border-radius: var(--radius-lg); padding: var(--sp-6); }
.card:hover { border-color: var(--color-brand); }
.card-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px,1fr));
             gap: var(--sp-4); }
.empty-state { text-align: center; padding: var(--sp-12) var(--sp-6);
               color: var(--color-fg-muted); }
.empty-state h2 { font-size: var(--text-xl); margin-bottom: var(--sp-3); }
.cta-row { margin-top: var(--sp-8); display: flex; gap: var(--sp-3); }
.badge { display: inline-flex; padding: 2px 8px; border-radius: var(--radius-full);
         font-size: var(--text-xs); font-weight: 600; }
.badge-success { background: color-mix(in srgb, var(--color-success) 12%, transparent);
                 color: var(--color-success); }

/* ── PROTOTYPE BADGE ── */
.proto-badge { position: fixed; bottom: var(--sp-4); right: var(--sp-4);
               background: var(--color-warning); color: #fff;
               padding: var(--sp-2) var(--sp-3); border-radius: var(--radius-md);
               font-size: var(--text-xs); font-weight: 700; opacity: .85; }
```

---

## 6. Checklist de entrega

Antes de entregar ao `@domain-modeler` e `@bdd`, verificar:

- [ ] `user-flows.md` cobre 100% das features P0/P1 do `feature-list.md`
- [ ] Cada fluxo tem happy path + pelo menos 1 estado de erro
- [ ] Wireframe para cada tela do happy path (ASCII mínimo)
- [ ] `prototype/index.html` abre no browser sem erros no console
- [ ] Todos os links do protótipo funcionam (sem 404 entre telas)
- [ ] `design-tokens.yaml` está completo (cor, tipo, espaçamento, radius, grid)
- [ ] CSS usa variáveis dos tokens — zero valor hardcoded em componente
- [ ] Contraste de texto: mínimo 4.5:1 (AA) verificado
- [ ] Layout responde em 375px (mobile) e 1280px (desktop)
- [ ] Aprovação do stakeholder registrada em `user-flows.md`
- [ ] Handoff doc com insights para `@domain-modeler` e `@bdd` redigido

---

## 7. O que NÃO fazer

- ❌ Usar React, Vue, Angular, Svelte ou qualquer framework JS no protótipo
- ❌ Conectar a API real ou mockar dados com fetch/axios
- ❌ Implementar lógica de negócio no protótipo (if/else de regras)
- ❌ Escolher biblioteca de componentes (Tailwind, shadcn, MUI) — isso é ADR
- ❌ Criar tokens duplicando o que está em `ui-ux-design-system` se a skill
  já foi invocada — reaproveitar
- ❌ Prosseguir sem aprovação do stakeholder quando ela for requerida
