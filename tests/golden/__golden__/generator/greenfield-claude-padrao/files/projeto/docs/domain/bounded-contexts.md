# Bounded Contexts — orbita

> Artefato produzido por: `@domain-modeler` — Rodada 1  
> Skill: `domain-driven-design`  
> ⚠️ UL bruta — refinamento após Rodada 2 (BDD)

---

## Mapa de BCs

```
┌─────────────────────────────────────────────────────────────────────┐
│                     orbita                            │
│                                                                     │
│  ┌──────────────────┐                                              │
│  │   CoreDomain     │                                              │
│  │   (CORE)         │                                              │
│  └──────────────────┘                                              │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## BC-01 — CoreDomain

**Tipo**: Core  
**Propósito**: Domínio principal da aplicação

**Conceitos centrais**: *A definir durante modelagem detalhada*

**Responsável por**:
- Regras de negócio centrais
- Invariantes do domínio
- Eventos de domínio

**Eventos publicados**: *A definir*

**Eventos consumidos**: *A definir*

---

*Este arquivo será refinado pelo `@domain-modeler` após rodadas de Event Storming e BDD.*
