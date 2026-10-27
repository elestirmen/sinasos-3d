@echo off
chcp 65001 >nul
title Mustafapasa Drone (internet)
cd /d "%~dp0"

set PY=
python --version >nul 2>nul && set PY=python
if not defined PY py --version >nul 2>nul && set PY=py
if not defined PY (
  echo Python bulunamadi.
  echo https://www.python.org/downloads/ adresinden kurup "Add python.exe to PATH" secenegini isaretleyin.
  pause
  exit /b 1
)

echo Oyun Tailscale Funnel ile internete aciliyor. Yalniz oyun dosyalari verilir.
echo Kapatmak icin bu pencereyi kapat: oyun da Funnel da kapanir.
echo.
%PY% sunucu.py --funnel
pause
