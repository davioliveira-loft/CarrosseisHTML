"""Content Machine — modo JSON puro.

Pipeline:
1. Usuário define briefing (marca, paleta, logo) na sidebar.
2. Usuário importa um JSON com carrosséis prontos (gerados externamente).
3. Para cada carrossel: escolhe template, faz upload de imagens, gera preview, exporta PNGs.
"""
import base64
import json
import re
from datetime import date, datetime
from pathlib import Path
from typing import Any

from fastapi import BackgroundTasks, FastAPI, File, HTTPException, UploadFile
from fastapi.responses import FileResponse, HTMLResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from app.exporter import exportar_pngs
from app.models import Briefing, SlidesResponse, SugestaoImagens
from app.template_engine import FONT_PAIRS, render_carrossel

# ── Constantes de caminhos ────────────────────────────────────────────────────

BASE = Path(__file__).parent.parent
CARROSSEIS = BASE / "carrosseis"
DATA = BASE / "data"
TEMPLATES_ROOT = BASE / "templates"
TEMPLATE_DEFAULT = "alternado-claro-escuro"
BATCHES = DATA / "batches"
LOGOS = DATA / "logos"

app = FastAPI(title="Content Machine — JSON")
app.mount("/frontend", StaticFiles(directory=str(BASE / "frontend")), name="frontend")


# ── Helpers genéricos ─────────────────────────────────────────────────────────

def _read(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def _write(path: Path, data: Any) -> None:
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def _cid(ideia: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", ideia[:40].lower()).strip("-")
    return f"{date.today().isoformat()}_{slug or 'carrossel'}"


def _require_pasta(cid: str) -> Path:
    p = CARROSSEIS / cid
    if not p.exists():
        raise HTTPException(404, f"Carrossel '{cid}' não encontrado")
    return p


def _require_file(path: Path, msg: str) -> Any:
    if not path.exists():
        raise HTTPException(404, msg)
    return _read(path)


def _set_status(cid: str, etapa: str, erro: str | None = None) -> None:
    (CARROSSEIS / cid / "status.json").write_text(
        json.dumps({"etapa": etapa, "erro": erro}, ensure_ascii=False), encoding="utf-8"
    )


# ── Templates ─────────────────────────────────────────────────────────────────

def _template_dir(name: str | None) -> Path:
    name = (name or TEMPLATE_DEFAULT).strip()
    p = TEMPLATES_ROOT / name
    return p if (p / "template.html").exists() else TEMPLATES_ROOT / TEMPLATE_DEFAULT


def _carrossel_template(cid: str) -> str:
    p = CARROSSEIS / cid / "template.txt"
    if p.exists():
        nome = p.read_text(encoding="utf-8").strip()
        if nome and (TEMPLATES_ROOT / nome / "template.html").exists():
            return nome
    return TEMPLATE_DEFAULT


def _listar_templates() -> list[dict]:
    out = []
    if TEMPLATES_ROOT.exists():
        for d in sorted(TEMPLATES_ROOT.iterdir()):
            if d.is_dir() and (d / "template.html").exists():
                meta = {}
                meta_path = d / "meta.json"
                if meta_path.exists():
                    try: meta = json.loads(meta_path.read_text(encoding="utf-8"))
                    except Exception: pass
                out.append({
                    "id": d.name,
                    "nome": meta.get("nome", d.name),
                    "descricao": meta.get("descricao", ""),
                })
    return out


# ── Logos ─────────────────────────────────────────────────────────────────────

_LOGO_EXTS = (".png", ".jpg", ".jpeg", ".webp", ".svg")
_LOGO_MIME = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
              ".webp": "image/webp", ".svg": "image/svg+xml"}


def _logo_path_existente(handle: str) -> Path | None:
    handle = handle.strip().lstrip("@").lower()
    if not handle:
        return None
    for ext in _LOGO_EXTS:
        p = LOGOS / f"{handle}{ext}"
        if p.exists():
            return p
    return None


def _logo_data_url(handle: str) -> str | None:
    p = _logo_path_existente(handle)
    if not p:
        return None
    mime = _LOGO_MIME.get(p.suffix.lower(), "image/png")
    b64 = base64.b64encode(p.read_bytes()).decode()
    return f"data:{mime};base64,{b64}"


# ── Batches ───────────────────────────────────────────────────────────────────

def _read_batch(batch_id: str) -> dict:
    p = BATCHES / f"{batch_id}.json"
    if not p.exists():
        raise HTTPException(404, f"Lote '{batch_id}' não encontrado")
    return _read(p)


def _write_batch(batch_id: str, data: dict) -> None:
    BATCHES.mkdir(parents=True, exist_ok=True)
    _write(BATCHES / f"{batch_id}.json", data)


# ── Sugestão de imagens via regra (sem IA) ────────────────────────────────────

def _fallback_sugestao(slides_resumo: list[dict], max_imagens: int = 6) -> dict:
    """Gera sugestão de imagens por regra (sem IA).

    Regras de elegibilidade (afrouxadas):
      - capa: sempre (full-bleed, obrigatório)
      - dark < 120 palavras: background-overlay
      - light < 140 palavras: img-box
      - grad < 100 palavras: background-overlay (síntese com imagem de fundo)
      - cta: nunca (mantém limpo)

    O total é limitado por `max_imagens` (default 6, configurável via briefing).
    """
    imgs = []
    for s in slides_resumo:
        if s["tipo"] == "capa":
            imgs.append({
                "numero": s["numero"],
                "tipo_imagem": "full-bleed",
                "descricao_sugestao": "Foto de impacto da capa. Sujeito no terço superior, gradiente escuro na base.",
                "obrigatorio": True,
            })
        elif s["tipo"] == "dark" and s["palavras"] < 120:
            imgs.append({
                "numero": s["numero"],
                "tipo_imagem": "background-overlay",
                "descricao_sugestao": "Imagem de fundo com overlay 80%. Reforça o tema do slide.",
                "obrigatorio": False,
            })
        elif s["tipo"] == "light" and s["palavras"] < 140:
            imgs.append({
                "numero": s["numero"],
                "tipo_imagem": "img-box",
                "descricao_sugestao": "Box no topo do slide. Imagem ilustrativa do tema.",
                "obrigatorio": False,
            })
        elif s["tipo"] == "grad" and s["palavras"] < 100:
            imgs.append({
                "numero": s["numero"],
                "tipo_imagem": "background-overlay",
                "descricao_sugestao": "Imagem de fundo para a síntese. Tom contemplativo, contraste alto.",
                "obrigatorio": False,
            })
        if len(imgs) >= max_imagens:
            break
    return {"total_imagens_sugeridas": len(imgs), "slides_com_imagem": imgs}


def _palavras_de_slide(s) -> int:
    texto = " ".join(filter(None, [s.headline_capa, s.bloco1, s.bloco2, s.tag]))
    return len(re.sub(r"<[^>]+>", "", texto).split())


def _gerar_sugestao_para_slides(slides_list, max_imagens: int = 6) -> dict:
    resumo = [
        {"numero": s.numero, "tipo": s.tipo, "palavras": _palavras_de_slide(s), "tem_tag": bool(s.tag)}
        for s in slides_list
    ]
    return _fallback_sugestao(resumo, max_imagens=max_imagens)


# ── Background task: exportação Playwright ────────────────────────────────────

def _bg_exportar(cid: str, fonte: str) -> None:
    try:
        _set_status(cid, "exportando")
        exportar_pngs(CARROSSEIS / cid / "slides.html", CARROSSEIS / cid, fonte)
        _set_status(cid, "finalizado")
    except Exception as e:
        _set_status(cid, "erro", str(e))


# ──────────────────────────────────────────────────────────────────────────────
# ROTAS
# ──────────────────────────────────────────────────────────────────────────────

@app.get("/", response_class=HTMLResponse)
async def index():
    html = (BASE / "frontend" / "index.html").read_text(encoding="utf-8")
    # Cache-busting: usa mtime dos assets como versão
    css_v = int((BASE / "frontend" / "style.css").stat().st_mtime)
    js_v  = int((BASE / "frontend" / "app.js").stat().st_mtime)
    html = html.replace('/frontend/style.css', f'/frontend/style.css?v={css_v}')
    html = html.replace('/frontend/app.js',    f'/frontend/app.js?v={js_v}')
    return html


# ── Briefing default (sidebar) ────────────────────────────────────────────────

@app.get("/api/briefing")
async def get_briefing():
    p = DATA / "briefing_default.json"
    return _read(p) if p.exists() else {}


@app.post("/api/briefing")
async def save_briefing(body: dict):
    Briefing.model_validate(body)
    DATA.mkdir(parents=True, exist_ok=True)
    _write(DATA / "briefing_default.json", body)
    return {"ok": True}


# ── Templates ─────────────────────────────────────────────────────────────────

@app.get("/api/templates")
async def listar_templates():
    return _listar_templates()


@app.get("/api/carrossel/{cid}/template")
async def get_carrossel_template(cid: str):
    _require_pasta(cid)
    return {"template": _carrossel_template(cid)}


@app.post("/api/carrossel/{cid}/template")
async def set_carrossel_template(cid: str, body: dict):
    _require_pasta(cid)
    nome = (body.get("template") or "").strip()
    if not nome or not (TEMPLATES_ROOT / nome / "template.html").exists():
        raise HTTPException(400, f"Template '{nome}' não encontrado")
    (CARROSSEIS / cid / "template.txt").write_text(nome, encoding="utf-8")
    return {"ok": True}


# ── Logos ─────────────────────────────────────────────────────────────────────

@app.post("/api/logo/{handle}")
async def upload_logo(handle: str, file: UploadFile = File(...)):
    handle = handle.strip().lstrip("@").lower()
    if not handle:
        raise HTTPException(400, "Handle vazio")
    LOGOS.mkdir(parents=True, exist_ok=True)
    ext = Path(file.filename or "").suffix.lower()
    if ext not in _LOGO_EXTS:
        raise HTTPException(400, f"Formato não suportado. Use: {', '.join(_LOGO_EXTS)}")
    for old_ext in _LOGO_EXTS:
        old = LOGOS / f"{handle}{old_ext}"
        if old.exists():
            old.unlink()
    destino = LOGOS / f"{handle}{ext}"
    destino.write_bytes(await file.read())
    return {"ok": True, "path": str(destino.relative_to(BASE))}


@app.get("/api/logo/{handle}")
async def get_logo_info(handle: str):
    p = _logo_path_existente(handle)
    return {"existe": p is not None, "nome": p.name if p else None}


@app.get("/api/logo/{handle}/preview")
async def get_logo_preview(handle: str):
    p = _logo_path_existente(handle)
    if not p:
        raise HTTPException(404, "Logo não encontrado")
    mime = _LOGO_MIME.get(p.suffix.lower(), "image/png")
    return Response(content=p.read_bytes(), media_type=mime)


@app.delete("/api/logo/{handle}")
async def remover_logo(handle: str):
    p = _logo_path_existente(handle)
    if p:
        p.unlink()
    return {"ok": True}


# ── Import JSON (único ponto de entrada de conteúdo) ──────────────────────────

@app.post("/api/importar")
async def importar_conteudo(payload: dict):
    """Importa carrosséis prontos via JSON.

    Aceita 2 formatos:
    A) Carrossel único: {ideia, headline?, slides:[...]}
    B) Lote:           {carrosseis:[{ideia, headline?, slides:[...]}, ...]}

    O briefing (marca, paleta, estilo) vem SEMPRE da sidebar — `data/briefing_default.json`.
    Se o JSON trouxer um campo `briefing`, ele é ignorado (mantido só p/ compat).
    """
    briefing_path = DATA / "briefing_default.json"
    if not briefing_path.exists():
        raise HTTPException(400, "Briefing da marca não configurado. Salve o briefing na sidebar antes de importar.")
    briefing = Briefing.model_validate(_read(briefing_path))

    if "carrosseis" in payload:
        items = payload["carrosseis"]
    else:
        items = [{
            "ideia": payload.get("ideia", "Carrossel importado"),
            "headline": payload.get("headline"),
            "slides": payload.get("slides", []),
        }]
    if not items:
        raise HTTPException(400, "Nenhum carrossel para importar")

    cids_criados = []
    for item in items:
        ideia = item.get("ideia") or "Carrossel importado"
        slides_data = item.get("slides")
        if not slides_data:
            raise HTTPException(400, f"Carrossel '{ideia[:60]}' sem campo 'slides'")
        slides_resp = SlidesResponse.model_validate({"slides": slides_data})

        cid = _cid(ideia)
        pasta = CARROSSEIS / cid
        pasta.mkdir(parents=True, exist_ok=True)

        _write(pasta / "briefing.json", briefing.model_dump())
        (pasta / "ideia.txt").write_text(ideia, encoding="utf-8")
        _write(pasta / "slides_texto.json", {"slides": [s.model_dump() for s in slides_resp.slides]})
        _write(pasta / "sugestao_imagens.json", _gerar_sugestao_para_slides(slides_resp.slides, max_imagens=briefing.max_imagens))

        _set_status(cid, "aguardando_imagens")
        cids_criados.append({"cid": cid, "ideia": ideia})

    batch_id = f"batch_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
    _write_batch(batch_id, {
        "id": batch_id, "fase": "aguardando_imagens",
        "carrosseis": cids_criados, "erro": None,
    })
    return {"modo": "lote", "batch_id": batch_id, "total": len(cids_criados)}


# ── Batches: listar/descartar ─────────────────────────────────────────────────

@app.get("/api/batch/ativos")
async def batch_ativos():
    if not BATCHES.exists():
        return []
    ativos = []
    for p in sorted(BATCHES.glob("batch_*.json"), reverse=True):
        try:
            b = json.loads(p.read_text(encoding="utf-8"))
        except Exception:
            continue
        if b.get("fase") in (None, "finalizado"):
            continue
        ativos.append({
            "id": b["id"],
            "fase": b["fase"],
            "total": len(b.get("carrosseis", [])),
            "ideias": [c["ideia"] for c in b.get("carrosseis", [])],
        })
    return ativos


@app.delete("/api/batch/{batch_id}")
async def batch_descartar(batch_id: str):
    p = BATCHES / f"{batch_id}.json"
    if p.exists():
        p.unlink()
    return {"ok": True}


@app.get("/api/batch/{batch_id}/sugestao-imagens")
async def batch_get_sugestao(batch_id: str):
    batch = _read_batch(batch_id)
    result = []
    for item in batch["carrosseis"]:
        sug_path = CARROSSEIS / item["cid"] / "sugestao_imagens.json"
        sp = CARROSSEIS / item["cid"] / "status.json"
        entry = {
            "cid": item["cid"],
            "ideia": item["ideia"],
            "status": _read(sp)["etapa"] if sp.exists() else "desconhecido",
        }
        if sug_path.exists():
            entry["sugestao"] = _read(sug_path)
        result.append(entry)
    return result


# ── Carrossel individual: status, slides, imagens, preview, export ────────────

@app.get("/api/carrossel/{cid}/status")
async def get_status(cid: str):
    p = CARROSSEIS / cid / "status.json"
    if not p.exists():
        raise HTTPException(404, "Carrossel não encontrado")
    return _read(p)


@app.get("/api/carrossel/{cid}/slides")
async def get_slides(cid: str):
    _require_pasta(cid)
    return _require_file(CARROSSEIS / cid / "slides_texto.json", "Slides não encontrados")


@app.get("/api/carrossel/{cid}/sugestao-imagens")
async def get_sugestao(cid: str):
    _require_pasta(cid)
    return _require_file(CARROSSEIS / cid / "sugestao_imagens.json", "Sugestão não disponível")


@app.post("/api/carrossel/{cid}/upload-imagens")
async def upload_imagens(cid: str, files: list[UploadFile] = File(default=[])):
    pasta = _require_pasta(cid)
    briefing = Briefing.model_validate(_read(pasta / "briefing.json"))
    slides = SlidesResponse.model_validate(_read(pasta / "slides_texto.json")).slides
    sugestao_path = pasta / "sugestao_imagens.json"
    sugestao = SugestaoImagens.model_validate(_read(sugestao_path)) if sugestao_path.exists() else None

    imagens: dict[int, str] = {}
    if sugestao and files:
        for i, f in enumerate(files):
            if i < len(sugestao.slides_com_imagem):
                num = sugestao.slides_com_imagem[i].numero
                content = await f.read()
                mt = f.content_type or "image/jpeg"
                imagens[num] = f"data:{mt};base64,{base64.b64encode(content).decode()}"

    logo_data_url = _logo_data_url(briefing.handle)
    template_name = _carrossel_template(cid)
    html = render_carrossel(
        briefing, slides, imagens, sugestao,
        _template_dir(template_name), logo_data_url=logo_data_url,
        carrossel_id=cid,
    )
    (pasta / "slides.html").write_text(html, encoding="utf-8")
    _set_status(cid, "aguardando_exportacao")
    return {"ok": True, "preview_url": f"/api/carrossel/{cid}/preview"}


@app.get("/api/carrossel/{cid}/preview")
async def preview(cid: str):
    p = _require_pasta(cid) / "slides.html"
    if not p.exists():
        raise HTTPException(404, "Preview não disponível — faça upload das imagens primeiro")
    return HTMLResponse(p.read_text(encoding="utf-8"))


@app.post("/api/carrossel/{cid}/exportar")
async def exportar(cid: str, bg: BackgroundTasks):
    pasta = _require_pasta(cid)
    if not (pasta / "slides.html").exists():
        raise HTTPException(400, "Gere o preview antes de exportar")
    briefing = Briefing.model_validate(_read(pasta / "briefing.json"))
    fonte, _ = FONT_PAIRS.get(briefing.estilo_visual, ("Barlow Condensed", ""))
    bg.add_task(_bg_exportar, cid, fonte)
    return {"ok": True}


@app.get("/api/carrossel/{cid}/pngs")
async def get_pngs(cid: str):
    pasta = _require_pasta(cid)
    pngs = sorted(p.name for p in pasta.glob("slide_*.png"))
    return {"pngs": pngs, "total": len(pngs)}


@app.get("/api/carrossel/{cid}/arquivo/{filename}")
async def get_arquivo(cid: str, filename: str):
    p = (_require_pasta(cid) / filename).resolve()
    if not str(p).startswith(str(CARROSSEIS.resolve())):
        raise HTTPException(403, "Acesso negado")
    if not p.is_file():
        raise HTTPException(404)
    return FileResponse(str(p))
