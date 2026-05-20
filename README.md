# Content Machine

Gerador local de carrosséis para Instagram. Você cola um JSON com o conteúdo dos slides e o sistema renderiza, faz preview e exporta PNGs 1080×1350 prontos para postar.

## Requisitos

- Python 3.11 ou superior
- Windows / macOS / Linux

## Instalação e uso

### 1. Inicie o sistema

Dê duplo clique em **`iniciar.bat`** (ou rode `uvicorn app.main:app --reload` manualmente).

Na primeira execução ele cria o ambiente virtual, instala as dependências e o Chromium do Playwright. Leva alguns minutos.

O navegador abrirá automaticamente em `http://localhost:8000`.

### 2. Configure o briefing da marca

No painel lateral, abra **Briefing da Marca** e preencha:
- Marca, @ Instagram, logo (opcional)
- Nicho
- **Paleta de cores**: primária (obrigatória) + destaque/fundo/tinta (opcionais). Há presets prontos (Italiano, Brutal Amarelo, Editorial Creme)
- Estilo visual, tipo de carrossel, CTA, nº de slides

Clique em **Salvar briefing**. Esse briefing fica salvo como padrão para futuras importações.

### 3. Importe um JSON

Clique em **↥ Importar JSON** na sidebar ou na tela inicial.

O JSON pode conter um único carrossel ou vários em lote. Se não incluir um campo `briefing`, o sistema usa o que estiver configurado no painel.

Para gerar JSONs com ChatGPT/Claude/Gemini, use o prompt pronto em [`data/prompt_gerar_json_idiomas.md`](data/prompt_gerar_json_idiomas.md). Há também um exemplo completo em [`data/exemplo_5_italiano.json`](data/exemplo_5_italiano.json).

### 4. Para cada carrossel

| Passo | O que fazer |
|-------|-------------|
| 1 | Escolher um dos templates: **alternado-claro-escuro**, **editorial-serif** ou **neo-brutalismo** |
| 2 | Arrastar imagens na ordem sugerida (ou clicar em "Sem imagens" para fundo sólido) |
| 3 | Clicar **Gerar preview** — renderiza o HTML |
| 4 | Clicar **⬇ Exportar PNGs** — Playwright captura cada slide |

PNGs são salvos em `carrosseis/YYYY-MM-DD_slug/slide_01.png`, etc.

## Formato do JSON

### Carrossel único

```json
{
  "briefing": { "marca": "...", "handle": "...", "nicho": "...", "cor_primaria": "#E8421A", "estilo_visual": "moderno", "tipo_carrossel": "tendencia", "cta": "Comenta GUIA", "num_slides": 9 },
  "ideia": "Frase curta descrevendo o tema",
  "slides": [
    { "numero": 1, "tipo": "capa", "headline_capa": "..." },
    { "numero": 2, "tipo": "dark", "tag": "...", "bloco1": "...", "bloco2": "..." },
    ...
    { "numero": 9, "tipo": "cta", "frase_ponte": "...", "cta_headline": "BAIXE O GUIA", "cta_keyword": "GUIA", "cta_beneficio": "..." }
  ]
}
```

### Lote (vários carrosséis)

```json
{
  "briefing": { ... },
  "carrosseis": [
    { "ideia": "...", "slides": [ ... ] },
    { "ideia": "...", "slides": [ ... ] }
  ]
}
```

Tipos de slide: `capa`, `dark`, `light`, `grad`, `cta`. Use `<strong>palavra</strong>` no texto para destacar termos.

## Templates

Cada template tem visual completamente diferente:

| Template | Estilo |
|----------|--------|
| `alternado-claro-escuro` | Padrão. Alterna slides escuros e claros com badge da marca. |
| `editorial-serif` | Magazine. Tipografia serif (Playfair), tons creme, numeração romana. |
| `neo-brutalismo` | Bordas pretas grossas, sombras duras, accent amarelo, "ARRASTA →". |

Para trocar de template em um carrossel já importado, use o seletor 🎨 no card.

## Fontes (opcional mas recomendado)

Para exportar PNGs com a tipografia exata, adicione os arquivos `.woff2` em:

```
templates/<nome-do-template>/fonts/
```

Arquivos esperados por estilo:

| Arquivo | Usado em |
|---------|----------|
| `barlow-condensed-900.woff2` | Estilo Moderno (headline) |
| `plus-jakarta-sans-{400,700,800}.woff2` | Body |
| `playfair-display-900.woff2` | Estilo Clássico (headline) |
| `dm-sans-400.woff2` | Estilo Clássico (body) |
| `space-grotesk-{400,800}.woff2` | Estilo Bold |

Obtenha os arquivos via `@fontsource/*` no npm ou pelo Google Fonts. Sem eles, o sistema cai no fallback do navegador — o layout continua correto, apenas a tipografia muda.

## Estrutura de pastas

```
content-machine/
├── iniciar.bat          ← ponto de entrada (Windows)
├── app/                 ← backend Python (FastAPI)
│   ├── main.py          ← rotas
│   ├── models.py        ← schemas Pydantic
│   ├── template_engine.py
│   └── exporter.py      ← Playwright → PNG
├── templates/           ← HTMLs Jinja2 (um por template visual)
├── frontend/            ← interface web (HTML + JS + CSS, sem build)
├── data/                ← briefing padrão, exemplo de JSON, prompt
└── carrosseis/          ← saída: JSONs + HTML + PNGs por carrossel
```

## Sem chaves de API

Esta versão é 100% local — não chama IA externa nem precisa de chave. O conteúdo dos slides vem do JSON que você importa (que pode ter sido gerado por qualquer LLM — ChatGPT, Claude, Gemini — usando o prompt em `data/`).
