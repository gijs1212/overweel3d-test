@echo off
title Overweel3D Bambu VM-agent
cd /d C:\Overweel3D

set "PYTHON_EXE=C:\Program Files\Python314\python.exe"
if not exist "%PYTHON_EXE%" set "PYTHON_EXE=C:\Program Files\Python3.14\python.exe"
if not exist "%PYTHON_EXE%" set "PYTHON_EXE=C:\Users\TEMP.test.000\AppData\Local\Python\bin\python.exe"
if not exist "%PYTHON_EXE%" set "PYTHON_EXE=py.exe"

"%PYTHON_EXE%" -c "import pywinauto" >nul 2>&1
if errorlevel 1 (
  echo Vereiste Python-pakketten worden eenmalig geinstalleerd...
  "%PYTHON_EXE%" -m pip install -r "C:\Overweel3D\requirements-vm.txt"
  if errorlevel 1 (
    echo Installatie van de Python-pakketten is mislukt.
    pause
    exit /b 1
  )
)

"%PYTHON_EXE%" "C:\Overweel3D\bambu_vm_guest.py" --agent --config "C:\Overweel3D\vm-guest.json"
echo.
echo De Overweel3D VM-agent is onverwacht gestopt. Controleer de fout hierboven.
pause
