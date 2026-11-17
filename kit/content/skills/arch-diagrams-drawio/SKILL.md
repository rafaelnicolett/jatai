---
id: arch-diagrams-drawio
name: arch-diagrams-drawio
type: skill
description: Padrões canônicos para gerar diagramas de arquitetura no formato Draw.io XML (.drawio) — C4 (níveis 1-3) e diagramas de sequência UML. Consumida por @architecture e @arch-discoverer.
applicable_to:
  - "@architecture"
  - "@arch-discoverer"
  - "@arch-cross"
---

# Skill: arch-diagrams-drawio

Todos os diagramas de arquitetura são produzidos em **Draw.io XML** (`.drawio`).
Esses arquivos abrem nativamente no Draw.io / diagrams.net, na extensão VS Code
"Draw.io Integration" e em qualquer ferramenta compatível com mxGraph.

---

## 1. Regras gerais

- **Extensão**: sempre `.drawio` (não `.xml`, não `.drawio.xml`).
- **Encoding**: UTF-8, sem BOM. Entidades XML escapadas nas `value` (`<b>`, `<br>`, `<i>`).
- **`html=1` é OBRIGATÓRIO** em toda célula cujo `value` contém marcação HTML
  (`<b>`, `<br>`, `<font>`). Sem `html=1` no `style`, o drawio mostra as tags
  como **texto literal** (`<font style="font-size:11px">` aparece cru na tela),
  em vez de renderizar. Todo estilo de nó e toda aresta com label formatado
  neste guia já inclui `html=1;` — **nunca remova**. Se criar uma célula nova
  com HTML no value, adicione `html=1;` ao style.
- **IDs de célula**: strings únicas dentro do arquivo (`p1`, `s1`, `c1`, `r1`...). Nunca reutilize IDs.
- **Layout**: posicione manualmente. Use grid de 40px. Margens externas: 40px.
- **Tamanhos canônicos por tipo**:
  - Person: 130 × 140
  - System / External System: 240 × 120
  - Container: 240 × 120
  - Component: 220 × 100
  - Database: 120 × 80
  - Boundary (swimlane): largura = filhos + 80, altura = filhos + 60
- **Cores canônicas C4**:

| Tipo | `fillColor` | `strokeColor` |
|---|---|---|
| Person | `#dae8fc` | `#6c8ebf` |
| Internal System / Container / Component | `#dae8fc` | `#6c8ebf` |
| External System / External Container | `#f5f5f5` | `#666666` |
| Database | `#fff2cc` | `#d6b656` |
| Message Broker / Queue | `#e1d5e7` | `#9673a6` |
| Boundary / Swimlane | `transparent` | `#666666` |

---

## 2. Estrutura raiz obrigatória

Todo arquivo `.drawio` começa assim:

```xml
<mxfile host="{{brand.displayName}}" version="1">
  <diagram id="diag-{slug}" name="{Título do diagrama}">
    <mxGraphModel dx="1422" dy="762" grid="1" gridSize="10" guides="1"
      tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1"
      pageWidth="1169" pageHeight="827" math="0" shadow="0">
      <root>
        <mxCell id="0"/>
        <mxCell id="1" parent="0"/>
        <!-- shapes aqui -->
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>
```

---

## 3. Shapes canônicos por tipo C4

### 3.1 Person

```xml
<mxCell id="{id}" parent="1" vertex="1"
  value="&lt;font style=&quot;font-size:11px&quot;&gt;&lt;b&gt;{Nome}&lt;/b&gt;&lt;/font&gt;&lt;br&gt;&lt;font style=&quot;font-size:9px;font-style:italic&quot;&gt;[Person]&lt;/font&gt;&lt;br&gt;&lt;font style=&quot;font-size:11px&quot;&gt;{Descrição}&lt;/font&gt;"
  style="shape=mxgraph.c4.person2;html=1;whiteSpace=wrap;fillColor=#dae8fc;strokeColor=#6c8ebf;fontColor=#000000;align=center;">
  <mxGeometry x="{x}" y="{y}" width="130" height="140" as="geometry"/>
</mxCell>
```

### 3.2 Software System (interno)

```xml
<mxCell id="{id}" parent="1" vertex="1"
  value="&lt;b&gt;{Nome}&lt;/b&gt;&lt;br&gt;&lt;font style=&quot;font-size:9px;font-style:italic&quot;&gt;[Software System]&lt;/font&gt;&lt;br&gt;{Descrição}"
  style="shape=mxgraph.c4.system2;html=1;whiteSpace=wrap;fillColor=#dae8fc;strokeColor=#6c8ebf;fontColor=#000000;align=center;">
  <mxGeometry x="{x}" y="{y}" width="240" height="120" as="geometry"/>
</mxCell>
```

### 3.3 External System

```xml
<mxCell id="{id}" parent="1" vertex="1"
  value="&lt;b&gt;{Nome}&lt;/b&gt;&lt;br&gt;&lt;font style=&quot;font-size:9px;font-style:italic&quot;&gt;[External System]&lt;/font&gt;&lt;br&gt;{Descrição}"
  style="shape=mxgraph.c4.system_ext2;html=1;whiteSpace=wrap;fillColor=#f5f5f5;strokeColor=#666666;fontColor=#000000;align=center;">
  <mxGeometry x="{x}" y="{y}" width="240" height="120" as="geometry"/>
</mxCell>
```

### 3.4 Container

```xml
<mxCell id="{id}" parent="1" vertex="1"
  value="&lt;b&gt;{Nome}&lt;/b&gt;&lt;br&gt;&lt;font style=&quot;font-size:9px;font-style:italic&quot;&gt;[Container: {Tecnologia}]&lt;/font&gt;&lt;br&gt;{Descrição}"
  style="shape=mxgraph.c4.container2;html=1;whiteSpace=wrap;fillColor=#dae8fc;strokeColor=#6c8ebf;fontColor=#000000;align=center;">
  <mxGeometry x="{x}" y="{y}" width="240" height="120" as="geometry"/>
</mxCell>
```

### 3.5 External Container

```xml
<mxCell id="{id}" parent="1" vertex="1"
  value="&lt;b&gt;{Nome}&lt;/b&gt;&lt;br&gt;&lt;font style=&quot;font-size:9px;font-style:italic&quot;&gt;[External Container: {Tecnologia}]&lt;/font&gt;&lt;br&gt;{Descrição}"
  style="shape=mxgraph.c4.container_ext2;html=1;whiteSpace=wrap;fillColor=#f5f5f5;strokeColor=#666666;fontColor=#000000;align=center;">
  <mxGeometry x="{x}" y="{y}" width="240" height="120" as="geometry"/>
</mxCell>
```

### 3.6 Database

```xml
<mxCell id="{id}" parent="1" vertex="1"
  value="&lt;b&gt;{Nome}&lt;/b&gt;&lt;br&gt;&lt;font style=&quot;font-size:9px;font-style:italic&quot;&gt;[Database: {Tecnologia}]&lt;/font&gt;&lt;br&gt;{Descrição}"
  style="shape=mxgraph.c4.systemDb2;html=1;whiteSpace=wrap;fillColor=#fff2cc;strokeColor=#d6b656;fontColor=#000000;align=center;">
  <mxGeometry x="{x}" y="{y}" width="120" height="80" as="geometry"/>
</mxCell>
```

### 3.7 Message Broker / Queue

```xml
<mxCell id="{id}" parent="1" vertex="1"
  value="&lt;b&gt;{Nome}&lt;/b&gt;&lt;br&gt;&lt;font style=&quot;font-size:9px;font-style:italic&quot;&gt;[Message Broker: {Tecnologia}]&lt;/font&gt;&lt;br&gt;{Descrição}"
  style="shape=mxgraph.c4.container2;html=1;whiteSpace=wrap;fillColor=#e1d5e7;strokeColor=#9673a6;fontColor=#000000;align=center;">
  <mxGeometry x="{x}" y="{y}" width="240" height="100" as="geometry"/>
</mxCell>
```

### 3.8 Component

```xml
<mxCell id="{id}" parent="{boundary-id}" vertex="1"
  value="&lt;b&gt;{Nome}&lt;/b&gt;&lt;br&gt;&lt;font style=&quot;font-size:9px;font-style:italic&quot;&gt;[Component: {Tecnologia}]&lt;/font&gt;&lt;br&gt;{Descrição}"
  style="shape=mxgraph.c4.component2;html=1;whiteSpace=wrap;fillColor=#dae8fc;strokeColor=#6c8ebf;fontColor=#000000;align=center;">
  <mxGeometry x="{x-relativo}" y="{y-relativo}" width="220" height="100" as="geometry"/>
</mxCell>
```

### 3.9 Boundary (agrupa containers ou componentes)

```xml
<mxCell id="{id}" parent="1" vertex="1"
  value="{Nome do Boundary}"
  style="points=[[0,0],[0.25,0],[0.5,0],[0.75,0],[1,0],[1,0.25],[1,0.5],[1,0.75],[1,1],[0.75,1],[0.5,1],[0.25,1],[0,1],[0,0.75],[0,0.5],[0,0.25]];
    shape=mxgraph.c4.boundary;html=1;whiteSpace=wrap;fillColor=transparent;strokeColor=#666666;
    strokeDasharray=8 4;fontStyle=1;fontSize=12;align=left;verticalAlign=top;spacingLeft=6;">
  <mxGeometry x="{x}" y="{y}" width="{w}" height="{h}" as="geometry"/>
</mxCell>
```

### 3.10 Relationship (seta)

```xml
<mxCell id="{id}" parent="1" edge="1" source="{source-id}" target="{target-id}"
  value="&lt;font style=&quot;font-size:11px&quot;&gt;{Label}&lt;/font&gt;&lt;br&gt;&lt;font style=&quot;font-size:9px;font-style:italic&quot;&gt;[{Protocolo/Tecnologia}]&lt;/font&gt;"
  style="rounded=1;orthogonalLoop=1;html=1;jettySize=auto;exitX=1;exitY=0.5;exitDx=0;exitDy=0;
    entryX=0;entryY=0.5;entryDx=0;entryDy=0;edgeStyle=orthogonalEdgeStyle;
    endArrow=block;endFill=1;strokeColor=#666666;fontColor=#000000;align=center;
    labelBackgroundColor=none;">
  <mxGeometry relative="1" as="geometry"/>
</mxCell>
```

> **Dica de layout de setas**: ajuste `exitX/Y` e `entryX/Y` conforme a posição relativa dos nós (0=esquerda, 0.5=meio, 1=direita / 0=topo, 0.5=meio, 1=base). Para setas de cima para baixo use `exitY=1;entryY=0`.

---

## 4. Diagrama de Sequência UML

Para diagramas de sequência use o shape de **sequência UML nativa** do Draw.io.

### 4.1 Participante (lifeline)

```xml
<!-- Cabeçalho do participante -->
<mxCell id="{id}-hdr" parent="1" vertex="1"
  value="{Nome}"
  style="shape=umlLifeline;perimeter=mxPerimeter.rectanglePerimeter;
    fillColor=#dae8fc;strokeColor=#6c8ebf;fontStyle=1;fontSize=12;">
  <mxGeometry x="{x}" y="40" width="120" height="50" as="geometry"/>
</mxCell>
<!-- Lifeline (linha tracejada vertical) -->
<mxCell id="{id}-line" parent="1" vertex="1" value=""
  style="endArrow=none;dashed=1;strokeColor=#666666;">
  <mxGeometry x="{x+60}" y="90" width="1" height="{comprimento}" as="geometry">
    <Array as="points"/>
  </mxGeometry>
</mxCell>
```

### 4.2 Activation box (barra de ativação)

```xml
<mxCell id="{id}-act" parent="1" vertex="1" value=""
  style="fillColor=#dae8fc;strokeColor=#6c8ebf;">
  <mxGeometry x="{x+52}" y="{y-inicio}" width="16" height="{altura}" as="geometry"/>
</mxCell>
```

### 4.3 Mensagem síncrona

```xml
<mxCell id="{id}-msg" parent="1" edge="1" source="{src-id}-line" target="{tgt-id}-line"
  value="{Nome da mensagem}({parâmetros})"
  style="html=1;endArrow=block;endFill=1;strokeColor=#333333;fontSize=11;
    edgeStyle=elbowEdgeStyle;exitX=0.5;exitY=0;entryX=0.5;entryY=0;
    exitDy={dy-saida};entryDy={dy-entrada};">
  <mxGeometry relative="1" as="geometry"/>
</mxCell>
```

### 4.4 Mensagem de retorno

```xml
<mxCell id="{id}-ret" parent="1" edge="1" source="{tgt-id}-line" target="{src-id}-line"
  value="{Retorno}"
  style="endArrow=open;endFill=0;strokeColor=#333333;strokeDasharray=4 4;fontSize=11;
    edgeStyle=elbowEdgeStyle;exitDy={dy-saida};entryDy={dy-entrada};">
  <mxGeometry relative="1" as="geometry"/>
</mxCell>
```

### 4.5 Fragment (loop / alt / opt)

```xml
<mxCell id="{id}-frag" parent="1" vertex="1"
  value="&lt;b&gt;{tipo}&lt;/b&gt; [{condição}]"
  style="shape=table;html=1;startSize=20;fillColor=#fffae6;strokeColor=#d6b656;
    align=left;verticalAlign=top;spacingLeft=4;fontSize=11;">
  <mxGeometry x="{x}" y="{y}" width="{w}" height="{h}" as="geometry"/>
</mxCell>
```

---

## 5. Paths de saída por agente

### @architecture (greenfield)

| Diagrama | Path |
|---|---|
| C4 Nível 1 — Context | `docs/architecture/c4/c4-context.drawio` |
| C4 Nível 2 — Container | `docs/architecture/c4/c4-container.drawio` |
| C4 Nível 3 — Component (por BC) | `docs/architecture/c4/c4-component-{bc-slug}.drawio` |
| Sequência: autenticação | `docs/architecture/sequences/seq-autenticacao.drawio` |
| Sequência: fluxo principal por BC | `docs/architecture/sequences/seq-{bc-slug}.drawio` |

### @arch-discoverer (brownfield)

| Diagrama | Path |
|---|---|
| Arquitetura descoberta (AS-IS) | `assessment/arch-discovery.drawio` |
| Visão de containers (se detectada) | `assessment/arch-containers.drawio` |

---

## 6. Exemplo completo — C4 Context mínimo

```xml
<mxfile host="{{brand.displayName}}" version="1">
  <diagram id="diag-c4-context" name="C4 Level 1 — Context">
    <mxGraphModel dx="1422" dy="762" grid="1" gridSize="10" guides="1"
      tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1"
      pageWidth="1169" pageHeight="827" math="0" shadow="0">
      <root>
        <mxCell id="0"/>
        <mxCell id="1" parent="0"/>

        <!-- Persona: Usuário -->
        <mxCell id="p1" parent="1" vertex="1"
          value="&lt;font style=&quot;font-size:11px&quot;&gt;&lt;b&gt;Usuário&lt;/b&gt;&lt;/font&gt;&lt;br&gt;&lt;font style=&quot;font-size:9px;font-style:italic&quot;&gt;[Person]&lt;/font&gt;&lt;br&gt;&lt;font style=&quot;font-size:11px&quot;&gt;Profissional que usa o sistema&lt;/font&gt;"
          style="shape=mxgraph.c4.person2;html=1;whiteSpace=wrap;fillColor=#dae8fc;strokeColor=#6c8ebf;">
          <mxGeometry x="80" y="300" width="130" height="140" as="geometry"/>
        </mxCell>

        <!-- Sistema central -->
        <mxCell id="s1" parent="1" vertex="1"
          value="&lt;b&gt;Sistema Principal&lt;/b&gt;&lt;br&gt;&lt;font style=&quot;font-size:9px;font-style:italic&quot;&gt;[Software System]&lt;/font&gt;&lt;br&gt;Descrição do sistema"
          style="shape=mxgraph.c4.system2;html=1;whiteSpace=wrap;fillColor=#dae8fc;strokeColor=#6c8ebf;">
          <mxGeometry x="440" y="320" width="240" height="120" as="geometry"/>
        </mxCell>

        <!-- Sistema externo -->
        <mxCell id="e1" parent="1" vertex="1"
          value="&lt;b&gt;IdP / Auth0&lt;/b&gt;&lt;br&gt;&lt;font style=&quot;font-size:9px;font-style:italic&quot;&gt;[External System]&lt;/font&gt;&lt;br&gt;Autenticação OAuth2 / OIDC"
          style="shape=mxgraph.c4.system_ext2;html=1;whiteSpace=wrap;fillColor=#f5f5f5;strokeColor=#666666;">
          <mxGeometry x="820" y="320" width="240" height="120" as="geometry"/>
        </mxCell>

        <!-- Relação: Usuário → Sistema -->
        <mxCell id="r1" parent="1" edge="1" source="p1" target="s1"
          value="Acessa via&lt;br&gt;&lt;font style=&quot;font-size:9px;font-style:italic&quot;&gt;[HTTPS]&lt;/font&gt;"
          style="rounded=1;orthogonalLoop=1;html=1;jettySize=auto;edgeStyle=orthogonalEdgeStyle;
            endArrow=block;endFill=1;strokeColor=#666666;">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>

        <!-- Relação: Sistema → IdP -->
        <mxCell id="r2" parent="1" edge="1" source="s1" target="e1"
          value="Autentica via&lt;br&gt;&lt;font style=&quot;font-size:9px;font-style:italic&quot;&gt;[OAuth2 PKCE]&lt;/font&gt;"
          style="rounded=1;orthogonalLoop=1;html=1;jettySize=auto;edgeStyle=orthogonalEdgeStyle;
            endArrow=block;endFill=1;strokeColor=#666666;">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>

      </root>
    </mxGraphModel>
  </diagram>
</mxfile>
```

---

## 7. Checklist antes de salvar

- [ ] Todos os IDs de `mxCell` são únicos no arquivo
- [ ] Valores com `<b>`, `<br>`, `<i>` estão escapados como `&lt;b&gt;`, `&lt;br&gt;`, `&lt;i&gt;`
- [ ] Toda relação (`edge="1"`) tem `source` e `target` apontando para IDs existentes
- [ ] Cores seguem a tabela da Seção 1
- [ ] Tamanhos seguem os canônicos da Seção 1
- [ ] O arquivo abre sem erro no diagrams.net (valide mentalmente o XML)
