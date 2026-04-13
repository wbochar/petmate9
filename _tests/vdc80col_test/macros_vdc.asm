; ============================================================
; macros_vdc.asm — C128 VDC (8563/8568) utility macros
; For use with c64jasm assembler
; ============================================================

!let FALSE = 0
!let TRUE  = 1

; VDC I/O ports
!let VDC_ADDR = $d600       ; Register select / status
!let VDC_DATA = $d601       ; Register data read/write

; VDC register numbers
!let VDC_REG_HTOTAL        = 0   ; Horizontal Total
!let VDC_REG_HDISP         = 1   ; Horizontal Displayed
!let VDC_REG_VTOTAL        = 4   ; Vertical Total (char rows)
!let VDC_REG_VDISP         = 6   ; Vertical Displayed (char rows)
!let VDC_REG_CELL_HEIGHT   = 9   ; Character Total Vertical (scanlines-1)
!let VDC_REG_CURSOR_HI     = 14  ; Cursor Position High
!let VDC_REG_CURSOR_LO     = 15  ; Cursor Position Low
!let VDC_REG_ADDR_HI       = 18  ; Update Address High
!let VDC_REG_ADDR_LO       = 19  ; Update Address Low
!let VDC_REG_ATTR_HI       = 20  ; Attribute Start Address High
!let VDC_REG_ATTR_LO       = 21  ; Attribute Start Address Low
!let VDC_REG_CHAR_DISP_V   = 23  ; Character Display Vertical
!let VDC_REG_VSCROLL       = 24  ; Vertical Smooth Scroll / Copy-Fill
!let VDC_REG_HSCROLL       = 25  ; Horizontal Smooth Scroll / Mode
!let VDC_REG_COLORS        = 26  ; Foreground/Background Color
!let VDC_REG_ROWINC        = 27  ; Address Increment Per Row
!let VDC_REG_CHARSET       = 28  ; Character Set Base / DRAM Type
!let VDC_REG_UNDERLINE     = 29  ; Underline Scan Line
!let VDC_REG_COUNT         = 30  ; Word Count (triggers block op)
!let VDC_REG_DATA          = 31  ; Data Register (read/write VDC RAM)
!let VDC_REG_BLKSRC_HI     = 32  ; Block Copy Source High
!let VDC_REG_BLKSRC_LO     = 33  ; Block Copy Source Low

; Default VDC memory layout (power-on)
!let VDC_SCREEN  = $0000    ; Screen RAM start
!let VDC_ATTRIB  = $0800    ; Attribute RAM start

; Screen dimensions (80×25 default)
!let VDC_COLS = 80
!let VDC_ROWS = 25
!let VDC_SCREEN_SIZE = 2000  ; 80 * 25

; VDC Attribute bits
!let VDC_ATTR_BLINK     = %00010000
!let VDC_ATTR_UNDERLINE = %00100000
!let VDC_ATTR_REVERSE   = %01000000
!let VDC_ATTR_ALTCHAR   = %10000000

; ============================================================
; C128 BASIC start macro (SYS line at $1C01)
; ============================================================
!macro basic_start(addr) {
* = $1c01
    !byte $0b, $1c       ; pointer to next BASIC line
    !byte $00, $00        ; line number 0
    !byte $9e             ; SYS token
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
    !byte 0, 0, 0         ; end of BASIC program
}

; ============================================================
; VDC Register Access Routines
; ============================================================

; Write value in A to VDC register X
; Clobbers: none (preserves A, X, Y)
!macro vdc_write_reg() {
    stx VDC_ADDR
vwait:
    bit VDC_ADDR
    bpl vwait
    sta VDC_DATA
}

; Read VDC register X into A
; Clobbers: A
!macro vdc_read_reg() {
    stx VDC_ADDR
vwait:
    bit VDC_ADDR
    bpl vwait
    lda VDC_DATA
}

; ============================================================
; Set VDC update address (for sequential read/write via reg 31)
; A = high byte, Y = low byte
; ============================================================
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

; ============================================================
; Write a single byte to VDC RAM at current update address
; (auto-increments the address)
; A = byte to write
; ============================================================
!macro vdc_write_byte() {
    ldx #VDC_REG_DATA
    stx VDC_ADDR
vwait:
    bit VDC_ADDR
    bpl vwait
    sta VDC_DATA
}

; ============================================================
; VDC Block Fill: fill 'count' bytes at update address with
; the value last written to register 31.
;
; Before calling: set update address, write fill byte to reg 31
; A = count (1-255, 0 = 256 bytes)
; ============================================================
!macro vdc_block_fill() {
    ; Ensure COPY bit (bit 7 of reg 24) is clear for fill mode
    pha
    ldx #VDC_REG_VSCROLL
    +vdc_read_reg()
    and #%01111111          ; clear COPY bit = fill mode
    +vdc_write_reg()
    pla

    ; Write count to register 30 — triggers the fill
    ldx #VDC_REG_COUNT
    +vdc_write_reg()
}
