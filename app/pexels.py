import json
from pathlib import Path

import httpx

CONFIG_PATH = Path(__file__).parent.parent / "data" / "config.json"


def _read_config() -> dict:
    if CONFIG_PATH.exists():
        try:
            return json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
        except Exception:
            return {}
    return {}


def _write_config(cfg: dict) -> None:
    CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
    CONFIG_PATH.write_text(json.dumps(cfg, ensure_ascii=False, indent=2), encoding="utf-8")


def get_api_key() -> str:
    return _read_config().get("pexels_api_key", "")


def save_api_key(key: str) -> None:
    cfg = _read_config()
    cfg["pexels_api_key"] = key.strip()
    _write_config(cfg)


async def buscar_fotos(query: str, per_page: int = 3) -> list[dict]:
    key = get_api_key()
    if not key:
        raise ValueError("Chave do Pexels não configurada")
    async with httpx.AsyncClient(timeout=12) as client:
        r = await client.get(
            "https://api.pexels.com/v1/search",
            params={"query": query, "per_page": per_page, "orientation": "portrait"},
            headers={"Authorization": key},
        )
        r.raise_for_status()
        data = r.json()
    return [
        {
            "id": p["id"],
            "thumb": p["src"]["medium"],
            "src": p["src"]["large"],
            "autor": p["photographer"],
        }
        for p in data.get("photos", [])
    ]


async def download_as_base64(url: str) -> str:
    async with httpx.AsyncClient(timeout=20) as client:
        r = await client.get(url)
        r.raise_for_status()
        mt = r.headers.get("content-type", "image/jpeg").split(";")[0]
        import base64
        return f"data:{mt};base64,{base64.b64encode(r.content).decode()}"
