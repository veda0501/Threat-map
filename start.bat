@echo off
echo ========================================
echo   Global Threat Mapping Platform
echo ========================================
echo.

REM Check if node_modules exists
if not exist "node_modules" (
    echo [STEP 1/4] Installing dependencies...
    call npm install
    echo.
) else (
    echo [STEP 1/4] Dependencies already installed ✓
    echo.
)

REM Check if .env exists
if not exist ".env" (
    echo [STEP 2/4] Creating .env file...
    copy .env.example .env
    echo.
    echo ⚠ NOTE: .env created with default values
    echo   You can add your API keys later in the .env file
    echo.
) else (
    echo [STEP 2/4] .env file exists ✓
    echo.
)

echo [STEP 3/4] Checking MongoDB...
echo   MongoDB is optional - system will use in-memory storage if not available
echo.

echo [STEP 4/4] Starting server...
echo.
echo ========================================
echo   Server will start on port 3000
echo   Open: http://localhost:3000
echo ========================================
echo.
echo Press Ctrl+C to stop the server
echo.

call npm start
