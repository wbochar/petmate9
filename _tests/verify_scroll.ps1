# Connect to VICE text monitor, capture state, return parsed results.
function Invoke-Mon {
    param([string[]]$commands)
    $client = New-Object System.Net.Sockets.TcpClient
    $client.ReceiveTimeout = 1500
    $client.SendTimeout    = 1500
    try { $client.Connect('127.0.0.1', 6510) }
    catch { return $null }
    $stream = $client.GetStream()
    $enc    = [System.Text.Encoding]::ASCII
    $buf    = New-Object byte[] 65536
    $sb     = [System.Text.StringBuilder]::new()

    function Drain($ms = 250) {
        Start-Sleep -Milliseconds $ms
        while ($stream.DataAvailable) {
            $n = $stream.Read($buf, 0, $buf.Length)
            if ($n -le 0) { break }
            [void]$sb.Append($enc.GetString($buf, 0, $n))
            Start-Sleep -Milliseconds 40
        }
    }
    Drain 250
    foreach ($c in $commands) {
        $b = $enc.GetBytes($c + "`n")
        $stream.Write($b, 0, $b.Length)
        Drain 150
    }
    # exit monitor so emulation resumes
    $x = $enc.GetBytes("x`n")
    $stream.Write($x, 0, $x.Length)
    Start-Sleep -Milliseconds 80
    $client.Close()
    return $sb.ToString()
}

# Parse a VICE 'm' dump like ">C:d800  fe fe fe fe  ..." into address -> bytes[16] map.
function Parse-Memory([string]$text) {
    $map = @{}
    foreach ($line in $text -split "`n") {
        if ($line -match '^>C:([0-9a-f]{4})\s+([0-9a-f\s]+?)\s{2,}') {
            $addr = [Convert]::ToInt32($matches[1], 16)
            $hex  = $matches[2] -replace '\s+', ' '
            $bytes = $hex.Trim() -split '\s+' | ForEach-Object { [Convert]::ToInt32($_, 16) }
            $map[$addr] = $bytes
        }
    }
    return $map
}

# Collect N samples with a delay between them.
$samples = @()
for ($i = 0; $i -lt 6; $i++) {
    $cmds = @(
        "r",
        "m fffe ffff",
        "m 0a97 0a9f",
        "m d800 d81f",
        "m d900 d91f",
        "m da30 da4f",
        "m db00 db1f",
        "m dbc0 dbe7"
    )
    $text = Invoke-Mon $cmds
    if ($null -eq $text) {
        Write-Host "sample $i : could not connect to VICE monitor"
        break
    }
    $mem = Parse-Memory $text
    $vars = $mem[0x0a97]
    # Scan whole visible $D800 region for any non-$0E byte
    $tornAddrs = @()
    foreach ($base in 0x0d800..0x0d800) { } # no-op to keep scope
    $scan = @(
        [tuple[int,int[]]]::new(0xD800, $mem[0xD800]),
        [tuple[int,int[]]]::new(0xD900, $mem[0xD900]),
        [tuple[int,int[]]]::new(0xDA30, $mem[0xDA30]),
        [tuple[int,int[]]]::new(0xDB00, $mem[0xDB00]),
        [tuple[int,int[]]]::new(0xDBC0, $mem[0xDBC0])
    )
    foreach ($s in $scan) {
        $addr = $s.Item1
        $bytes = $s.Item2
        if ($null -ne $bytes) {
            for ($j = 0; $j -lt $bytes.Length; $j++) {
                $v = $bytes[$j] -band 0x0F
                if ($v -ne 0x0E) { $tornAddrs += ('{0:X4}={1:X2}' -f ($addr+$j), $bytes[$j]) }
            }
        }
    }
    $irqVec = if ($mem[0xFFFE]) { ('$' + ('{0:X4}' -f ($mem[0xFFFE][0] -bor ($mem[0xFFFE][1] -shl 8)))) } else { '?' }

    $samples += [pscustomobject]@{
        t            = $i
        pc           = if ($text -match '(?m)^\.;([0-9a-f]{4})\s') { $matches[1].ToUpper() } else { '????' }
        irqVec       = $irqVec
        vsyncFlag    = if ($vars) { '${0:X2}' -f $vars[0] } else { '?' }
        nextD011     = if ($vars) { '${0:X2}' -f $vars[1] } else { '?' }
        nextD018     = if ($vars) { '${0:X2}' -f $vars[2] } else { '?' }
        scrollFine   = if ($vars) { '{0}'    -f $vars[3] } else { '?' }
        scrollRow    = if ($vars) { '{0}'    -f $vars[4] } else { '?' }
        delayCounter = if ($vars) { '{0}'    -f $vars[5] } else { '?' }
        displayBuf   = if ($vars) { '{0}'    -f $vars[6] } else { '?' }
        workBufOffs  = if ($vars) { '${0:X2}' -f $vars[7] } else { '?' }
        coarsePhase  = if ($vars) { '{0}'    -f $vars[8] } else { '?' }
        tornBytes    = if ($tornAddrs.Count) { [string]::Join(',', $tornAddrs) } else { '(none)' }
    }
    Start-Sleep -Milliseconds 900
}

$samples | Format-Table -AutoSize
