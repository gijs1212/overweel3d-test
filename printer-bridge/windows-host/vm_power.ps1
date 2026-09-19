param(
    [ValidateSet("Toggle", "Start", "Stop", "Status")]
    [string]$Action = "Toggle",
    [string]$ConfigPath = "$PSScriptRoot\host-runner.json"
)

$ErrorActionPreference = "Stop"
if (-not (Test-Path -LiteralPath $ConfigPath)) {
    throw "host-runner.json niet gevonden: $ConfigPath"
}

$config = Get-Content -LiteralPath $ConfigPath -Raw | ConvertFrom-Json
$vmrun = [string]$config.vmrun_path
$vmx = if ($config.vmx_path) { [string]$config.vmx_path } else { 'G:\Windows\Windows 11 x64.vmx' }
$vmPassword = [string]$config.vm_password
$addonCallbackUrl = if ($config.addon_callback_url) { [string]$config.addon_callback_url } else { "http://homeassistant.local:8766" }
$addonToken = if ($config.addon_token) { [string]$config.addon_token } elseif ($config.token) { [string]$config.token } else { "" }
$vmStopTimeoutSeconds = if ($config.vm_stop_timeout_seconds) { [int]$config.vm_stop_timeout_seconds } else { 180 }
if (-not (Test-Path -LiteralPath $vmrun)) { throw "vmrun.exe niet gevonden: $vmrun" }
if (-not (Test-Path -LiteralPath $vmx)) { throw "VMX niet gevonden: $vmx" }

$baseArguments = @("-T", "ws")
$encryptedVmArguments = @($baseArguments)
if ($vmPassword) { $encryptedVmArguments += @("-vp", $vmPassword) }

function Test-VmRunning {
    $runningVms = & $vmrun @baseArguments "list"
    if ($LASTEXITCODE -ne 0) { throw "De VMware-status kon niet worden gelezen." }
    return [bool]($runningVms | Where-Object { $_.Trim() -ieq $vmx })
}

function Start-ConfiguredVm {
    & $vmrun @encryptedVmArguments "start" $vmx "nogui"
    if ($LASTEXITCODE -ne 0) { throw "De versleutelde VM kon niet worden gestart." }
    Write-Host "VM stond uit en is zonder zichtbaar VMware-venster gestart."
}

function Send-VmStoppedWebhook {
    if (-not $addonToken) { throw "addon_token ontbreekt in host-runner.json." }
    $uri = "$($addonCallbackUrl.TrimEnd('/'))/guest/vm-stopped"
    $body = @{
        event = "vm_stopped"
        vmx = $vmx
        host = $env:COMPUTERNAME
        stopped_at = [DateTimeOffset]::Now.ToString("o")
    } | ConvertTo-Json -Compress

    $lastError = $null
    foreach ($attempt in 1..3) {
        try {
            $headers = @{ "X-Overweel3D-Token" = $addonToken }
            Invoke-RestMethod -Method Post -Uri $uri -Headers $headers -ContentType "application/json" -Body $body -TimeoutSec 10 | Out-Null
            Write-Host "De Overweel3D-add-on heeft bevestigd dat de VM volledig uit staat."
            return
        } catch {
            $lastError = $_
            if ($attempt -lt 3) { Start-Sleep -Seconds 3 }
        }
    }
    throw "VM is uit, maar de Overweel3D-add-on kon niet worden bereikt: $($lastError.Exception.Message)"
}

function Stop-ConfiguredVm {
    & $vmrun @encryptedVmArguments "stop" $vmx "soft"
    if ($LASTEXITCODE -ne 0) { throw "De VM kon niet netjes worden afgesloten." }
    Write-Host "VM draaide en heeft een normaal afsluitcommando ontvangen."

    $deadline = [DateTimeOffset]::Now.AddSeconds([Math]::Max(30, $vmStopTimeoutSeconds))
    while (Test-VmRunning) {
        if ([DateTimeOffset]::Now -ge $deadline) {
            throw "De VM heeft het afsluiten niet binnen $vmStopTimeoutSeconds seconden bevestigd; de pc blijft aan."
        }
        Start-Sleep -Seconds 2
    }
    Write-Host "VMware bevestigt dat de VM volledig uit staat."
    Send-VmStoppedWebhook
}

switch ($Action) {
    "Toggle" {
        if (Test-VmRunning) {
            Stop-ConfiguredVm
        } else {
            Start-ConfiguredVm
        }
    }
    "Start" {
        if (Test-VmRunning) {
            Write-Host "VM draait al; niets gewijzigd."
        } else {
            Start-ConfiguredVm
        }
    }
    "Stop" {
        if (Test-VmRunning) {
            Stop-ConfiguredVm
        } else {
            Write-Host "VM staat al uit; niets gewijzigd."
        }
    }
    "Status" {
        if (Test-VmRunning) {
            Write-Host "VM draait."
        } else {
            Write-Host "VM staat uit."
        }
    }
}
