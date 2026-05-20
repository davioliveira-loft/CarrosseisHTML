from typing import Literal
from pydantic import BaseModel, field_validator


class Briefing(BaseModel):
    marca: str
    handle: str
    cor_primaria: str                       # hex, ex: "#E8421A"
    cor_destaque: str | None = None         # acento secundário
    cor_fundo: str | None = None            # paper/cream/light
    cor_tinta: str | None = None            # ink/dark text
    estilo_visual: Literal["classico", "moderno", "minimalista", "bold"] = "moderno"
    max_imagens: int = 6                    # teto de imagens por carrossel (incluindo capa)

    @field_validator("cor_primaria", "cor_destaque", "cor_fundo", "cor_tinta")
    @classmethod
    def cor_deve_ser_hex(cls, v):
        if v is None or v == "":
            return None
        v = v.strip()
        if not v.startswith("#"):
            v = f"#{v}"
        if len(v) not in (4, 7):
            raise ValueError(f"Cor inválida: '{v}'. Use formato hex (#RRGGBB).")
        return v.upper()


class Headline(BaseModel):
    numero: int
    texto: str
    gatilhos: str   # "Gatilho1 · Gatilho2"


class SlideTexto(BaseModel):
    numero: int
    tipo: Literal["capa", "dark", "light", "grad", "cta"]
    tag: str | None = None

    # Capa
    headline_capa: str | None = None

    # Slides internos
    headline_interna: str | None = None
    bloco1: str | None = None
    bloco2: str | None = None

    # CTA
    frase_ponte: str | None = None
    cta_headline: str | None = None
    cta_keyword: str | None = None
    cta_beneficio: str | None = None

    # Pexels
    busca_pexels: str | None = None


class HeadlinesResponse(BaseModel):
    triagem_resumo: str
    eixo: str
    funil: str
    headlines: list[Headline]


class SlidesResponse(BaseModel):
    slides: list[SlideTexto]


class ImagemSugerida(BaseModel):
    numero: int
    tipo_imagem: Literal["full-bleed", "background-overlay", "img-box"]
    descricao_sugestao: str
    obrigatorio: bool = False


class SugestaoImagens(BaseModel):
    total_imagens_sugeridas: int
    slides_com_imagem: list[ImagemSugerida]
