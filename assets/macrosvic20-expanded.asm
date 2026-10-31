!let FALSE = 0
!let TRUE = 1
; With 8K+ of RAM expansion in block 1 (and above), the VIC-20 KERNAL
; relocates screen memory to $1000 and color RAM follows to $9400 (the VIC
; chip can only see the lowest 8K, so the screen can't stay at $1E00 once
; block 1 ($2000-$3FFF) is populated). The 3K expansion (block 0 only)
; does NOT relocate anything -- screen/color stay at $1E00/$9600 in that
; case, same as unexpanded.
!let SCREEN = $1000
!let COLOR = $9400

; Basic starter macro that needs to be the first emitted
; code in your main assembly source file.
; NOTE: with 8K+ RAM expansion (block 1 populated), the KERNAL relocates
; screen memory to SCREEN ($1000) -- that occupies $1000-$11FF (2 pages),
; which overlaps $1001, the usual BASIC/program start address on an
; unexpanded machine. Real expanded VIC-20 KERNALs relocate the BASIC text
; area to $1201 for exactly this reason, so our program/code must start
; there too, or the screen-copy loop below would overwrite its own running
; code and source character/colour data.
!macro basic_start(addr) {
* = $1201
    !byte $0b
    !byte $1c
    !byte $00
    !byte $00
    !byte $9e

!if (addr >= 10000) {
    !byte $30 + (addr/10000)%10
}
!if (addr >= 1000) {
    !byte $30 + (addr/1000)%10
}
!if (addr >= 100) {
    !byte $30 + (addr/100)%10
}
!if (addr >= 10) {
    !byte $30 + (addr/10)%10
}
    !byte $30 + addr % 10
    !byte 0, 0, 0
}
