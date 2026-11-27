@echo off
rem Installation d'AurisMED (version locale) : dépendances, moteurs IA, modèles.
rem Double-cliquez sur ce fichier. Les choix de modèles vous sont demandés.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Installer-AurisMED.ps1"
pause
