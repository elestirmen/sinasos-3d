@echo off
chcp 65001 >nul
title Mustafapasa Drone
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

%PY% sunucu.py 8000
pause
