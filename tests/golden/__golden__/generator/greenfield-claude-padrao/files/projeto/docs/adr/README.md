# Decisões de arquitetura (ADRs)

Cada decisão arquitetural do projeto vira um ADR (Architecture Decision
Record): um arquivo `NNNN-titulo-em-kebab-case.md` nesta pasta, uma decisão por
arquivo. O `@architecture` registra aqui as decisões da fase de arquitetura
(stack, padrão arquitetural, persistência, observabilidade), e o time registra
as suas.

## Formato

```markdown
# ADR-NNNN — Título em poucas palavras

**Status:** proposed | accepted | deprecated | superseded-by ADR-NNNN

## Contexto
O que motivou a decisão e que problema ela resolve.

## Decisão
O que foi decidido, numa frase clara no presente.

## Consequências
O que melhora, o que piora e o que muda daqui para a frente.
```

- Numere em sequência, com quatro dígitos, e nunca reaproveite um número.
- Um ADR aceito não se reescreve. Se a decisão mudar, registre um novo ADR e
  marque o antigo como `superseded-by`.

## Índice

| ID | Título | Status |
|---|---|---|
| [0001](0001-arquitetura-referencia-clean-hexagonal.md) | Arquitetura de referência por stack | accepted |
