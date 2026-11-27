# =============================================================================
# AurisMED (version locale) - installation sur Windows 10/11
# Lancé par Installer-AurisMED.cmd. Rien n'est envoyé en ligne : les seuls
# téléchargements sont les programmes et les modèles d'IA que vous choisissez.
# =============================================================================
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root
$Engines = Join-Path $Root "moteurs"
$WhisperDir = Join-Path $Engines "whisper"
$ModelsDir = Join-Path $Engines "modeles-whisper"
$env:NEXT_TELEMETRY_DISABLED = "1"

function Title($t) { Write-Host ""; Write-Host "=== $t ===" -ForegroundColor Cyan }
function Info($t) { Write-Host "  $t" }
function Warn($t) { Write-Host "  ATTENTION : $t" -ForegroundColor Yellow }
function Fail($t) { Write-Host "  ERREUR : $t" -ForegroundColor Red; exit 1 }
function AskYesNo($q, $default = $true) {
  $suffix = if ($default) { "[O/n]" } else { "[o/N]" }
  $a = Read-Host "  $q $suffix"
  if ([string]::IsNullOrWhiteSpace($a)) { return $default }
  return $a.Trim().ToLower().StartsWith("o")
}
function Choose($question, $options, $recommended) {
  for ($i = 0; $i -lt $options.Count; $i++) {
    $mark = if ($i + 1 -eq $recommended) { "  (recommandé pour ce poste)" } else { "" }
    Write-Host ("  {0}. {1}{2}" -f ($i + 1), $options[$i].Label, $mark)
  }
  Write-Host "  0. Ne rien télécharger pour l'instant"
  while ($true) {
    $a = Read-Host "  $question [$recommended]"
    if ([string]::IsNullOrWhiteSpace($a)) { return $recommended }
    $n = 0
    if ([int]::TryParse($a, [ref]$n) -and $n -ge 0 -and $n -le $options.Count) { return $n }
  }
}
function HasWinget { return [bool](Get-Command winget -ErrorAction SilentlyContinue) }
function Download($url, $dest) {
  Info "Téléchargement : $url"
  & curl.exe -L --fail --retry 3 -o $dest $url
  if ($LASTEXITCODE -ne 0) { Fail "téléchargement impossible ($url)." }
}

# -----------------------------------------------------------------------------
Title "1. Vérification du poste"
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
  Warn "Node.js n'est pas installé."
  if ((HasWinget) -and (AskYesNo "Installer Node.js 22 LTS avec winget ?")) {
    winget install -e --id OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
    Info "Fermez cette fenêtre puis relancez Installer-AurisMED.cmd."
  } else {
    Info "Installez Node.js 22 LTS depuis https://nodejs.org puis relancez Installer-AurisMED.cmd."
  }
  exit 1
}
$nodeVersion = [version]((node -v).TrimStart("v"))
if ($nodeVersion -lt [version]"22.13.0") {
  Fail "Node.js $nodeVersion est trop ancien : version 22.13 ou plus récente requise (winget upgrade OpenJS.NodeJS.LTS)."
}
Info "Node.js $nodeVersion"

$ramGb = [math]::Round((Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory / 1GB)
$cpu = (Get-CimInstance Win32_Processor | Select-Object -First 1).Name
$nvidia = $null
try { $nvidia = (& nvidia-smi --query-gpu=name,memory.total --format=csv,noheader,nounits 2>$null | Select-Object -First 1) } catch { }
$vramGb = 0
if ($nvidia) { $vramGb = [math]::Round([double]($nvidia.Split(",")[1].Trim()) / 1024) }
$drive = (Get-Item $Root).PSDrive
$freeGb = [math]::Round((Get-PSDrive $drive.Name).Free / 1GB, 1)
Info "Processeur : $cpu"
Info "Mémoire : $ramGb Go"
Info ("Carte graphique NVIDIA : " + $(if ($nvidia) { "$nvidia" } else { "aucune détectée" }))
Info "Espace libre sur le disque $($drive.Name) : $freeGb Go"
if ($freeGb -lt 10) {
  Warn "moins de 10 Go libres. Libérez de l'espace (Nettoyage de disque, dossier Téléchargements) avant de continuer."
  if (-not (AskYesNo "Continuer quand même ?" $false)) { exit 1 }
}

# -----------------------------------------------------------------------------
Title "2. Application AurisMED"
Info "Installation des dépendances (npm ci)..."
& npm ci --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { Fail "npm ci a échoué." }
& npx next telemetry disable | Out-Null
Info "Construction de l'application (npm run build)..."
& npm run build
if ($LASTEXITCODE -ne 0) { Fail "la construction a échoué." }

# -----------------------------------------------------------------------------
Title "3. Transcription locale (whisper.cpp)"
New-Item -ItemType Directory -Force -Path $WhisperDir, $ModelsDir | Out-Null
$serverExe = Get-ChildItem $WhisperDir -Recurse -Filter "whisper-server.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
if ($serverExe -and -not (AskYesNo "whisper.cpp est déjà installé. Le réinstaller ?" $false)) {
  Info "whisper.cpp conservé."
} else {
  $release = Invoke-RestMethod "https://api.github.com/repos/ggml-org/whisper.cpp/releases/latest" -Headers @{ "User-Agent" = "AurisMED-installer" }
  $pattern = if ($nvidia) { "^whisper-cublas-12.*-bin-x64\.zip$" } else { "^whisper-bin-x64\.zip$" }
  $asset = $release.assets | Where-Object { $_.name -match $pattern } | Select-Object -First 1
  if (-not $asset) { $asset = $release.assets | Where-Object { $_.name -eq "whisper-bin-x64.zip" } | Select-Object -First 1 }
  if (-not $asset) { Fail "archive Windows de whisper.cpp introuvable dans la version $($release.tag_name)." }
  $zip = Join-Path $env:TEMP $asset.name
  Download $asset.browser_download_url $zip
  Remove-Item -Recurse -Force (Join-Path $WhisperDir "*") -ErrorAction SilentlyContinue
  Expand-Archive -Path $zip -DestinationPath $WhisperDir -Force
  Remove-Item $zip -Force
  $serverExe = Get-ChildItem $WhisperDir -Recurse -Filter "whisper-server.exe" | Select-Object -First 1
  if (-not $serverExe) { Fail "whisper-server.exe absent de l'archive $($asset.name)." }
  # Programme et DLL au premier niveau du dossier moteurs\whisper.
  if ($serverExe.DirectoryName -ne $WhisperDir) {
    Get-ChildItem $serverExe.DirectoryName | Move-Item -Destination $WhisperDir -Force
  }
  Info "whisper.cpp $($release.tag_name) installé ($($asset.name))."
}

$whisperModels = @(
  @{ File = "ggml-small.bin"; Label = "small : environ 0,5 Go, pour 8 Go de mémoire, qualité correcte" },
  @{ File = "ggml-large-v3-turbo-q5_0.bin"; Label = "large-v3-turbo quantifié : environ 0,6 Go, meilleure qualité, 16 Go de mémoire conseillés" },
  @{ File = "ggml-large-v3-turbo.bin"; Label = "large-v3-turbo complet : environ 1,6 Go, avec carte graphique NVIDIA" }
)
$recW = if ($nvidia -and $vramGb -ge 6) { 3 } elseif ($ramGb -ge 16) { 2 } else { 1 }
$existing = Get-ChildItem $ModelsDir -Filter "ggml-*.bin" -ErrorAction SilentlyContinue
if ($existing) { Info ("Modèles déjà présents : " + (($existing | ForEach-Object Name) -join ", ")) }
$c = Choose "Modèle de transcription à télécharger" $whisperModels $recW
$WhisperChoice = $null
if ($c -gt 0) {
  $WhisperChoice = $whisperModels[$c - 1].File
  $dest = Join-Path $ModelsDir $WhisperChoice
  if (Test-Path $dest) { Info "$WhisperChoice déjà présent." }
  else { Download "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/$WhisperChoice" $dest }
}

# -----------------------------------------------------------------------------
Title "4. Analyse médicale locale (Ollama)"
$ollama = Get-Command ollama -ErrorAction SilentlyContinue
$ollamaExe = if ($ollama) { $ollama.Source } else { Join-Path $env:LOCALAPPDATA "Programs\Ollama\ollama.exe" }
if (-not (Test-Path $ollamaExe)) {
  if ((HasWinget) -and (AskYesNo "Ollama n'est pas installé. L'installer avec winget ?")) {
    winget install -e --id Ollama.Ollama --accept-package-agreements --accept-source-agreements
  }
  if (-not (Test-Path $ollamaExe)) { Fail "Ollama introuvable. Installez-le depuis https://ollama.com/download puis relancez ce script." }
}
Info "Ollama : $ollamaExe"
$env:OLLAMA_HOST = "127.0.0.1:11434"
$up = $false
try { Invoke-RestMethod "http://127.0.0.1:11434/api/version" -TimeoutSec 2 | Out-Null; $up = $true } catch { }
if (-not $up) {
  Start-Process -FilePath $ollamaExe -ArgumentList "serve" -WindowStyle Hidden
  for ($i = 0; $i -lt 30 -and -not $up; $i++) {
    Start-Sleep 1
    try { Invoke-RestMethod "http://127.0.0.1:11434/api/version" -TimeoutSec 2 | Out-Null; $up = $true } catch { }
  }
}
if (-not $up) { Fail "Ollama ne démarre pas." }

$ollamaModels = @(
  @{ Name = "qwen2.5:3b"; Label = "qwen2.5:3b : environ 2 Go, pour 8 Go de mémoire, analyse plus approximative" },
  @{ Name = "qwen2.5:7b"; Label = "qwen2.5:7b : environ 4,7 Go, 16 Go de mémoire conseillés" },
  @{ Name = "qwen2.5:14b"; Label = "qwen2.5:14b : environ 9 Go, carte graphique de 12 Go ou plus conseillée" }
)
$recO = if ($nvidia -and $vramGb -ge 12) { 3 } elseif ($ramGb -ge 16) { 2 } else { 1 }
$c = Choose "Modèle d'analyse à télécharger" $ollamaModels $recO
$OllamaChoice = $null
if ($c -gt 0) {
  $OllamaChoice = $ollamaModels[$c - 1].Name
  & $ollamaExe pull $OllamaChoice
  if ($LASTEXITCODE -ne 0) { Fail "téléchargement du modèle $OllamaChoice impossible." }
}

# -----------------------------------------------------------------------------
Title "5. Configuration"
$envFile = Join-Path $Root ".env.local"
$lines = @()
if (Test-Path $envFile) {
  $lines = Get-Content $envFile | Where-Object { $_ -notmatch "^(WHISPER_MODEL|OLLAMA_MODEL)=" }
  if ($lines -match "OPENAI_API_KEY|SUPABASE") {
    Warn ".env.local contient d'anciennes variables (OpenAI, Supabase) qui ne sont plus utilisées : vous pouvez les supprimer."
  }
}
if ($WhisperChoice) { $lines += "WHISPER_MODEL=$WhisperChoice" }
if ($OllamaChoice) { $lines += "OLLAMA_MODEL=$OllamaChoice" }
Set-Content -Path $envFile -Value $lines -Encoding UTF8
Info "Modèles par défaut enregistrés dans .env.local (modifiables dans Paramètres > Moteur IA local)."

if (AskYesNo "Créer un raccourci « AurisMED » sur le Bureau ?") {
  $shell = New-Object -ComObject WScript.Shell
  $lnk = $shell.CreateShortcut((Join-Path ([Environment]::GetFolderPath("Desktop")) "AurisMED.lnk"))
  $lnk.TargetPath = Join-Path $PSScriptRoot "Demarrer-AurisMED.cmd"
  $lnk.WorkingDirectory = $Root
  $lnk.Save()
}

Title "Installation terminée"
Info "Démarrez AurisMED avec windows\Demarrer-AurisMED.cmd (ou le raccourci du Bureau)."
Info "Au premier lancement, créez le compte du médecin dans le navigateur."
Info "Pensez à sauvegarder la clé data\cle\aurismed.key sur un support séparé après le premier lancement."
