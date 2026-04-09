param([long]$Hwnd, [int]$Dark = 0)

Add-Type @"
using System;
using System.Runtime.InteropServices;
public class DwmHelper {
    [DllImport("dwmapi.dll", PreserveSig = true)]
    public static extern int DwmSetWindowAttribute(IntPtr hwnd, int attr, ref int value, int size);
}
"@

$ptr = [IntPtr]::new($Hwnd)
$val = $Dark
$hr19 = [DwmHelper]::DwmSetWindowAttribute($ptr, 19, [ref]$val, 4)
$hr20 = [DwmHelper]::DwmSetWindowAttribute($ptr, 20, [ref]$val, 4)
Write-Output "ATTR19=$hr19 ATTR20=$hr20"
