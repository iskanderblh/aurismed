@echo off
rem Sauvegarde la base et les fichiers chiffrés dans le dossier "sauvegardes" (ou celui passé en paramètre).
cd /d "%~dp0.."
node --no-warnings scripts\sauvegarder.mjs %1
pause
