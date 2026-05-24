@echo off
echo === Ticket Analytics Setup ===
echo.

echo [1/3] Installing Python dependencies...
cd /d "%~dp0backend"

:: Try py launcher first (standard Windows install), then python, then python3
where py >nul 2>&1
if not errorlevel 1 (
    py -m pip install -r requirements.txt
    goto pip_done
)
where python >nul 2>&1
if not errorlevel 1 (
    python -m pip install -r requirements.txt
    goto pip_done
)
where python3 >nul 2>&1
if not errorlevel 1 (
    python3 -m pip install -r requirements.txt
    goto pip_done
)
echo ERROR: Python not found. Install Python 3.10+ from https://python.org and ensure "Add to PATH" is checked.
pause
exit /b 1
:pip_done
if errorlevel 1 ( echo ERROR: pip install failed & pause & exit /b 1 )

echo.
echo [2/3] Installing Node dependencies...
cd /d "%~dp0frontend"
npm install
if errorlevel 1 ( echo ERROR: npm install failed & pause & exit /b 1 )

echo.
echo [3/3] Setup complete!
echo.
echo Run start.bat to launch the application.
pause
