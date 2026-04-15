!let FALSE = 0
!let TRUE = 1
!let SCREEN = $0c00
!let COLOR = $0800

; C16/Plus4 BASIC start at $1001
; SYS address is computed from the start of the code block.
!macro basic_start(addr) {
* = $1001
    !byte $0b
    !byte $10
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

;------------------------------------------------------------------------
; TED IRQ setup macros
; TED registers: $FF09 = IRQ status, $FF0A = IRQ enable + raster bit 8,
;                $FF0B = raster compare bits 7-0
; To use custom IRQ handler, bank out ROM so $FFFE/$FFFF reads from RAM.

!macro setup_irq(irq_addr, irq_line) {
    ; Bank out ROM ($8000-$FFFF -> RAM) so we can set vectors in RAM
    sta $ff3f

    lda #<irq_addr
    ldx #>irq_addr
    sta $fffe
    stx $ffff

    ; Enable raster IRQ (bit 1 of $FF0A)
    lda #irq_line
    sta $ff0b
    lda $ff0a
    and #$fc        ; clear raster bit 8 and raster enable
    ora #$02        ; set raster IRQ enable (bit 1)
    !if (irq_line > 255) {
        ora #$01    ; set raster compare bit 8
    }
    sta $ff0a

    ; Acknowledge any pending IRQ
    lda #$ff
    sta $ff09
}

!macro irq_start(end_lbl) {
    sta end_lbl-6
    stx end_lbl-4
    sty end_lbl-2
}

!macro irq_end(next, line) {
    ; Acknowledge TED raster IRQ
    lda #$02
    sta $ff09
    ; Restore registers and return
    lda #$00
    ldx #$00
    ldy #$00
    rti
}
