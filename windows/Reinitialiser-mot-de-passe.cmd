@echo off
rem Réinitialise le mot de passe d'un compte AurisMED de ce poste.
cd /d "%~dp0.."
node --no-warnings scripts\reinitialiser-mot-de-passe.mjs
pause
