# Identidade visual da Jataí

Guia curto para usar o nome, o símbolo e as cores da Jataí. Os arquivos ficam em [`media/`](../media/). Origem das decisões: ADR-0013 (nome Jataí e símbolo Guarda) e o design system v2 da Jataí (cores, tipografia e contraste).

![Símbolo Guarda e o nome jataí, lado a lado](../media/brand/jatai-horizontal.svg)

## O símbolo

O símbolo se chama **Guarda**. É a jataí (*Tetragonisca angustula*), abelha nativa sem ferrão, vista de cima: um emblema plano e simétrico sobre um ladrilho cor de mel.

- **As quatro faixas de mel do abdômen** são as quatro etapas do método: Descoberta, Planejamento, Execução e Operação.
- **A ponta redonda** é o "sem ferrão": mudança segura, incremental e reversível.
- **O nome** vem da guarda da colônia, que inspeciona quem entra no ninho. Na Jataí, nenhum agente passa de um gate sem você.

| Arquivo | O que é | Onde usar |
|---|---|---|
| `media/brand/jatai-guarda.svg` | Símbolo colorido, fonte de todos os PNGs | Documentos, site, apresentações |
| `media/brand/jatai-guarda-512.png`, `-256.png` | Símbolo em PNG | Onde SVG não entra (redes sociais, avatar) |
| `media/jatai-icon-color.png` | Símbolo em 128 × 128 | Ícone do Marketplace e da aba do Cockpit |
| `media/jatai-icon.svg` | Glifo de 24 px, uma cor | Activity bar e views do VS Code |
| `media/fonts/jatai-icons.woff` | Glifo de 16 px em fonte (`$(jatai-mark)`) | Status bar do VS Code |
| `media/brand/jatai-wordmark.svg`, `-negativo.svg` | O nome em contorno | Onde o símbolo já aparece por perto |
| `media/brand/jatai-horizontal.svg`, `-negativo.svg` | Símbolo + nome | Cabeçalhos, README, slides |

As versões `-negativo` são para fundo escuro.

**Por que três desenhos do mesmo símbolo.** O colorido tem detalhe para 128 px ou mais. O glifo de 24 px troca a asa translúcida por asa vazada, porque o VS Code pinta o ícone com uma cor só. O glifo de 16 px tem dois cortes no abdômen em vez de três, porque três não cabem nítidos em 16 pixels.

**Ícone do Marketplace.** O `vsce` recusa SVG no campo `icon`, então o ícone é PNG de 128 × 128. O ladrilho Mel é opaco e dá ao símbolo o próprio fundo. Ele funciona sobre a página clara do Marketplace e sobre o editor escuro: a abelha em Própolis tem 7,66:1 contra o Mel. Só os cantos arredondados são transparentes.

## Área de respiro e tamanho mínimo

Deixe livre em volta do símbolo e da versão horizontal **um quarto da altura do símbolo**. No wordmark sozinho, deixe livre **a altura do "a"**. Nenhum texto, borda ou outra marca entra nessa área.

| Peça | Mínimo na tela | Abaixo do mínimo |
|---|---|---|
| Símbolo colorido | 24 px (16 px só como favicon) | Use o glifo |
| Glifo | 16 px | — |
| Versão horizontal | 24 px de altura | Use o símbolo sozinho |
| Wordmark | 16 px de altura | Escreva "Jataí" no texto |

## Paleta

| Cor | Hex | Papel |
|---|---|---|
| Mel | `#F39A1D` | Cor da marca: ladrilho do símbolo, faixas do abdômen, botão primário |
| Cerume | `#F3D9A0` | Decorativa: caminhos, anéis, contornos de apoio |
| Própolis | `#2C1708` | Corpo da abelha, wordmark em fundo claro, texto sobre o Mel |
| Olho | `#5B6B2C` | Só os olhos do símbolo |
| Asa | `#FFF6E2` | Asas, brilho dos olhos, wordmark em fundo escuro |

Contraste calculado pela fórmula da WCAG 2.x, truncado em duas casas (o mesmo método do design system v2). O mínimo é 4,5:1 para texto e 3:1 para forma que identifica algo.

| Par | Razão | Uso |
|---|---|---|
| Própolis sobre Mel | 7,66:1 | Texto e desenho sobre o Mel |
| Própolis sobre Asa | 15,83:1 | Texto sobre fundo Asa |
| Própolis sobre fundo claro `#FAF6EC` | 15,77:1 | Wordmark e versão horizontal |
| Asa sobre fundo escuro `#1C120A` | 17,12:1 | Wordmark e horizontal negativos |
| Mel sobre o editor escuro `#1E1E1E` | 7,50:1 | O ladrilho no VS Code escuro |
| Mel sobre branco | 2,22:1 | Não passa como texto: o Mel nunca é texto |
| Olho sobre Própolis | 2,90:1 | Decorativo, só dentro do símbolo |

Para escrever em tom de mel, use o `mel-ink` do design system v2: `#975300` no claro (5,47:1 sobre `#FAF6EC`) e `#F6B54A` no escuro (10,49:1 sobre `#14100A`).

## Tipografia

As três famílias são SIL OFL 1.1, compatível com a MIT.

| Família | Papel | Pesos |
|---|---|---|
| Gabarito | Títulos e o wordmark | 700 e 900 |
| Hanken Grotesk | Texto | 400, 500, 600 e 700 |
| JetBrains Mono | Dados, ids, eyebrow em caixa alta | 400 e 600 |

- O wordmark é Gabarito 900, em minúsculas ("jataí"), com −0,02 em de espaçamento. Use o SVG. Não digite o nome numa fonte para imitar o wordmark.
- No texto corrido, escreva **Jataí**, com maiúscula e acento. Em ids, comandos e arquivos, `jatai`.
- O menor texto da interface tem 11 px.

## Voz e tom

A Jataí é a abelha: fale dela no feminino. "A Jataí gera os arquivos", "o painel da Jataí". Nomes compostos concordam com o substantivo: "o Jataí Cockpit".

| Traço | É | Não é |
|---|---|---|
| Direta | Frase curta, verbo concreto, "você" | Jargão de vendas, voz passiva, rodeio |
| Calma | Diz o que acontece e para | Urgência, exclamação, "revolucionário" |
| Honesta | Diz o que não faz. Número só com fonte | Promessa de resultado, depoimento inventado |
| Daqui | Português natural, a colmeia com o sentido literal ao lado | Tradução literal do inglês, caricatura |

- Fale com "você", nunca com "o usuário".
- Use abelha, guarda, ilha e pote só no Mapa e no manifesto. Na primeira vez, ponha o termo literal na mesma frase: "a guarda acesa: uma decisão espera você".
- Explique "gate" na primeira vez como "ponto de aprovação humana". Diga "agente", nunca "bot".
- Escreva as etapas como no Mapa: Descoberta, Planejamento, Execução, Operação. Gates: D1, D2, D3.
- Não use emoji nem ponto de exclamação. Caixa alta só no eyebrow mono.
- Na mensagem de erro, diga o que houve e o que fazer, sem culpar a pessoa.

| Evite | Prefira |
|---|---|
| Revolucione seu desenvolvimento com IA! | Agentes de IA com método. Decisões com você. |
| O Jataí gerou os arquivos. | A Jataí gerou os arquivos. |
| Seus dados 100% seguros | A extensão não envia dados. Um teste no CI confere isso a cada mudança. |
| Erro! Campo inválido. | Confira o e-mail: falta algo como nome@empresa.com.br. |

## Usos certos e errados

Faça:

- Use os arquivos de `media/` como estão.
- Ponha o símbolo colorido sobre qualquer fundo calmo, claro ou escuro. O ladrilho garante o contraste da abelha.
- Use a horizontal em Própolis no fundo claro e a negativa no fundo escuro.
- Use o glifo numa cor só, a do contexto.

Não faça:

- Não recolora o símbolo, não troque cores da paleta e não aplique degradê, sombra, brilho ou contorno.
- Não estique, não gire e não corte o ladrilho.
- Não tire a abelha colorida do ladrilho. Sem o ladrilho, use o glifo.
- Não mude a proporção nem a posição entre símbolo e nome na versão horizontal.
- Não escreva o nome em caixa alta ("JATAÍ") nem sem acento ("Jatai") fora de ids.
- Não use o Mel como cor de texto.
- Não dê duas cores nem transparência ao glifo.
- Não use nenhuma peça abaixo do tamanho mínimo.

## A marca em forks

O código da Jataí é MIT (veja [`LICENSE`](../LICENSE)). **A licença cobre o código, não a marca.** O nome Jataí, o símbolo Guarda, o wordmark e os glifos não vêm junto com a MIT.

- Use o código, mude e redistribua como a MIT permite.
- Se você publicar uma versão modificada (Marketplace, Open VSX ou outro canal), troque o nome e os ícones. Diga que o projeto é "baseado na Jataí" ou "um fork da Jataí", sem se apresentar como a Jataí oficial.
- A troca é curta: ajuste `src/data/brand.json` (nome, ids e `assets`), troque os SVGs de `media/` e rode `node scripts/brand-assets.mjs`. O `scripts/brand-lint.mjs` acusa qualquer nome que tenha ficado para trás no código.

> **Pendente:** o texto final da política de uso da marca é decisão do titular, junto com o registro da marca. Até ele sair, vale esta nota.

## Como regenerar os arquivos

Os SVGs de `media/` são a fonte. Os PNGs e a fonte de ícones saem deles por script; nenhum é feito à mão.

```sh
node scripts/brand-assets.mjs          # gera os PNGs e o .woff
node scripts/brand-assets.mjs --check  # confere se estão em dia com os SVGs
```

O script precisa do `rsvg-convert` (librsvg) e do Python 3 com fontTools (`pip install fonttools`). Nenhum dos dois roda no build nem no CI.
