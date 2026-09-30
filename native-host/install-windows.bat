@echo off
rem Installe l'application locale + l'extension Chrome YT2PR (Windows). Necessite Node.js.
setlocal
set SRC=%~dp0..
set HOMEDIR=%USERPROFILE%\.yt2pr
set EXTID=mnmnoaepdpcgjmjaiokncppgafgapeih

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js est requis. Installez-le depuis https://nodejs.org puis relancez ce script.
  pause & exit /b 1
)
for /f "delims=" %%i in ('where node') do set NODE=%%i & goto :found
:found

mkdir "%HOMEDIR%\host" 2>nul
if exist "%HOMEDIR%\chrome-extension" rmdir /s /q "%HOMEDIR%\chrome-extension"
xcopy /e /i /y "%SRC%\chrome-extension" "%HOMEDIR%\chrome-extension" >nul
copy /y "%SRC%\native-host\host.js" "%HOMEDIR%\host\" >nul
copy /y "%SRC%\js\core.js" "%HOMEDIR%\host\" >nul
copy /y "%SRC%\js\updater.js" "%HOMEDIR%\host\" >nul

> "%HOMEDIR%\host\host.bat" echo @echo off
>> "%HOMEDIR%\host\host.bat" echo "%NODE%" "%HOMEDIR%\host\host.js"

set HOSTPATH=%HOMEDIR%\host\host.bat
set JSONPATH=%HOMEDIR%\host\com.yt2pr.host.json
set HOSTPATH_ESC=%HOSTPATH:\=\\%
> "%JSONPATH%" echo {"name":"com.yt2pr.host","description":"YT2PR","path":"%HOSTPATH_ESC%","type":"stdio","allowed_origins":["chrome-extension://%EXTID%/"]}
for %%k in ("Google\Chrome" "Chromium" "BraveSoftware\Brave-Browser" "Microsoft\Edge") do reg add "HKCU\Software\%%~k\NativeMessagingHosts\com.yt2pr.host" /ve /t REG_SZ /d "%JSONPATH%" /f >nul

echo OK. Derniere etape :
echo   1. Dans Chrome, ouvrez chrome://extensions et activez "Mode developpeur".
echo   2. "Charger l'extension non empaquetee" et choisissez : %HOMEDIR%\chrome-extension
pause
