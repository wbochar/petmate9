!let FALSE = 0
!let TRUE = 1
!let SCREEN = $1e00
!let COLOR = $9600

; Basic starter macro that needs to be the first emitted
; code in your main assembly source file.
!macro basic_start(addr) {
* = $1001
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
