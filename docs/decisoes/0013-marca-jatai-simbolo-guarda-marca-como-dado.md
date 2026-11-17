# ADR-0013: Marca Jataí, símbolo Guarda e marca como dado

## Status

aceita em 2026-11-14, pelo titular do projeto.

## Contexto

- A edição aberta precisa de identidade brasileira própria. O nome escolhido foi
  **Jataí** (*Tetragonisca angustula*, abelha nativa sem ferrão), e entre quatro
  desenhos de símbolo a escolha foi a **Guarda**.
- A marca estava acoplada ao comportamento do produto anterior:
  - o cálculo da versão do kit só funcionava se o pacote tivesse o nome antigo;
  - o webview só executava comandos com o prefixo antigo.
- O nome antigo aparecia em centenas de arquivos, mas a superfície de **protocolo**
  é pequena: os ids de comando, as chaves de configuração, o participante de chat,
  os arquivos gravados nos workspaces e as variáveis de ambiente.
- `jatai` estava livre no npm, e nenhuma ferramenta de software conhecida usa o nome.

## Decisão

- **Nome:** Jataí. Em ids e comandos, ASCII: `jatai`.
- **Símbolo:** Guarda, um emblema plano da abelha vista de cima. As quatro faixas
  douradas do abdômen são as quatro etapas do método, e a ponta redonda é o "sem
  ferrão". A [identidade visual](../identidade-visual.md) tem a paleta, a tipografia
  e o guia de uso.
- A marca vira dado: `brand.json` guarda nome, prefixo de comando, chaves de
  configuração, participante de chat, nomes de arquivo, prefixo de variável de
  ambiente e URLs.
  - O código e o kit consomem esse arquivo (`{{brand.*}}`).
  - Um lint proíbe literal de marca fora dele.
- O rename segue **Expand-Contract**:
  1. trocar os literais por leitura do `brand.json`, mantendo a marca atual (o
     golden master fica idêntico);
  2. trocar para `jatai` (o golden, depois de normalizar a marca, fica idêntico);
  3. ler o legado (`helyx.config.yaml`, `.helyx/`, `@helyx`, variáveis `HELYX_*`) e
     migrar o workspace, no modelo de uma migração de nome de config que o código
     já fazia.
- **Não muda:** `.github/artifacts/**`, os schemas YAML, os protocolos de agente e
  os contratos de CLI e MCP. Só os nomes dos executáveis e dos arquivos de
  configuração.

## Consequências

- (+) A troca de marca vira um diff único e verificável.
- (+) Workspaces do produto anterior abrem na Jataí sem perder estado.
- (−) O id da extensão muda. É uma instalação nova, e as settings e o `globalState`
  antigos não migram sozinhos.
- (−) A leitura do legado precisa ser mantida por pelo menos um ciclo de versão.
- (−) O registro da marca e a disponibilidade do nome no Marketplace e no Open VSX
  precisam ser confirmados antes do lançamento.

Veja [Expand-Contract](../metodologia/praticas/expand-contract.md).
