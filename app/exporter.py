from pathlib import Path


def exportar_pngs(
    html_path: Path,
    pasta: Path,
    fonte_headline: str = "Barlow Condensed",
) -> list[Path]:
    """
    Abre slides.html com Playwright, captura cada .slide como PNG 1080×1350
    e salva em pasta/slide_01.png … slide_NN.png.

    Retorna lista ordenada dos caminhos gerados.
    """
    from playwright.sync_api import sync_playwright

    pasta.mkdir(parents=True, exist_ok=True)
    url = html_path.as_uri()  # "file:///C:/..." no Windows, "file:///..." no Linux

    pngs: list[Path] = []

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1200, "height": 1400})

        page.goto(url, wait_until="networkidle")

        # Aguarda o ciclo de layout estabilizar antes de checar fontes
        page.wait_for_timeout(2000)
        page.evaluate("() => document.fonts.ready")
        page.wait_for_timeout(2000)

        # Verifica se a fonte condensada carregou; se não, espera mais
        font_ok = page.evaluate(f"""() => {{
            return document.fonts.check('900 48px "{fonte_headline}"') ||
                   document.fonts.check('900 48px {fonte_headline.replace(" ", "")}');
        }}""")
        if not font_ok:
            page.wait_for_timeout(4000)
            page.evaluate("() => document.fonts.ready")

        # Garante que o HTML está em modo tamanho real (não preview)
        page.evaluate("""() => {
            var wrap = document.getElementById('slides-wrap');
            if (wrap) {
                wrap.classList.remove('preview');
                isPreview = false;
            }
        }""")
        page.wait_for_timeout(300)

        slides = page.locator(".slide")
        count = slides.count()

        for i in range(count):
            slide = slides.nth(i)
            slide.scroll_into_view_if_needed()
            page.wait_for_timeout(300)

            out_path = pasta / f"slide_{i + 1:02d}.png"
            slide.screenshot(path=str(out_path))
            pngs.append(out_path)

        browser.close()

    return pngs
