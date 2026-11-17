#!/usr/bin/env python3
"""brand-icon-font.py: gera a fonte de ícones da extensão a partir de um SVG (F1.1)

Uso:
  python3 scripts/brand-icon-font.py <glifo.svg> <saida.woff> <nome-do-glifo> <codepoint-hex> <família>
  ex.: ... media/fonts/jatai-mark.svg media/fonts/jatai-icons.woff jatai-mark E900 "Jatai Icons"

Quem chama normalmente é `node scripts/brand-assets.mjs`, que tira nome, família
e caminhos do src/data/brand.json.

Por que uma fonte: `contributes.icons` só aceita glifo de fonte (`fontPath` +
`fontCharacter`), e o `$(<marca>-mark)` da status bar só existe assim. A
activity bar e as views usam o SVG direto.

O SVG precisa ser simples, porque a fonte tem uma cor só e nenhum efeito:
  - viewBox "0 0 N N" quadrado. O glifo ocupa o em inteiro (ascendente = em,
    descendente 0), como os codicons e a fonte anterior;
  - só <path>, sem stroke, transform, máscara, recorte ou transparência;
  - um <path> por forma. Dentro de um path, buraco é contorno de sentido
    oposto (regra nonzero). Cada path é orientado pelo seu maior contorno, então
    formas em paths diferentes sempre se somam, mesmo sobrepostas.

Requer fontTools (`pip install fonttools`). Saída determinística: as datas do
`head` são fixas, então o mesmo SVG e a mesma versão do fontTools geram o mesmo
.woff byte a byte.

Saída: exit 0 = fonte gravada; 1 = SVG fora das regras acima; 2 = uso errado.
"""

import re
import sys
from xml.etree import ElementTree as ET

from fontTools.fontBuilder import FontBuilder
from fontTools.pens.areaPen import AreaPen
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.recordingPen import RecordingPen
from fontTools.pens.reverseContourPen import ReverseContourPen
from fontTools.pens.t2CharStringPen import T2CharStringPen
from fontTools.pens.transformPen import TransformPen
from fontTools.svgLib.path import parse_path

UPM = 1000
SVG = "{http://www.w3.org/2000/svg}"
# 2026-11-15 00:00 UTC em segundos desde 1904-01-01, a época do `head`.
FIXED_TIMESTAMP = 3877545600
ALLOWED_TAGS = {"svg", "g", "path", "title", "desc"}
FORBIDDEN_ATTRS = ("transform", "mask", "clip-path", "opacity", "fill-opacity", "fill-rule", "filter")


def fail(message):
    print(f"brand-icon-font: {message}", file=sys.stderr)
    sys.exit(1)


def check_svg(root):
    """Recusa o que a fonte não consegue reproduzir, em vez de gerar um glifo diferente do SVG."""
    for el in root.iter():
        if not isinstance(el.tag, str):
            continue  # comentário
        tag = el.tag.replace(SVG, "")
        if tag not in ALLOWED_TAGS:
            fail(f"<{tag}> não é suportado; use só <path> (veja o cabeçalho)")
        for attr in FORBIDDEN_ATTRS:
            if el.get(attr) is not None:
                fail(f"atributo {attr} em <{tag}>: a fonte não tem esse efeito")
        stroke = el.get("stroke")
        if stroke not in (None, "none"):
            fail(f"stroke em <{tag}>: desenhe o traço como preenchimento")


def split_contours(recording):
    contours, current = [], []
    for op, args in recording.value:
        current.append((op, args))
        if op in ("closePath", "endPath"):
            contours.append(current)
            current = []
    if current:
        contours.append(current)
    return contours


def replay(contour, pen):
    for op, args in contour:
        getattr(pen, op)(*args)


def signed_area(contour):
    pen = AreaPen()
    replay(contour, pen)
    return pen.value


def build_charstring(root):
    view_box = [float(v) for v in (root.get("viewBox") or "").replace(",", " ").split()]
    if len(view_box) != 4 or view_box[0] != 0 or view_box[1] != 0 or view_box[2] != view_box[3]:
        fail('o viewBox tem que ser "0 0 N N"')
    scale = UPM / view_box[2]
    to_font = (scale, 0, 0, -scale, 0, UPM)  # SVG tem y para baixo; a fonte, para cima

    pen = T2CharStringPen(UPM, None)
    bounds = BoundsPen(None)
    paths = [el.get("d") for el in root.iter(f"{SVG}path")]
    if not paths:
        fail("nenhum <path> no SVG")
    for d in paths:
        recording = RecordingPen()
        parse_path(d, TransformPen(recording, to_font))
        contours = split_contours(recording)
        # Contorno externo no sentido anti-horário (convenção do CFF); os buracos
        # do mesmo path ficam no sentido oposto ao dele.
        largest = max(contours, key=lambda c: abs(signed_area(c)))
        reverse = signed_area(largest) < 0
        for contour in contours:
            replay(contour, ReverseContourPen(pen) if reverse else pen)
            replay(contour, bounds)
    return pen.getCharString(), bounds.bounds


def main(argv):
    if len(argv) != 6:
        print(__doc__.split("\n\n")[1], file=sys.stderr)
        return 2
    svg_path, out_path, glyph_name, codepoint_hex, family = argv[1:]
    if not re.fullmatch(r"[A-Za-z0-9 ]+", family):
        print("brand-icon-font: família só com letras ASCII, dígitos e espaço", file=sys.stderr)
        return 2
    codepoint = int(codepoint_hex, 16)

    root = ET.parse(svg_path).getroot()
    check_svg(root)
    charstring, (x_min, _y_min, _x_max, _y_max) = build_charstring(root)

    ps_name = family.replace(" ", "") + "-Regular"
    notdef = T2CharStringPen(UPM, None).getCharString()
    fb = FontBuilder(UPM, isTTF=False)
    fb.setupGlyphOrder([".notdef", glyph_name])
    fb.setupCharacterMap({codepoint: glyph_name})
    fb.setupCFF(ps_name, {"FullName": family, "FamilyName": family, "Weight": "Regular"},
                {".notdef": notdef, glyph_name: charstring}, {})
    fb.setupHorizontalMetrics({".notdef": (UPM, 0), glyph_name: (UPM, round(x_min))})
    fb.setupHorizontalHeader(ascent=UPM, descent=0)
    fb.setupNameTable({
        "familyName": family,
        "styleName": "Regular",
        "uniqueFontIdentifier": f"{ps_name};1.000",
        "fullName": family,
        "psName": ps_name,
        "version": "Version 1.000",
    })
    fb.setupOS2(sTypoAscender=UPM, sTypoDescender=0, sTypoLineGap=0,
                usWinAscent=UPM, usWinDescent=0, fsType=0, achVendID="NONE")
    fb.setupPost()
    fb.updateHead(created=FIXED_TIMESTAMP, modified=FIXED_TIMESTAMP)
    fb.font.flavor = "woff"
    fb.save(out_path)
    print(f"brand-icon-font: {out_path}: glifo {glyph_name} em U+{codepoint:04X}, {len(fb.font.getGlyphOrder())} glifos")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
