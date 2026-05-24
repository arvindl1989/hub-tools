@echo off
echo === Ticket Analytics ===
echo.

echo Starting backend on http://localhost:8000 ...
start "TicketIQ Backend" cmd /k "cd /d "%~dp0backend" && (where py >nul 2>&1 && py -m uvicorn main:app --reload --port 8000) || (where python >nul 2>&1 && python -m uvicorn main:app --reload --port 8000) || python3 -m uvicorn main:app --reload --port 8000"

timeout /t 2 /nobreak >nul

echo Starting frontend on http://localhost:5173 ...
start "TicketIQ Frontend" cmd /k "cd /d "%~dp0frontend" && npm run dev"

timeout /t 3 /nobreak >nul

echo.
echo App running at http://localhost:5173
echo API docs at  http://localhost:8000/docs
echo.
echo Close the two console windows to stop the servers.
pause
