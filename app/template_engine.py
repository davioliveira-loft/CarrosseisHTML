import base64
import hashlib
import json
from pathlib import Path

from jinja2 import Environment, FileSystemLoader

from app.models import Briefing, SlideTexto, SugestaoImagens

# Pareamento de fontes por estilo visual (briefing)
FONT_PAIRS: dict[str, tuple[str, str]] = {
    "classico":    ("Playfair Display", "DM Sans"),
    "moderno":     ("Barlow Condensed", "Plus Jakarta Sans"),
    "minimalista": ("Plus Jakarta Sans", "Plus Jakarta Sans"),
    "bold":        ("Space Grotesk", "Space Grotesk"),
}

# (família, peso) → arquivo .woff2 esperado em fonts/
FONT_FILES: dict[tuple[str, str], str] = {
    ("Barlow Condensed",  "900"): "barlow-condensed-900.woff2",
    ("Plus Jakarta Sans", "400"): "plus-jakarta-sans-400.woff2",
    ("Plus Jakarta Sans", "700"): "plus-jakarta-sans-700.woff2",
    ("Plus Jakarta Sans", "800"): "plus-jakarta-sans-800.woff2",
    ("Playfair Display",  "900"): "playfair-display-900.woff2",
    ("DM Sans",           "400"): "dm-sans-400.woff2",
    ("Space Grotesk",     "400"): "space-grotesk-400.woff2",
    ("Space Grotesk",     "800"): "space-grotesk-800.woff2",
}

# Pesos necessários por fonte (headline usa o primeiro, body usa os três)
FONT_WEIGHTS: dict[str, list[str]] = {
    "Barlow Condensed":  ["900"],
    "Playfair Display":  ["900"],
    "Plus Jakarta Sans": ["400", "700", "800"],
    "DM Sans":           ["400"],
    "Space Grotesk":     ["400", "800"],
}


def render_carrossel(
    briefing: Briefing,
    slides: list[SlideTexto],
    imagens: dict[int, str],          # {slide_num: "data:image/...;base64,..."}
    sugestao: SugestaoImagens | None,
    template_dir: Path,
    logo_data_url: str | None = None,
    carrossel_id: str = "",
) -> str:
    paleta = _build_paleta(briefing)
    font_face_css = _build_font_face(briefing.estilo_visual, template_dir / "fonts")

    # Mapeia sugestão de imagem por slide
    img_map: dict[int, dict] = {}
    if sugestao:
        for s in sugestao.slides_com_imagem:
            if s.numero in imagens:
                img_map[s.numero] = {"base64": imagens[s.numero], "tipo": s.tipo_imagem}

    # Seed para variação determinística (mesma combinação carrossel+briefing produz mesmas variantes)
    seed = f"{carrossel_id}|{briefing.handle}|{briefing.cor_primaria}"

    # Monta contexto de slides com dados de imagem + variante mesclados
    slides_ctx = []
    for slide in slides:
        d = slide.model_dump()
        img = img_map.get(slide.numero)
        d["imagem_base64"] = img["base64"] if img else None
        d["tipo_imagem"] = img["tipo"] if img else None
        d["variant"] = _pick_variant(seed, slide.numero, slide.tipo)
        slides_ctx.append(d)

    # Nome amigável do template (do meta.json) p/ exibir no preview
    template_nome = template_dir.name
    meta_path = template_dir / "meta.json"
    if meta_path.exists():
        try:
            template_nome = json.loads(meta_path.read_text(encoding="utf-8")).get("nome", template_nome)
        except Exception:
            pass

    env = Environment(
        loader=FileSystemLoader(str(template_dir)),
        autoescape=False,  # permitir HTML nos campos de texto dos slides
    )
    tmpl = env.get_template("template.html")

    return tmpl.render(
        paleta=paleta,
        font_face_css=font_face_css,
        handle=briefing.handle,
        slides=slides_ctx,
        total_slides=len(slides),
        logo_url=logo_data_url,
        template_nome=template_nome,
    )


# ── Variantes de layout ───────────────────────────────────────────────────────

def _pick_variant(seed: str, slide_num: int, slide_type: str) -> int:
    """Retorna 1, 2 ou 3 de forma determinística — mesmo seed → mesma variante."""
    h = hashlib.md5(f"{seed}#{slide_num}#{slide_type}".encode()).hexdigest()
    return (int(h[:8], 16) % 3) + 1


# ── Paleta de cores ───────────────────────────────────────────────────────────

def _build_paleta(briefing: Briefing) -> dict:
    p = briefing.cor_primaria
    pl = _lighten(p, 0.20)
    pd = _darken(p, 0.30)
    warm = _is_warm(p)

    # Tinta (ink/preto) — usa override ou near-black
    db = briefing.cor_tinta or ("#0F0D0C" if warm else "#0C0D10")

    # Fundo (paper/cream) — usa override ou claro padrão
    lb = briefing.cor_fundo or ("#F7F4F1" if warm else "#F0F2F5")
    lr = _darken(lb, 0.05)

    # Destaque (accent/yellow) — usa override ou cor complementar do primário
    accent = briefing.cor_destaque or _complementar_accent(p, warm)

    gradient = f"linear-gradient(165deg, {pd} 0%, {p} 50%, {pl} 100%)"
    font_head, font_body = FONT_PAIRS.get(briefing.estilo_visual, ("Barlow Condensed", "Plus Jakarta Sans"))
    return {
        "P": p, "PL": pl, "PD": pd,
        "LB": lb, "LR": lr, "DB": db,
        "ACCENT": accent,
        "G": gradient,
        "F_HEAD": font_head,
        "F_BODY": font_body,
    }


def _complementar_accent(primary: str, warm: bool) -> str:
    """Sugere uma cor de destaque que combine: amarelo se primário escuro/frio, ciano se quente."""
    if warm:
        return "#FFE74C"   # amarelo vibrante
    return "#FFD23F"       # amarelo levemente mais alaranjado para combinar com primários frios


def _hex_to_rgb(h: str) -> tuple[int, int, int]:
    h = h.lstrip("#")
    return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)


def _rgb_to_hex(r: int, g: int, b: int) -> str:
    return f"#{r:02X}{g:02X}{b:02X}"


def _lighten(h: str, t: float) -> str:
    r, g, b = _hex_to_rgb(h)
    return _rgb_to_hex(
        min(255, int(r + (255 - r) * t)),
        min(255, int(g + (255 - g) * t)),
        min(255, int(b + (255 - b) * t)),
    )


def _darken(h: str, t: float) -> str:
    r, g, b = _hex_to_rgb(h)
    return _rgb_to_hex(max(0, int(r * (1 - t))), max(0, int(g * (1 - t))), max(0, int(b * (1 - t))))


def _is_warm(h: str) -> bool:
    r, g, b = _hex_to_rgb(h)
    return r >= g and r >= b


# ── Carregamento de fontes ────────────────────────────────────────────────────

def _build_font_face(estilo: str, fonts_dir: Path) -> str:
    font_head, font_body = FONT_PAIRS.get(estilo, ("Barlow Condensed", "Plus Jakarta Sans"))

    needed: set[tuple[str, str]] = set()
    for w in FONT_WEIGHTS.get(font_head, ["900"]):
        needed.add((font_head, w))
    for w in FONT_WEIGHTS.get(font_body, ["400"]):
        needed.add((font_body, w))

    blocks: list[str] = []
    for key in sorted(needed):
        filename = FONT_FILES.get(key)
        if not filename:
            continue
        path = fonts_dir / filename
        if not path.exists():
            continue  # sem woff2 = usa fallback do sistema
        b64 = base64.b64encode(path.read_bytes()).decode()
        family, weight = key
        blocks.append(
            f"@font-face {{\n"
            f"  font-family: '{family}';\n"
            f"  font-weight: {weight};\n"
            f"  font-style: normal;\n"
            f"  src: url('data:font/woff2;base64,{b64}') format('woff2');\n"
            f"}}"
        )
    return "\n".join(blocks)
