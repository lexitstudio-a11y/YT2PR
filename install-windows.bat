@echo off
rem Installe le panneau YT2PR pour Premiere Pro (Windows).
set DEST=%APPDATA%\Adobe\CEP\extensions\com.yt2pr.panel
if exist "%DEST%" rmdir /s /q "%DEST%"
mkdir "%DEST%"
xcopy /e /i /y "%~dp0CSXS" "%DEST%\CSXS" >nul
xcopy /e /i /y "%~dp0js" "%DEST%\js" >nul
xcopy /e /i /y "%~dp0jsx" "%DEST%\jsx" >nul
xcopy /e /i /y "%~dp0css" "%DEST%\css" >nul
copy /y "%~dp0index.html" "%DEST%\" >nul
for %%v in (9 10 11 12) do reg add "HKCU\Software\Adobe\CSXS.%%v" /v PlayerDebugMode /t REG_SZ /d 1 /f >nul
echo OK. Redemarrez Premiere Pro puis : Fenetre ^> Extensions ^> YT2PR
pause
