# Build APK local en Windows (sin cola de Expo EAS).
# Requiere: Android Studio + SDK. Usa JDK embebido de Android Studio.
#
# Uso desde PowerShell:
#   cd mobile
#   .\scripts\build-apk-local.ps1

$ErrorActionPreference = "Stop"

$sourceRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$shortRoot = "C:\posta\mobile"
$javaHome = "C:\Program Files\Android\Android Studio\jbr"
$androidHome = Join-Path $env:LOCALAPPDATA "Android\Sdk"
$apkOut = Join-Path $shortRoot "android\app\build\outputs\apk\release\app-release.apk"

if (-not (Test-Path $javaHome)) {
  throw "No se encontro Android Studio JBR en: $javaHome"
}
if (-not (Test-Path $androidHome)) {
  throw "No se encontro Android SDK en: $androidHome"
}

Write-Host ">> Copiando proyecto a ruta corta ($shortRoot)..."
New-Item -ItemType Directory -Path (Split-Path $shortRoot) -Force | Out-Null
robocopy $sourceRoot $shortRoot /MIR /XD android\.gradle android\app\.cxx android\app\build android\build .expo | Out-Null

$env:JAVA_HOME = $javaHome
$env:ANDROID_HOME = $androidHome
$env:NODE_ENV = "production"
$env:PATH = "$javaHome\bin;$androidHome\platform-tools;$env:PATH"

Write-Host ">> Instalando dependencias npm..."
Push-Location $shortRoot
try {
  npm install --omit=dev
} finally {
  Pop-Location
}

Write-Host ">> Sincronizando version nativa desde app.json (expo prebuild)..."
Push-Location $shortRoot
try {
  npx expo prebuild --platform android --no-install
} finally {
  Pop-Location
}

Push-Location (Join-Path $shortRoot "android")
try {
  Write-Host ">> Compilando APK release (5-10 min la primera vez)..."
  .\gradlew assembleRelease --no-daemon
} finally {
  Pop-Location
}

if (-not (Test-Path $apkOut)) {
  throw "No se genero el APK en $apkOut"
}

Write-Host ">> Publicando en backend/downloads..."
Push-Location $sourceRoot
node scripts/save-apk-to-backend.mjs --url $apkOut @args
Pop-Location

Write-Host ">> Listo: $apkOut"
