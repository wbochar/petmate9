$ErrorActionPreference = "Stop"
$PSNativeCommandUseErrorActionPreference = $true

$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).
    IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    throw "This script must be run from an elevated PowerShell session (Run as Administrator)."
}

$UbuntuSeries  = "24.04"
$UbuntuVersion = "24.04.4"
$IsoDir        = "C:\ISO"
$IsoFile       = "ubuntu-$UbuntuVersion-desktop-amd64.iso"
$IsoPath       = Join-Path $IsoDir $IsoFile
$IsoUrl        = "https://releases.ubuntu.com/$UbuntuSeries/$IsoFile"
$ShaUrl        = "https://releases.ubuntu.com/$UbuntuSeries/SHA256SUMS"

$VmName        = "Ubuntu-GNOME-Petmate"
$VmRoot        = "C:\HyperV\$VmName"
$VhdPath       = Join-Path $VmRoot "disk.vhdx"
$SwitchName    = "Default Switch"

$StartupMem    = 8GB
$MinMem        = 4GB
$MaxMem        = 12GB
$CpuCount      = 4
$VhdSize       = 80GB

$LogDir        = "C:\HyperV\logs"
$LogPath       = Join-Path $LogDir ("setup-ubuntu-hyperv-{0}.log" -f (Get-Date -Format "yyyyMMdd-HHmmss"))

function Assert-LastExitCode {
    param([string]$Step)
    if ($LASTEXITCODE -ne 0) {
        throw "$Step failed with native exit code $LASTEXITCODE"
    }
}

New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
Start-Transcript -Path $LogPath -Force | Out-Null

try {
    Write-Host "Log file: $LogPath"

    New-Item -ItemType Directory -Path $IsoDir -Force | Out-Null
    New-Item -ItemType Directory -Path $VmRoot -Force | Out-Null

    if (-not (Test-Path $IsoPath)) {
        Write-Host "Downloading $IsoFile ..."
        curl.exe -L --fail --output "$IsoPath" "$IsoUrl"
        Assert-LastExitCode -Step "ISO download"
    }
    else {
        Write-Host "ISO already exists: $IsoPath"
    }

    $ShaFile = Join-Path $env:TEMP "SHA256SUMS-$UbuntuSeries.txt"
    Write-Host "Downloading SHA256SUMS ..."
    curl.exe -L --fail --output "$ShaFile" "$ShaUrl"
    Assert-LastExitCode -Step "SHA256SUMS download"

    $entry = Select-String -Path $ShaFile -Pattern ("\*" + [regex]::Escape($IsoFile) + "$") | Select-Object -First 1
    if (-not $entry) {
        throw "No checksum entry found for $IsoFile in $ShaFile"
    }

    $expectedHash = ($entry.Line -split '\s+')[0].ToLowerInvariant()
    $actualHash   = (Get-FileHash -Path $IsoPath -Algorithm SHA256).Hash.ToLowerInvariant()

    if ($expectedHash -ne $actualHash) {
        throw "Checksum mismatch. Expected: $expectedHash Actual: $actualHash"
    }
    Write-Host "Checksum verified."

    $switch = Get-VMSwitch -Name $SwitchName -ErrorAction SilentlyContinue
    if (-not $switch) {
        throw "Required VMSwitch '$SwitchName' was not found."
    }
    Write-Host "Using VMSwitch '$SwitchName'."

    if (-not (Get-VM -Name $VmName -ErrorAction SilentlyContinue)) {
        Write-Host "Creating VM '$VmName' ..."
        New-VM -Name $VmName -Generation 2 `
            -MemoryStartupBytes $StartupMem `
            -NewVHDPath $VhdPath `
            -NewVHDSizeBytes $VhdSize `
            -SwitchName $SwitchName | Out-Null

        Set-VMProcessor -VMName $VmName -Count $CpuCount
        Set-VMMemory -VMName $VmName -DynamicMemoryEnabled $true -MinimumBytes $MinMem -MaximumBytes $MaxMem
        Set-VMFirmware -VMName $VmName -EnableSecureBoot On -SecureBootTemplate "MicrosoftUEFICertificateAuthority"
    }
    else {
        Write-Host "VM '$VmName' already exists."
    }

    $dvd = Get-VMDvdDrive -VMName $VmName -ErrorAction SilentlyContinue
    if (-not $dvd) {
        Write-Host "Adding DVD drive and attaching ISO ..."
        Add-VMDvdDrive -VMName $VmName -Path $IsoPath | Out-Null
    }
    elseif ($dvd.Path -ne $IsoPath) {
        Write-Host "Updating DVD drive ISO path ..."
        Set-VMDvdDrive -VMName $VmName -Path $IsoPath
    }
    else {
        Write-Host "ISO already attached."
    }

    $dvdDrive = Get-VMDvdDrive -VMName $VmName
    Set-VMFirmware -VMName $VmName -FirstBootDevice $dvdDrive

    if ((Get-VM -Name $VmName).State -ne "Running") {
        Start-VM -Name $VmName | Out-Null
    }

    Write-Host "Done. '$VmName' is ready and running with Ubuntu ISO attached."
}
catch {
    Write-Error ("Setup failed: " + $_.Exception.Message)
    Write-Error ("Error details: " + ($_ | Out-String))
    throw
}
finally {
    Stop-Transcript | Out-Null
    Write-Host "Transcript saved to: $LogPath"
}
