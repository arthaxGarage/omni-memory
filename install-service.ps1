# install-service.ps1
# Registers omni-memory hub as a Windows Task Scheduler task that starts at logon.
# Run once from an elevated or normal PowerShell prompt — no admin required for
# per-user tasks (TASK_LOGON_INTERACTIVE_TOKEN).

$taskName   = "OmniMemory"
$projectDir = $PSScriptRoot
$vbsLauncher = Join-Path $projectDir "launch-hidden.vbs"
$entryPoint = Join-Path $projectDir "dist\server.js"

if (-not (Test-Path $entryPoint)) {
    Write-Error "dist\server.js not found — run 'npm run build' first."
    exit 1
}

if (-not (Test-Path $vbsLauncher)) {
    Write-Error "launch-hidden.vbs not found in $projectDir"
    exit 1
}

# Remove existing task if present
Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue

# wscript.exe launches node via the VBS with window style 0 (hidden) — no console window appears
$action = New-ScheduledTaskAction `
    -Execute "wscript.exe" `
    -Argument "`"$vbsLauncher`"" `
    -WorkingDirectory $projectDir

# Start at every logon for this user; delay 10s so Ollama is up first
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$trigger.Delay = "PT10S"

$settings = New-ScheduledTaskSettingsSet `
    -ExecutionTimeLimit  ([TimeSpan]::Zero) `
    -RestartCount        5 `
    -RestartInterval     (New-TimeSpan -Minutes 1)

$principal = New-ScheduledTaskPrincipal `
    -UserId    $env:USERNAME `
    -LogonType Interactive `
    -RunLevel  Limited

Register-ScheduledTask `
    -TaskName  $taskName `
    -Action    $action `
    -Trigger   $trigger `
    -Settings  $settings `
    -Principal $principal `
    -Force | Out-Null

# Start it now without waiting for next logon
Start-ScheduledTask -TaskName $taskName

Start-Sleep -Seconds 3
$state = (Get-ScheduledTask -TaskName $taskName).State
Write-Host "Task '$taskName' registered and started. State: $state"
Write-Host 'To stop:      Stop-ScheduledTask -TaskName OmniMemory'
Write-Host 'To uninstall: Unregister-ScheduledTask -TaskName OmniMemory -Confirm:$false'
