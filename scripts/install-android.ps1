$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
$taskAdb = Join-Path $taskRoot '.data\android-tools\sdk\platform-tools\adb.exe'
$taskApk = Join-Path $taskRoot '.data\releases\dopamin-debug.apk'
if (-not (Test-Path -LiteralPath $taskApk)) { throw 'Önce scripts/build-android.ps1 ile APK üret.' }
& $taskAdb devices
& $taskAdb reverse tcp:3000 tcp:3000
if ($LASTEXITCODE -ne 0) { throw 'USB ile bağlı ve USB hata ayıklaması onaylanmış tek bir Android cihazı gerekiyor.' }
& $taskAdb install -r $taskApk
if ($LASTEXITCODE -ne 0) { throw 'APK kurulamadı.' }
& $taskAdb shell am start -n app.dopamin.student/.MainActivity
