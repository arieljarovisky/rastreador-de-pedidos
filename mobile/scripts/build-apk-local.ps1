# Build APK local en Windows (sin cola de Expo EAS).
# Requiere: Android Studio + SDK. Usa JDK embebido de Android Studio.
#
# ATENCION: el release local firma con debug.keystore (ver android/app/build.gradle).
# Si los usuarios ya tienen Posta instalada desde un APK de EAS, Android mostrara
# "conflicto de paquete" al actualizar. Para produccion usa:
#   npm run build:apk && npm run save:apk
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
$androidDir = Join-Path $shortRoot "android"

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

# Refuerza memoria JVM (prebuild puede dejar valores bajos)
$gradleProps = Join-Path $androidDir "gradle.properties"
if (Test-Path $gradleProps) {
  $lines = Get-Content $gradleProps
  $out = @()
  $hasJvm = $false
  foreach ($line in $lines) {
    if ($line -match '^\s*org\.gradle\.jvmargs=') {
      $out += 'org.gradle.jvmargs=-Xmx4096m -XX:MaxMetaspaceSize=1024m -XX:+HeapDumpOnOutOfMemoryError -Dfile.encoding=UTF-8'
      $hasJvm = $true
    } else {
      $out += $line
    }
  }
  if (-not $hasJvm) {
    $out += 'org.gradle.jvmargs=-Xmx4096m -XX:MaxMetaspaceSize=1024m -XX:+HeapDumpOnOutOfMemoryError -Dfile.encoding=UTF-8'
  }
  Set-Content -Path $gradleProps -Value $out
}

Push-Location $androidDir
try {
  Write-Host ">> Deteniendo daemons Gradle previos..."
  .\gradlew --stop 2>$null

  Write-Host ">> Compilando APK release (sin lint vital, evita Metaspace)..."
  # -x lint*: el analisis Lint de release suele reventar por Metaspace en Windows
  .\gradlew assembleRelease --no-daemon -x lint -x lintVitalAnalyzeRelease -x lintVitalReportRelease -x lintVitalRelease
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
