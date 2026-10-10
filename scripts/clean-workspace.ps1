[CmdletBinding(SupportsShouldProcess)]
param()
$ErrorActionPreference = 'Stop'
$taskRoot = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$taskPrefix = $taskRoot.TrimEnd('\') + '\'
# A running E2E server may own these databases or its Next cache.
if (Get-NetTCPConnection -LocalPort 3001 -State Listen -ErrorAction SilentlyContinue) {
    throw '3001 portundaki test sunucusunu kapattiktan sonra temizligi yeniden calistir.'
}
$taskTargets = [Collections.Generic.List[string]]::new()
$taskData = Join-Path $taskRoot '.data'
if (Test-Path -LiteralPath $taskData) {
    Get-ChildItem -LiteralPath $taskData -Directory | Where-Object {
        $_.Name -match '^e2e-(?:manual|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$'
    } | ForEach-Object { $taskTargets.Add($_.FullName) }
}
@('.next-e2e', '.next-teacher', '.data\cache-backups\next-before-teacher-refresh') | ForEach-Object {
    $taskTargets.Add((Join-Path $taskRoot $_))
}
# Archives are expendable only when their unpacked tools are present.
if (Test-Path -LiteralPath (Join-Path $taskData 'android-tools\jdk') -PathType Container) {
    $taskTargets.Add((Join-Path $taskData 'android-tools\jdk.zip'))
}
if (Test-Path -LiteralPath (Join-Path $taskData 'android-tools\command-tools\cmdline-tools') -PathType Container) {
    $taskTargets.Add((Join-Path $taskData 'android-tools\command-tools.zip'))
}
$taskBytes = [long]0
$taskCount = 0
foreach ($taskTarget in $taskTargets) {
    $taskAbsolute = [IO.Path]::GetFullPath($taskTarget)
    if (-not $taskAbsolute.StartsWith($taskPrefix, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Proje disindaki yol reddedildi: $taskAbsolute"
    }
    if (-not (Test-Path -LiteralPath $taskAbsolute)) { continue }
    $taskItem = Get-Item -LiteralPath $taskAbsolute -Force
    if ($taskItem.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw "Baglanti yolu reddedildi: $taskAbsolute" }
    $taskChildren = if ($taskItem.PSIsContainer) { @(Get-ChildItem -LiteralPath $taskAbsolute -Recurse -Force) } else { @($taskItem) }
    $taskLinks = @($taskChildren | Where-Object { $_.Attributes -band [IO.FileAttributes]::ReparsePoint })
    if ($taskLinks.Count -gt 0 -and $taskAbsolute -notmatch "\\(?:\.next-e2e|\.next-teacher|next-before-teacher-refresh)$") { throw "Beklenmeyen baglanti: $taskAbsolute" }
    $taskSize = [long](($taskChildren | Where-Object { -not $_.PSIsContainer } | Measure-Object -Property Length -Sum).Sum)
    if ($PSCmdlet.ShouldProcess($taskAbsolute, 'Remove generated test/build/installer artifacts')) {
        # Next creates dependency junctions. Delete the link itself without recursion first.
        foreach ($taskLink in $taskLinks) {
            if (-not $taskLink.FullName.StartsWith($taskAbsolute + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Baglanti hedef disinda.' }
            $taskLink.Delete()
        }
        Remove-Item -LiteralPath $taskAbsolute -Recurse -Force
        $taskBytes += $taskSize
        $taskCount++
    }
}
[PSCustomObject]@{ RemovedPaths = $taskCount; FreedBytes = $taskBytes; FreedMiB = [Math]::Round($taskBytes / 1MB, 1) } | ConvertTo-Json
