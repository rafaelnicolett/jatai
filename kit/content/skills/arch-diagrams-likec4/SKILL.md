---
id: arch-diagrams-likec4
name: arch-diagrams-likec4
type: skill
description: Gera arquivos DSL LikeC4 (workspace.c4 + views.c4) derivados dos artefatos C4 do @arch-discoverer. Arquitetura viva, navegável e versionada.
applicable_to:
  - "@arch-discoverer"
---

# Skill: arch-diagrams-likec4

> Transcreve os artefatos `c4-context.md`, `c4-container.md` e `c4-component.md`
> para a DSL do [LikeC4](https://likec4.dev/), produzindo um modelo vivo que
> roda com `npx likec4 serve` ou Docker.
>
> Regra fundamental: **descreva o que existe** — não projete o que deveria existir.
> Todos os elementos e relações devem ter origem rastreável em um artefato C4.

---

## 1. Estrutura de arquivos

```
.github/artifacts/assessment/architecture/likec4/
  workspace.c4     ← specification + model (elements + relationships)
  views.c4         ← views declarativas L1 / L2 / L3
  docker-compose.yml   ← setup (gerado pelo @assessor no Passo 0)
  README.md            ← instruções de execução (gerado pelo @assessor no Passo 0)
```

Nunca misture `model` e `views` no mesmo arquivo — mantém legibilidade e
facilita diffs no git.

---

## 2. Template `workspace.c4`

```
specification {
  element person
  element softwareSystem
  element container {
    style {
      shape rectangle
    }
  }
  element externalSystem {
    style {
      color secondary
    }
  }
  element component

  relationship uses
  relationship calls
  relationship readsFrom
  relationship writesTo
  relationship publishesTo
  relationship consumesFrom
}

model {

  // ── Atores (de c4-context.md → seção "Atores externos") ──────────────────
  <actorId> = person '<Nome do Ator>' {
    description '<O que este ator faz com o sistema>'
  }
  // repita para cada ator detectado

  // ── Sistemas externos que nos chamam (de c4-context.md) ──────────────────
  <extCallerId> = externalSystem '<Nome>' {
    description '<Tipo de integração>'
  }

  // ── Sistema principal ─────────────────────────────────────────────────────
  <systemId> = softwareSystem '<Nome do Sistema>' {
    description '<O que o sistema faz em 1-2 frases>'

    // ── Containers (de c4-container.md) ──────────────────────────────────
    <containerId> = container '<Nome do Container>' {
      technology '<linguagem + framework>'
      description '<Responsabilidade principal>'

      // ── Components do container principal (de c4-component.md) ─────────
      // Inclua APENAS no container com maior complexidade detectado
      <componentId> = component '<Nome do Componente>' {
        technology '<tech>'
        description '<Responsabilidade>'
      }
      // repita para cada componente de c4-component.md
    }

    <dbId> = container '<Nome do Banco>' {
      technology '<PostgreSQL | MySQL | MongoDB | Redis | ...>'
      description 'Persistência de <domínio>'
      style {
        shape storage
      }
    }

    // adicione workers, filas, caches conforme c4-container.md
    <workerId> = container '<Nome do Worker>' {
      technology '<Celery | BullMQ | Spring Batch | ...>'
      description '<O que processa>'
      style {
        shape queue
      }
    }
  }

  // ── Sistemas externos de saída (de c4-context.md → "dependências de saída") ──
  <extDepId> = externalSystem '<Nome>' {
    description '<Tipo: Payment / Email / SMS / ERP / ...>'
  }

  // ── Relações (de c4-context.md + c4-container.md) ────────────────────────
  <actorId>         -> <systemId>.<containerId>  'usa'           'HTTPS'
  <systemId>.<containerId> -> <systemId>.<dbId>  'lê/escreve'   'SQL'
  <systemId>.<containerId> -> <extDepId>         'integra'       'HTTP REST'
  <extCallerId>     -> <systemId>.<containerId>  'chama'         'Webhook'

  // Relações entre componentes (de c4-component.md → coupling matrix)
  <systemId>.<containerId>.<componentId> -> <systemId>.<containerId>.<componentId2> 'chama'
}
```

### Regras de nomeação de IDs

| Elemento | Padrão de ID | Exemplo |
|---|---|---|
| Ator humano | `camelCase` substantivo | `adminUser`, `endCustomer` |
| Sistema principal | nome do repo/projeto | `{{brand.name}}`, `orderService` |
| Container | tipo + tech abreviada | `apiPython`, `dbPostgres`, `workerCelery` |
| Componente | responsabilidade curta | `orderController`, `paymentPort` |
| Sistema externo | nome do serviço | `stripe`, `sendgrid`, `awsS3` |

IDs devem ser únicos no modelo inteiro. Evite `system1`, `container2` — use
nomes descritivos derivados do código real.

---

## 3. Template `views.c4`

```
views {

  // ── L1 — System Context ──────────────────────────────────────────────────
  view index of <systemId> {
    title 'System Context — <Nome do Sistema>'
    include
      <systemId>,
      <actorId>,
      <extDepId>,
      <extCallerId>
    style <actorId> {
      color green
    }
    style <extDepId>, <extCallerId> {
      color secondary
    }
  }

  // ── L2 — Containers ──────────────────────────────────────────────────────
  view containers of <systemId> {
    title 'Containers — <Nome do Sistema>'
    include
      <systemId>.*,
      <actorId> -> <systemId>,
      <systemId> -> <extDepId>
  }

  // ── L3 — Components do container principal ───────────────────────────────
  view components of <systemId>.<containerId> {
    title 'Components — <Nome do Container>'
    include <systemId>.<containerId>.*
  }

  // ── View adicional por contexto de risco (opcional) ──────────────────────
  // Use para expor hotspots identificados em arch-discovery.md
  // view hotspots of <systemId> {
  //   title 'Hotspots de Risco — <Nome do Sistema>'
  //   include <componentes com risco detectado>
  // }
}
```

### Quando adicionar views extras

Além das três views base (L1/L2/L3), crie views adicionais se:
- Há **múltiplos containers complexos** → uma `view components` por container
- Há **anti-padrão de god module** detectado → `view hotspots` expondo o módulo
- Há **múltiplos bounded contexts** identificados em `domain-map.md` → uma view por contexto

---

## 4. Como rodar o modelo

### npx (sem instalação, recomendado)
```bash
npx likec4 serve .github/artifacts/assessment/architecture/likec4
```
Abre em http://localhost:5173. Atualiza em tempo real ao editar os `.c4`.

### Docker
```bash
docker compose -f .github/artifacts/assessment/architecture/likec4/docker-compose.yml up
```

### Exportar PNG/SVG via CLI
```bash
npx likec4 export png -o ./docs/architecture/ .github/artifacts/assessment/architecture/likec4
```

---

## 5. Anti-padrões

- ❌ Adicionar elementos que não existem no código (ex.: "vamos adicionar uma fila futuramente")
- ❌ Usar IDs genéricos (`system1`, `container2`) — dificulta navegação e diffs
- ❌ Misturar `model` e `views` no mesmo arquivo
- ❌ Criar relações sem correspondência em c4-context.md ou c4-container.md
- ❌ Omitir sistemas externos detectados em imports/env vars (mesmo os implícitos)
- ❌ Um único arquivo `.c4` com tudo — separe `workspace.c4` e `views.c4`
