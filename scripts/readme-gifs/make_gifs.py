"""Gera os GIFs animados do README (pt-BR e en-US).

Uso (Windows, com Pillow e ffmpeg no PATH):
    python scripts/readme-gifs/make_gifs.py

Todas as saídas mostradas nos GIFs são respostas reais da API pública e do SDK,
coletadas em 2026-11-20 (ver `REAL` abaixo). Visual: Studio Graphite do efer.online.
"""

from __future__ import annotations

import shutil
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "docs" / "assets" / "readme"
FPS = 15

# ---------------------------------------------------------------- visual
BG = (11, 12, 14)
SURFACE_1 = (17, 18, 21)
SURFACE_2 = (22, 23, 27)
SURFACE_3 = (28, 29, 34)
BORDER = (31, 32, 36)
BORDER_STRONG = (44, 45, 50)
TEXT_1 = (237, 238, 240)
TEXT_2 = (160, 163, 171)
TEXT_3 = (108, 112, 122)
ACCENT = (115, 119, 240)
ACCENT_TEXT = (169, 171, 247)
ACCENT_SUBTLE = (30, 31, 52)
STRING = (159, 211, 183)
SUCCESS = (76, 183, 130)
WARNING = (217, 165, 74)

FONTS = Path("C:/Windows/Fonts")


def font(name: str, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(FONTS / name), size)


MONO = "CascadiaMono.ttf"
SANS = "segoeui.ttf"
SANS_BOLD = "segoeuib.ttf"

# ---------------------------------------------------------------- dados reais
REAL = {
    "cep_json": [
        "{",
        '  "uf": "SP",',
        '  "municipio": "São Paulo",',
        '  "logradouro": "Avenida Paulista",',
        '  "codigoIbgeMunicipio": "3550308",',
        '  "fonte": "viacep"',
        "}",
    ],
    "feriados_lines": [
        '{"data":"2026-01-01","nome":"Confraternização Universal","tipo":"feriado_nacional"}',
        '{"data":"2026-02-16","nome":"Carnaval","tipo":"ponto_facultativo"}',
        '{"data":"2026-02-17","nome":"Carnaval","tipo":"ponto_facultativo"}',
    ],
    "cnpj_json": [
        "{",
        '  "valid": true,',
        '  "formatted": "12.ABC.345/01DE-35",',
        '  "kind": "alphanumeric"',
        "}",
    ],
    "sdk_out": ["São Paulo viacep", "true", "alphanumeric"],
}

TEXTS = {
    "pt": {
        "tagline": "Dados públicos brasileiros com tipos, fonte e erros previsíveis.",
        "chips": ["CEP", "IBGE", "Feriados", "CNPJ"],
        "results": [
            ("01310-100", "São Paulo/SP · fonte: viacep"),
            ("RR", "15 municípios · fonte: IBGE"),
            ("2026-11-20", "feriado nacional · Lei 14.759/2023"),
            ("12.ABC.345/01DE-35", "válido · alfanumérico"),
        ],
        "foot": "SDK TypeScript + API pública · MIT",
        "c_cep": "# CEP → endereço normalizado, com a fonte",
        "c_fer": "# feriados de 2026, direto da portaria federal",
        "c_cnpj": "# CNPJ alfanumérico, validado localmente",
        "sdk_comment": "// CEP, feriados e CNPJ em poucas linhas",
        "run": "executando exemplo.ts",
        "output": "saída",
    },
    "en": {
        "tagline": "Brazilian public data with types, provenance and predictable errors.",
        "chips": ["CEP", "IBGE", "Holidays", "CNPJ"],
        "results": [
            ("01310-100", "São Paulo/SP · source: viacep"),
            ("RR", "15 municipalities · source: IBGE"),
            ("2026-11-20", "national holiday · Law 14.759/2023"),
            ("12.ABC.345/01DE-35", "valid · alphanumeric"),
        ],
        "foot": "TypeScript SDK + public API · MIT",
        "c_cep": "# CEP (postal code) → normalized address, with its source",
        "c_fer": "# 2026 holidays, straight from the federal decree",
        "c_cnpj": "# alphanumeric CNPJ, validated locally",
        "sdk_comment": "// CEP, holidays and CNPJ in a few lines",
        "run": "running example.ts",
        "output": "output",
    },
}


# ---------------------------------------------------------------- utilitários
def rounded(draw: ImageDraw.ImageDraw, box, radius, fill=None, outline=None, width=1):
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def grid_backdrop(img: Image.Image, step: int = 32):
    """Grade sutil que some para as bordas, como o fundo do efer.online."""
    w, h = img.size
    layer = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    cx, cy = w * 0.3, 0
    maxd = (w**2 + h**2) ** 0.5 * 0.7
    for x in range(0, w, step):
        for y in range(0, h, 4):
            a = max(0, 1 - (((x - cx) ** 2 + (y - cy) ** 2) ** 0.5) / maxd)
            d.point((x, y), fill=(255, 255, 255, int(18 * a)))
    for y in range(0, h, step):
        for x in range(0, w, 4):
            a = max(0, 1 - (((x - cx) ** 2 + (y - cy) ** 2) ** 0.5) / maxd)
            d.point((x, y), fill=(255, 255, 255, int(18 * a)))
    img.alpha_composite(layer)


def window(img: Image.Image, box, title: str, title_font):
    d = ImageDraw.Draw(img)
    x0, y0, x1, y1 = box
    rounded(d, box, 12, fill=SURFACE_1, outline=BORDER)
    d.line((x0 + 1, y0 + 36, x1 - 1, y0 + 36), fill=BORDER)
    for i, c in enumerate([(60, 62, 68), (60, 62, 68), (60, 62, 68)]):
        d.ellipse((x0 + 16 + i * 16, y0 + 14, x0 + 24 + i * 16, y0 + 22), fill=c)
    tw = d.textlength(title, font=title_font)
    d.text(((x0 + x1 - tw) / 2, y0 + 10), title, font=title_font, fill=TEXT_3)


def json_tokens(line: str):
    """Colore uma linha de JSON: chaves, strings, números e literais."""
    out, i = [], 0
    while i < len(line):
        ch = line[i]
        if ch == '"':
            j = i + 1
            while j < len(line) and line[j] != '"':
                j += 1
            token = line[i : j + 1]
            rest = line[j + 1 :].lstrip()
            out.append((token, ACCENT_TEXT if rest.startswith(":") else STRING))
            i = j + 1
        elif line.startswith("true", i) or line.startswith("false", i):
            word = "true" if line.startswith("true", i) else "false"
            out.append((word, WARNING))
            i += len(word)
        else:
            out.append((ch, TEXT_2))
            i += 1
    return out


def draw_tokens(d: ImageDraw.ImageDraw, x, y, tokens, fnt):
    for text, color in tokens:
        d.text((x, y), text, font=fnt, fill=color)
        x += d.textlength(text, font=fnt)
    return x


def ts_tokens(line: str):
    """Destaque simples de TypeScript."""
    if line.strip().startswith("//"):
        return [(line, TEXT_3)]
    keywords = {"import", "from", "const", "await"}
    out, word, i = [], "", 0
    while i < len(line):
        ch = line[i]
        if ch in "'\"":
            if word:
                out.append((word, ACCENT_TEXT if word in keywords else TEXT_1))
                word = ""
            j = line.find(ch, i + 1)
            j = len(line) - 1 if j < 0 else j
            out.append((line[i : j + 1], STRING))
            i = j + 1
            continue
        if ch.isalnum() or ch == "_":
            word += ch
        else:
            if word:
                out.append((word, ACCENT_TEXT if word in keywords else TEXT_1))
                word = ""
            out.append((ch, TEXT_2))
        i += 1
    if word:
        out.append((word, ACCENT_TEXT if word in keywords else TEXT_1))
    return out


def write_gif(frames: list[Image.Image], name: str):
    """Monta o GIF com paleta otimizada pelo ffmpeg (sem perder as cores do tema)."""
    OUT.mkdir(parents=True, exist_ok=True)
    target = OUT / f"{name}.gif"
    with tempfile.TemporaryDirectory() as tmp:
        for i, f in enumerate(frames):
            f.convert("RGB").save(Path(tmp) / f"f{i:04d}.png")
        pattern = str(Path(tmp) / "f%04d.png")
        palette = str(Path(tmp) / "palette.png")
        subprocess.run(
            ["ffmpeg", "-y", "-loglevel", "error", "-framerate", str(FPS), "-i", pattern,
             "-vf", "palettegen=max_colors=192:stats_mode=full", palette],
            check=True,
        )
        subprocess.run(
            ["ffmpeg", "-y", "-loglevel", "error", "-framerate", str(FPS), "-i", pattern, "-i", palette,
             "-lavfi", "paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle", "-loop", "0", str(target)],
            check=True,
        )
    print(f"{target.relative_to(ROOT)}  {target.stat().st_size / 1024:.0f} KB  {len(frames)} quadros")


# ---------------------------------------------------------------- GIF 1: banner
def hero(lang: str):
    t = TEXTS[lang]
    W, H = 960, 360
    f_title = font(SANS_BOLD, 54)
    f_tag = font(SANS, 21)
    f_chip = font(MONO, 15)
    f_res = font(MONO, 16)
    f_small = font(MONO, 13)
    f_mark = font(MONO, 20)

    base = Image.new("RGBA", (W, H), BG + (255,))
    grid_backdrop(base)
    d = ImageDraw.Draw(base)
    rounded(d, (0, 0, W - 1, H - 1), 16, outline=BORDER)
    # marca
    rounded(d, (56, 56, 104, 104), 12, fill=SURFACE_2, outline=BORDER_STRONG)
    d.text((63, 66), "{ }", font=f_mark, fill=TEXT_1)
    d.rounded_rectangle((94, 94, 100, 100), 2, fill=ACCENT)
    d.text((124, 48), "Brasil Dev Kit", font=f_title, fill=TEXT_1)
    d.text((56, H - 44), t["foot"], font=f_small, fill=TEXT_3)
    url = "efer.online/projeto/brasil-dev-kit"
    d.text((W - 56 - d.textlength(url, font=f_small), H - 44), url, font=f_small, fill=TEXT_3)

    frames = []
    tagline = t["tagline"]
    type_frames = len(tagline) // 2 + 1
    per_chip = 30  # 2 s por módulo
    total = type_frames + per_chip * 4 + 10
    for k in range(total):
        img = base.copy()
        d = ImageDraw.Draw(img)
        shown = tagline[: min(len(tagline), k * 2)]
        d.text((58, 128), shown, font=f_tag, fill=TEXT_2)
        if k < type_frames or (k // 8) % 2 == 0:
            cx = 58 + d.textlength(shown, font=f_tag) + 2
            d.rectangle((cx, 132, cx + 2, 156), fill=ACCENT)
        active = max(0, min(3, (k - type_frames) // per_chip)) if k >= type_frames else -1
        x = 56
        for i, chip in enumerate(t["chips"]):
            w = d.textlength(chip, font=f_chip) + 28
            on = i == active
            rounded(d, (x, 196, x + w, 228), 8,
                    fill=ACCENT_SUBTLE if on else SURFACE_2,
                    outline=(70, 72, 140) if on else BORDER)
            d.text((x + 14, 202), chip, font=f_chip, fill=ACCENT_TEXT if on else TEXT_2)
            x += w + 10
        if active >= 0:
            q, r = t["results"][active]
            local = (k - type_frames) % per_chip
            reveal = min(len(r), local * 3)
            y = 256
            d.text((58, y), "→", font=f_res, fill=TEXT_3)
            qx = 82
            d.text((qx, y), q, font=f_res, fill=TEXT_1)
            rx = qx + d.textlength(q + "  ", font=f_res)
            d.text((rx, y), r[:reveal], font=f_res, fill=SUCCESS if local > 4 else TEXT_2)
        frames.append(img)
    write_gif(frames, f"hero-{lang}")


# ---------------------------------------------------------------- GIF 2: terminal
@dataclass
class Line:
    tokens: list
    kind: str  # "cmd" | "out"


def terminal(lang: str):
    t = TEXTS[lang]
    W, H = 960, 520
    f = font(MONO, 15)
    f_title = font(MONO, 13)
    lh = 23
    top, left = 56, 24
    max_lines = (H - top - 24) // lh

    script = [
        ("cmd", "API=https://efer.online/api/brasil-dev-kit/v1", None),
        ("cmt", t["c_cep"], None),
        ("cmd", "curl -s $API/cep/01310-100 | jq '{uf,municipio,logradouro,codigoIbgeMunicipio,fonte:.fonte.provedor}'", REAL["cep_json"]),
        ("cmt", t["c_fer"], None),
        ("cmd", "curl -s $API/feriados/2026 | jq -c '.datas[:3][] | {data,nome,tipo}'", REAL["feriados_lines"]),
        ("cmt", t["c_cnpj"], None),
        ("cmd", "curl -s $API/cnpj/12ABC34501DE35 | jq '{valid,formatted,kind}'", REAL["cnpj_json"]),
    ]

    lines: list[Line] = []
    frames: list[Image.Image] = []

    def render(partial: Line | None = None, cursor=True):
        img = Image.new("RGBA", (W, H), BG + (255,))
        window(img, (0, 0, W - 1, H - 1), "bash · brasil-dev-kit", f_title)
        d = ImageDraw.Draw(img)
        visible = lines + ([partial] if partial else [])
        visible = visible[-max_lines:]
        y = top
        end_x = left
        for ln in visible:
            end_x = draw_tokens(d, left, y, ln.tokens, f)
            y += lh
        if cursor:
            d.rectangle((end_x + 2, y - lh + 4, end_x + 10, y - 3), fill=ACCENT)
        return img

    def hold(n, partial=None):
        for k in range(n):
            frames.append(render(partial, cursor=(k // 7) % 2 == 0))

    hold(6, Line([("$ ", SUCCESS)], "cmd"))
    for kind, text, output in script:
        if kind == "cmt":
            lines.append(Line([(text, TEXT_3)], "out"))
            continue
        step = 3
        for n in range(0, len(text) + 1, step):
            frames.append(render(Line([("$ ", SUCCESS), (text[:n], TEXT_1)], "cmd")))
        lines.append(Line([("$ ", SUCCESS), (text, TEXT_1)], "cmd"))
        hold(4, None)
        for out in output or []:
            lines.append(Line(json_tokens(out), "out"))
            frames.append(render(Line([("", TEXT_1)], "out"), cursor=False))
        hold(18 if output else 3, Line([("$ ", SUCCESS)], "cmd"))
    hold(30, Line([("$ ", SUCCESS)], "cmd"))
    write_gif(frames, f"terminal-{lang}")


# ---------------------------------------------------------------- GIF 3: SDK
def sdk(lang: str):
    t = TEXTS[lang]
    W, H = 960, 440
    f = font(MONO, 14)
    f_title = font(MONO, 13)
    lh = 22
    code = [
        t["sdk_comment"],
        "import { createCepClient, isFeriadoNacional, validateCnpj } from 'brasil-dev-kit';",
        "",
        "const cep = createCepClient();",
        "const endereco = await cep.lookup('01310-100');",
        "console.log(endereco.municipio, endereco.fonte.provedor);",
        "",
        "console.log(isFeriadoNacional('2026-11-20'));",
        "console.log(validateCnpj('12.ABC.345/01DE-35').kind);",
    ]
    # quebra a linha longa do import para caber
    code[1:2] = [
        "import { createCepClient, isFeriadoNacional, validateCnpj }",
        "  from 'brasil-dev-kit';",
    ]
    ed_box = (0, 0, W - 1, 300)
    out_box = (0, 312, W - 1, H - 1)
    file_name = "exemplo.ts" if lang == "pt" else "example.ts"
    frames: list[Image.Image] = []

    def render(n_chars: int, out_lines: int, status: str | None):
        img = Image.new("RGBA", (W, H), BG + (255,))
        window(img, ed_box, file_name, f_title)
        d = ImageDraw.Draw(img)
        remaining = n_chars
        y = 52
        last = (24, y)
        for i, line in enumerate(code):
            d.text((24, y), f"{i + 1:>2}", font=f, fill=(60, 62, 68))
            if remaining <= 0:
                y += lh
                continue
            part = line[: remaining]
            remaining -= len(line) + 1
            end = draw_tokens(d, 60, y, ts_tokens(part), f)
            last = (end, y)
            y += lh
        if status is None:
            d.rectangle((last[0] + 1, last[1] + 3, last[0] + 3, last[1] + 19), fill=ACCENT)
        # painel de saída
        rounded(d, out_box, 12, fill=SURFACE_1, outline=BORDER)
        d.text((24, out_box[1] + 14), t["output"], font=f_title, fill=TEXT_3)
        if status:
            sw = d.textlength(status, font=f_title)
            d.text((W - 24 - sw, out_box[1] + 14), status, font=f_title, fill=SUCCESS if out_lines else TEXT_3)
        yy = out_box[1] + 44
        for line in REAL["sdk_out"][:out_lines]:
            d.text((24, yy), "›", font=f, fill=TEXT_3)
            d.text((44, yy), line, font=f, fill=STRING if line != "true" else WARNING)
            yy += lh
        return img

    total_chars = sum(len(c) + 1 for c in code)
    for n in range(0, total_chars + 4, 4):
        frames.append(render(n, 0, None))
    for _ in range(8):
        frames.append(render(total_chars, 0, None))
    for _ in range(10):
        frames.append(render(total_chars, 0, t["run"] + " ..."))
    for k in range(1, 4):
        for _ in range(6):
            frames.append(render(total_chars, k, "node · " + ("ok" if k == 3 else "...")))
    for _ in range(45):
        frames.append(render(total_chars, 3, "node · ok"))
    write_gif(frames, f"sdk-{lang}")


if __name__ == "__main__":
    if not shutil.which("ffmpeg"):
        raise SystemExit("ffmpeg não encontrado no PATH")
    for lang in ("pt", "en"):
        hero(lang)
        terminal(lang)
        sdk(lang)
