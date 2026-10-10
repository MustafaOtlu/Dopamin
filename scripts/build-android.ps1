param([switch]$Unoptimized)
$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
$taskTools = Join-Path $taskRoot '.data\android-tools'
$taskJdk = Get-ChildItem -LiteralPath (Join-Path $taskTools 'jdk') -Directory | Select-Object -First 1
if (-not $taskJdk) { throw 'Java 21 bulunamadı. .data/android-tools/jdk içine kur veya Android Studio ile mobile/android projesini aç.' }
$env:JAVA_HOME = $taskJdk.FullName
$env:ANDROID_HOME = Join-Path $taskTools 'sdk'
$env:GRADLE_USER_HOME = Join-Path $taskTools 'gradle'
$taskSocketDir = Join-Path $taskRoot '.data\jtmp'
New-Item -ItemType Directory -Path $taskSocketDir -Force | Out-Null
# Windows AF_UNIX cannot connect through the long AppContainer temp path.
$env:JAVA_OPTS = '-Djdk.net.unixdomain.tmpdir=' + $taskSocketDir
$env:JAVA_TOOL_OPTIONS = $env:JAVA_OPTS
$taskVariant = if ($Unoptimized) { 'debug' } else { 'compact' }
$taskAssemble = if ($Unoptimized) { 'assembleDebug' } else { 'assembleCompact' }
$taskAndroid = Join-Path $taskRoot 'mobile\android'
Set-Content -LiteralPath (Join-Path $taskAndroid 'local.properties') -Value ('sdk.dir=' + $env:ANDROID_HOME.Replace('\', '/')) -Encoding ascii
Push-Location (Join-Path $taskRoot 'mobile')
try { & npx.cmd cap sync android; if ($LASTEXITCODE -ne 0) { throw 'Capacitor sync başarısız' } } finally { Pop-Location }
Push-Location $taskAndroid
try { & .\gradlew.bat --no-daemon "-Dorg.gradle.jvmargs=-Xmx1536m -Djdk.net.unixdomain.tmpdir=$taskSocketDir -Dfile.encoding=UTF-8" $taskAssemble; if ($LASTEXITCODE -ne 0) { throw 'Android build failed' } } finally { Pop-Location }
$taskOutput = Join-Path $taskRoot '.data\releases'
New-Item -ItemType Directory -Path $taskOutput -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $taskAndroid ("app\build\outputs\apk\$taskVariant\app-$taskVariant.apk")) -Destination (Join-Path $taskOutput 'dopamin-debug.apk') -Force
Write-Output (Join-Path $taskOutput 'dopamin-debug.apk')
