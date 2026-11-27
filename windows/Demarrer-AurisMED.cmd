@echo off
rem Démarre AurisMED sur ce poste (http://127.0.0.1:3000) puis ouvre le navigateur.
rem Les moteurs IA locaux (whisper.cpp, Ollama) sont lancés automatiquement par le serveur.
cd /d "%~dp0.."
set NEXT_TELEMETRY_DISABLED=1
if not exist ".next\BUILD_ID" (
  echo AurisMED n'est pas encore installe. Lancez d'abord windows\Installer-AurisMED.cmd
  pause
  exit /b 1
)
echo Demarrage d'AurisMED... Gardez cette fenetre ouverte pendant l'utilisation.
start "" /b powershell -NoProfile -Command "for($i=0;$i -lt 60;$i++){try{Invoke-WebRequest -UseBasicParsing http://127.0.0.1:3000/connexion -TimeoutSec 2 | Out-Null; Start-Process http://127.0.0.1:3000; break}catch{Start-Sleep 1}}"
call npm run start
pause
