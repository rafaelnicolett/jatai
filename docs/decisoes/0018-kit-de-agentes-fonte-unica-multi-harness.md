# ADR-0018: Kit de agentes como fonte única, com adaptadores por harness

## Status

aceita em 2026-11-14, pelo titular do projeto.

## Contexto

O kit de agentes é o que a Jataí instala no projeto de quem a usa, para o Claude
Code e para o GitHub Copilot. No produto anterior ele tinha quatro problemas.

- **Duplicação.** Os mesmos itens lógicos (agentes, skills e instruções) existiam em
  cerca de três cópias, e o script de build lia a raiz de um workspace e um
  repositório irmão, apagando a saída versionada.
- **Empacotamento incompleto.** Algumas versões saíram sem as skills do projeto novo
  e sem os arquivos de instrução, e uma instalação para projeto existente não gerava
  o `CLAUDE.md`.
- **Frontmatter sem garantia.** A maioria dos agentes não tinha `description`, nenhum
  declarava `tools`, algumas skills tinham YAML inválido, e havia referências a
  agentes que não existiam.
- **Paridade entre harnesses.** O comando de entrada só existia no Claude Code, o
  Copilot recebia dois pontos de entrada, o uso de perguntas ao usuário não tinha
  alternativa no Copilot, e o MCP não era configurado em nenhum dos dois.

## Decisão

- `kit/` neutro, dentro do repositório, como **única fonte**:
  - o conteúdo dos agentes e das skills;
  - `kit.manifest.yaml`, que descreve o que cada edição recebe.
  - A saída de build sai do git.
- **Adaptadores por harness** para Claude Code e GitHub Copilot, aplicados na
  instalação (o `HarnessAdapter` cuida da pasta do host, do orquestrador e das
  instruções), com `{{brand.*}}` levando a marca:
  - o ponto de entrada (`@jatai` e `/jatai`) existe nos dois;
  - o MCP é configurado nos dois.
- **JSON Schema** para o frontmatter de agente e de skill, com regras de CI:
  - YAML válido;
  - `name` e `description` obrigatórios;
  - referências (`uses_skills`, `receives_from`, `delivers_to`) resolvidas por edição;
  - lint de texto específico de harness;
  - lista de permissão do conteúdo do `.vsix`.
- **Nomes canônicos:**
  - orquestrador `jatai`, com o nome do produto anterior e `maestro` como apelidos;
  - `phase` igual à chave de estado;
  - um único enum de stack.
- `kit.lock.json` no workspace instalado e migração por checksum, sem mudar caminhos
  nem schemas de artefato.

## Consequências

- (+) Um agente é escrito uma vez e chega igual aos dois harnesses.
- (+) O pacote sempre contém o kit inteiro, e o CI prova isso.
- (+) O [catálogo de agentes](../agentes/README.md) é gerado do frontmatter, e o CI
  reprova a diferença.
- (−) Exige normalizar o kit e escrever o schema antes de abrir para contribuição
  externa.

Veja [criar agentes e skills](../criar-agentes-e-skills.md).
