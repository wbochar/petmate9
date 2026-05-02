!let FALSE = 0
!let TRUE  = 1

; VDC I/O ports
!let VDC_ADDR = $d600
!let VDC_DATA = $d601

; VDC register numbers
!let VDC_REG_ADDR_HI   = 18
!let VDC_REG_ADDR_LO   = 19
!let VDC_REG_VSCROLL    = 24
!let VDC_REG_COLORS     = 26
!let VDC_REG_UNDERLINE  = 29
!let VDC_REG_COUNT      = 30
!let VDC_REG_DATA       = 31
!let VDC_REG_CURSOR_HI  = 14
!let VDC_REG_CURSOR_LO  = 15

; Default VDC memory layout
!let VDC_SCREEN  = $0000
!let VDC_ATTRIB  = $0800

; Zero-page temporaries
!let zp_ptr   = $fb
!let zp_count = $fd
!let zp_row   = $fe
!let zp_tmp   = $ff

; C128 BASIC start macro (SYS line at $1C01)
!macro basic_start(addr) {
* = $1c01
    !byte $0b, $1c
    !byte $00, $00
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

; Write value in A to VDC register X
!macro vdc_write_reg() {
    stx VDC_ADDR
vwait:
    bit VDC_ADDR
    bpl vwait
    sta VDC_DATA
}

; Read VDC register X into A
!macro vdc_read_reg() {
    stx VDC_ADDR
vwait:
    bit VDC_ADDR
    bpl vwait
    lda VDC_DATA
}

; Set VDC update address: A=high, Y=low
!macro vdc_set_update_addr() {
    ldx #VDC_REG_ADDR_HI
    stx VDC_ADDR
vwait1:
    bit VDC_ADDR
    bpl vwait1
    sta VDC_DATA
    ldx #VDC_REG_ADDR_LO
    stx VDC_ADDR
vwait2:
    bit VDC_ADDR
    bpl vwait2
    sty VDC_DATA
}

; Write A to VDC RAM at current update address (auto-increments)
!macro vdc_write_byte() {
    ldx #VDC_REG_DATA
    stx VDC_ADDR
vwait:
    bit VDC_ADDR
    bpl vwait
    sta VDC_DATA
}

; Block fill: seed value via vdc_write_byte first, then call with A=count
!macro vdc_block_fill() {
    pha
    ldx #VDC_REG_VSCROLL
    +vdc_read_reg()
    and #%01111111
    +vdc_write_reg()
    pla
    ldx #VDC_REG_COUNT
    +vdc_write_reg()
}
