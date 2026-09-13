@echo off
title Overweel3D willekeurige printtest
cd /d C:\Overweel3D

set "PYTHON_EXE=C:\Users\TEMP.test\AppData\Local\Python\bin\python.exe"
if not exist "%PYTHON_EXE%" set "PYTHON_EXE=py.exe"

"%PYTHON_EXE%" "C:\Overweel3D\test_random_printer_file.py" --config "C:\Overweel3D\vm-guest.json" %*
echo.
pause
