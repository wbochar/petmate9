$ErrorActionPreference = "Stop"

$VmName = "Ubuntu-GNOME-Petmate"
$LogDir = "C:\HyperV\logs"
$LogPath = Join-Path $LogDir ("check-ubuntu-vm-ssh-{0}.log" -f (Get-Date -Format "yyyyMMdd-HHmmss"))

New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
Start-Transcript -Path $LogPath -Force | Out-Null

try {
    Write-Host "Log file: $LogPath"

    $vm = Get-VM -Name $VmName -ErrorAction Stop
    Write-Host "VM: $($vm.Name)"
    Write-Host "State: $($vm.State)"
    Write-Host "Status: $($vm.Status)"
    Write-Host "Uptime: $($vm.Uptime)"

    if ($vm.State -ne "Running") {
        Write-Host "Starting VM..."
        Start-VM -Name $VmName | Out-Null
        Start-Sleep -Seconds 8
        $vm = Get-VM -Name $VmName -ErrorAction Stop
        Write-Host "State after start attempt: $($vm.State)"
    }

    Write-Host ""
    Write-Host "Testing localhost SSH forwarding on port 2222..."
    $local2222 = Test-NetConnection -ComputerName "localhost" -Port 2222 -WarningAction SilentlyContinue
    Write-Host "localhost:2222 reachable: $($local2222.TcpTestSucceeded)"

    Write-Host ""
    Write-Host "Detecting VM IPv4 addresses..."
    $adapter = Get-VMNetworkAdapter -VMName $VmName
    Write-Host "VM network adapter switch: $($adapter.SwitchName)"
    Write-Host "VM network adapter status: $($adapter.Status)"
    $ips = $adapter.IPAddresses |
        Where-Object { $_ -match '^\d{1,3}(\.\d{1,3}){3}$' -and $_ -ne '0.0.0.0' } |
        Select-Object -Unique

    if (-not $ips -or $ips.Count -eq 0) {
        Write-Host "No VM IPv4 address detected yet."
    }
    else {
        foreach ($ip in $ips) {
            Write-Host "VM IP: $ip"
            $ssh22 = Test-NetConnection -ComputerName $ip -Port 22 -WarningAction SilentlyContinue
            Write-Host "  $ip:22 reachable: $($ssh22.TcpTestSucceeded)"
        }
    }

    Write-Host ""
    Write-Host "Hyper-V integration services:"
    Get-VMIntegrationService -VMName $VmName |
        Select-Object Name, Enabled, PrimaryStatusDescription |
        Format-Table -AutoSize

    Write-Host ""
    Write-Host "Host VMSwitch list:"
    Get-VMSwitch |
        Select-Object Name, SwitchType, AllowManagementOS, NetAdapterInterfaceDescription |
        Format-Table -AutoSize

    Write-Host ""
    Write-Host "Done."
}
catch {
    Write-Error ("Diagnostic failed: " + $_.Exception.Message)
    throw
}
finally {
    Stop-Transcript | Out-Null
    Write-Host "Transcript saved to: $LogPath"
}
