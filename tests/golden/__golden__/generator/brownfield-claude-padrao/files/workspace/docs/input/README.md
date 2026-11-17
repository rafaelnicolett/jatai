# Documentos do projeto — insumo do Discovery

Coloque aqui o material que **o código não conta**. O `@business-archeologist`
e o `@domain-extractor` leem esta pasta durante o Discovery.

Formatos: `.md` · `.pdf` · `.docx` · `.xlsx` · `.pptx` · `.txt` · imagens

## O que vale muito a pena colocar

| Material | O que destrava |
|---|---|
| Contrato, SLA, regulamentação | regras de negócio que viraram `if` sem comentário |
| Runbook, procedimento operacional | o que acontece quando quebra — e por quê |
| Planilha de processo, fluxo | o domínio como o negócio o enxerga |
| Deck de produto, roadmap | para onde isso ia antes de virar legado |
| Ata de decisão, RFC antiga | por que a arquitetura é o que é |

## O que NÃO colocar

- **Segredo, credencial, chave** — nada aqui é tratado como secreto.
- **Dado pessoal real** — use amostra anonimizada.

> Esta pasta é versionada junto com o workspace. O código do cliente fica
> em `repos/` e nunca é modificado.
