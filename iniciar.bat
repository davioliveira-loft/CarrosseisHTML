@echo off
cd /d "%~dp0"
title Content Machine

echo.
echo  =========================================
echo   Content Machine — iniciando...
echo  =========================================
echo.

:: Cria venv e instala dependencias na primeira execucao
if not exist venv (
    echo  [1/3] Criando ambiente virtual...
    python -m venv venv
    if errorlevel 1 (
        echo  ERRO: Python nao encontrado. Instale Python 3.11+ e tente novamente.
        pause & exit /b 1
    )

    echo  [2/3] Instalando dependencias...
    call venv\Scripts\activate
    pip install -r requirements.txt --quiet
    if errorlevel 1 (
        echo  ERRO: Falha ao instalar dependencias.
        pause & exit /b 1
    )

    echo  [3/3] Instalando Chromium para exportacao de PNGs...
    playwright install chromium
    echo.
    echo  Setup concluido!
) else (
    call venv\Scripts\activate
)

echo  Abrindo navegador em http://localhost:8000 ...
echo  (pressione Ctrl+C para encerrar)
echo.

:: Abre o navegador apos 2 segundos
start /min "" cmd /c "timeout /t 2 /nobreak > nul && start http://localhost:8000"

:: Inicia o servidor
uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload

pause
