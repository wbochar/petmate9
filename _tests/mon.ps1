# Usage: pwsh mon.ps1 "cmd1" "cmd2" ...
# Sends each command to VICE's text monitor at 127.0.0.1:6510 and prints replies.
param([Parameter(ValueFromRemainingArguments=$true)][string[]]$commands)

$client = New-Object System.Net.Sockets.TcpClient
$client.ReceiveTimeout = 1200
$client.SendTimeout    = 1200
try {
    $client.Connect('127.0.0.1', 6510)
} catch {
    Write-Error "could not connect to VICE text monitor on 127.0.0.1:6510 ($_)"
    exit 1
}
$stream = $client.GetStream()
$enc    = [System.Text.Encoding]::ASCII
$buf    = New-Object byte[] 65536

function Drain {
    Start-Sleep -Milliseconds 250
    $sb = [System.Text.StringBuilder]::new()
    while ($stream.DataAvailable) {
        $n = $stream.Read($buf, 0, $buf.Length)
        if ($n -le 0) { break }
        [void]$sb.Append($enc.GetString($buf, 0, $n))
        Start-Sleep -Milliseconds 80
    }
    $sb.ToString()
}

# drain the banner
Write-Host (Drain)

foreach ($cmd in $commands) {
    $bytes = $enc.GetBytes($cmd + "`n")
    $stream.Write($bytes, 0, $bytes.Length)
    Start-Sleep -Milliseconds 150
    Write-Host "---- $cmd ----"
    Write-Host (Drain)
}

$client.Close()
