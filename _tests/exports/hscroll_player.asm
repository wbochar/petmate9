
; Petmate9 Horizontal Smooth Scroller (C64) — Double Buffered
; Source: debug-hscroll-80x25 (80x25), scroll 79 cols
; Buffer A = $0400, Buffer B = $0C00 — swap via $D018 in IRQ
!include "macros.asm"
!let music_load = $1000
!let music_init = $1000
!let music_play = $1003

!let irq_top_line    = 1
!let irq_bottom_line = 251
!let debug_build     = FALSE
!let VISIBLE_COLS    = 40
!let VISIBLE_ROWS    = 25
!let MAX_SCROLL      = 79
!let SRC_ROW_WIDTH   = 120
!let SCROLL_SPEED    = 1
!let D018_A          = $15
!let D018_B          = $35

!let zp_src          = $20
!let zp_dst          = $22
!let zp_vis_row      = $24
!let zp_col_lo       = $25   ; scrollCol low byte for source offset
!let zp_col_hi       = $26   ; scrollCol high byte (always 0 for col<256)
!let zp_cmt_src      = $28   ; dedicated commit-source pointer (IRQ-safe)

+basic_start(entry)

;--------------------------------------------------------------
; Entry
;--------------------------------------------------------------
entry: {
    lda #0
    jsr music_init

    sei
    lda #$35
    sta $01
    +setup_irq(irq_top, irq_top_line)
    cli

    ; Border / background
    lda #0
    sta $d020
    lda #0
    sta $d021

    ; Init scroll state
    lda #7
    sta scrollFine
    lda #0
    sta scrollCol
    sta displayBuf
    sta workBufOffset
    sta coarsePhase
    sta scrollDir           ; 0 = forward/right, 1 = reverse/left (pingpong mode)
    sta paused
    sta muteFlag
    sta keySpacePrev
    sta keyMPrev
    sta keyPlusPrev
    sta keyMinusPrev
    lda #$ff
    sta $dc00
    sta $dc02               ; CIA1 port A output (keyboard row select)
    lda #$00
    sta $dc03               ; CIA1 port B input  (keyboard columns)
    lda #SCROLL_SPEED
    sta scrollSpeed
    sta delayCounter

    ; Pre-fill BOTH buffers so the first swap is already ready
    ; Buffer A (workBufOffset = $00 → dest hi $04 → $0400)
    jsr copy_window_screen
    jsr copy_window_color
    ; Buffer B (workBufOffset = $08 → dest hi $04+$08=$0C → $0C00)
    lda #$08
    sta workBufOffset
    jsr copy_window_screen
    lda #$00
    sta workBufOffset

    ; Set VIC: 25 rows, YSCROLL=3 (normal), 38 cols, XSCROLL=7
    lda #$1b            ; 25-row mode, normal
    sta $d011
    lda #$c7            ; 38-col mode ($C0) + XSCROLL=7
    sta nextD016
    sta $d016
    lda #D018_A
    sta nextD018
    sta $d018

    ; ── Main loop: double-buffered prepare-ahead ──

main_loop:
    lda vsyncFlag
    beq main_loop
    lda #0
    sta vsyncFlag
    lda paused
    beq not_paused
    jmp post_frame_work
not_paused:

    dec delayCounter
    beq delay_elapsed
    jmp post_frame_work
delay_elapsed:
    lda scrollSpeed
    sta delayCounter

    ; ── Prepare next scroll step ──

    ; Wrap fine+coarse stepping (mod SOURCE_COLS)
    dec scrollFine
    bpl prep_fine

    ; Coarse scroll needed
    lda #7
    sta scrollFine
    inc scrollCol
    lda scrollCol
    cmp #MAX_SCROLL+1
    bcc do_coarse
    ; Wrap
    lda #0
    sta scrollCol


do_coarse:
    ; Determine work-buffer offset ($00 = $0400, $08 = $0C00)
    lda displayBuf
    bne work_is_a
    lda #$08
    jmp set_work
work_is_a:
    lda #$00
set_work:
    sta workBufOffset

    ; Flip displayBuf and queue $D018 swap BEFORE the long copy and
    ; BEFORE arming coarsePhase. That way, when the lower-border IRQ
    ; fires mid-copy and commits bottom (phase 1→2), the very next
    ; upper-border IRQ already has nextD018 ready to apply.
    lda displayBuf
    eor #1
    sta displayBuf
    beq swap_a
    lda #D018_B
    jmp queue_swap
swap_a:
    lda #D018_A
queue_swap:
    sta nextD018

    ; Arm the commit BEFORE the char copy so the lower-border IRQ
    ; never misses the signal no matter how long the copy takes.
    ; The commit uses zp_cmt_src (not zp_src), so it's safe to preempt
    ; copy_row mid-byte.
    lda #1
    sta coarsePhase

    ; Big 25×40 char copy — may be preempted by the lower-border IRQ.
    ; Color RAM is NOT touched here; the IRQ chain commits $D800
    ; across frame N-1 lower border + frame N upper border.
    jsr copy_window_screen

prep_fine:
    lda #$c0            ; 38-col mode
    ora scrollFine
    sta nextD016
post_frame_work:
    jsr handle_input

    lda muteFlag
    beq music_unmuted
    lda #0
    sta $d404
    sta $d40b
    sta $d412
    sta $d417
    sta $d418
    jmp music_main_done
music_unmuted:
    jsr music_play
music_main_done:

    jmp main_loop
}

;--------------------------------------------------------------
; handle_input — edge-triggered controls:
;   SPACE toggles pause
;   M toggles mute
;   + speeds up  (min delay=1)
;   - slows down (max delay=255)
;--------------------------------------------------------------
handle_input: {
    ; SPACE key: row 7, column 4
    lda #$7f
    sta $dc00
    lda $dc01
    and #$10
    bne space_up
space_down:
    lda keySpacePrev
    bne space_done
    lda #1
    sta keySpacePrev
    lda paused
    eor #1
    sta paused
space_done:
    jmp check_m
space_up:
    lda #0
    sta keySpacePrev

check_m:
    ; M key: row 4, column 4
    lda #$ef
    sta $dc00
    lda $dc01
    and #$10
    bne m_up
m_down:
    lda keyMPrev
    bne m_done
    lda #1
    sta keyMPrev
    lda muteFlag
    eor #1
    sta muteFlag
m_done:
    jmp check_speed
m_up:
    lda #0
    sta keyMPrev

check_speed:
    ; + / - keys: row 5, columns 0 and 3
    lda #$df
    sta $dc00
    lda $dc01
    sta keyRowState

    lda keyRowState
    and #$01
    bne plus_up
plus_down:
    lda keyPlusPrev
    bne plus_done
    lda #1
    sta keyPlusPrev
    lda scrollSpeed
    cmp #1
    beq plus_done
    dec scrollSpeed
plus_done:
    jmp check_minus
plus_up:
    lda #0
    sta keyPlusPrev

check_minus:
    lda keyRowState
    and #$08
    bne minus_up
minus_down:
    lda keyMinusPrev
    bne minus_done
    lda #1
    sta keyMinusPrev
    lda scrollSpeed
    cmp #255
    beq minus_done
    inc scrollSpeed
minus_done:
    jmp input_done
minus_up:
    lda #0
    sta keyMinusPrev

input_done:
    lda #$ff
    sta $dc00
    rts
}

;--------------------------------------------------------------
; copy_window_screen – extract 40-col strip from 160-col source
;   Reads from src_scr_row_base[row] + scrollCol
;   Writes to screen_dest[row] + workBufOffset
;--------------------------------------------------------------
copy_window_screen: {
    lda scrollCol
    sta zp_col_lo
    lda #0
    sta zp_col_hi       ; scrollCol < 256, but carry may bump hi
    sta zp_vis_row

row_loop:
    ldx zp_vis_row
    ; Source = src_scr_row_base + scrollCol
    lda src_scr_row_lo,x
    clc
    adc zp_col_lo
    sta zp_src
    lda src_scr_row_hi,x
    adc zp_col_hi
    sta zp_src+1

    ; Dest = screen_dest + workBufOffset
    lda screen_dest_lo,x
    sta zp_dst
    lda screen_dest_hi,x
    clc
    adc workBufOffset
    sta zp_dst+1

    jsr copy_row

    inc zp_vis_row
    lda zp_vis_row
    cmp #VISIBLE_ROWS
    bne row_loop
    rts
}

;--------------------------------------------------------------
; copy_window_color – initial fill of LIVE $D800 during setup only.
; During scroll, $D800 is updated by irq_top/irq_bottom.
;--------------------------------------------------------------
copy_window_color: {
    lda scrollCol
    sta zp_col_lo
    lda #0
    sta zp_col_hi
    sta zp_vis_row

row_loop:
    ldx zp_vis_row
    lda src_col_row_lo,x
    clc
    adc zp_col_lo
    sta zp_src
    lda src_col_row_hi,x
    adc zp_col_hi
    sta zp_src+1

    lda color_dest_lo,x
    sta zp_dst
    lda color_dest_hi,x
    sta zp_dst+1

    jsr copy_row

    inc zp_vis_row
    lda zp_vis_row
    cmp #VISIBLE_ROWS
    bne row_loop
    rts
}

;--------------------------------------------------------------
; copy_row – copy VISIBLE_COLS (40) bytes from (zp_src) to (zp_dst).
; Inner loop fully unrolled so the 25-row char copy finishes before
; the raster-251 lower-border IRQ fires.
;--------------------------------------------------------------
copy_row: {
    ldy #VISIBLE_COLS-1
    lda (zp_src),y
    sta (zp_dst),y
    dey
    lda (zp_src),y
    sta (zp_dst),y
    dey
    lda (zp_src),y
    sta (zp_dst),y
    dey
    lda (zp_src),y
    sta (zp_dst),y
    dey
    lda (zp_src),y
    sta (zp_dst),y
    dey
    lda (zp_src),y
    sta (zp_dst),y
    dey
    lda (zp_src),y
    sta (zp_dst),y
    dey
    lda (zp_src),y
    sta (zp_dst),y
    dey
    lda (zp_src),y
    sta (zp_dst),y
    dey
    lda (zp_src),y
    sta (zp_dst),y
    dey
    lda (zp_src),y
    sta (zp_dst),y
    dey
    lda (zp_src),y
    sta (zp_dst),y
    dey
    lda (zp_src),y
    sta (zp_dst),y
    dey
    lda (zp_src),y
    sta (zp_dst),y
    dey
    lda (zp_src),y
    sta (zp_dst),y
    dey
    lda (zp_src),y
    sta (zp_dst),y
    dey
    lda (zp_src),y
    sta (zp_dst),y
    dey
    lda (zp_src),y
    sta (zp_dst),y
    dey
    lda (zp_src),y
    sta (zp_dst),y
    dey
    lda (zp_src),y
    sta (zp_dst),y
    dey
    lda (zp_src),y
    sta (zp_dst),y
    dey
    lda (zp_src),y
    sta (zp_dst),y
    dey
    lda (zp_src),y
    sta (zp_dst),y
    dey
    lda (zp_src),y
    sta (zp_dst),y
    dey
    lda (zp_src),y
    sta (zp_dst),y
    dey
    lda (zp_src),y
    sta (zp_dst),y
    dey
    lda (zp_src),y
    sta (zp_dst),y
    dey
    lda (zp_src),y
    sta (zp_dst),y
    dey
    lda (zp_src),y
    sta (zp_dst),y
    dey
    lda (zp_src),y
    sta (zp_dst),y
    dey
    lda (zp_src),y
    sta (zp_dst),y
    dey
    lda (zp_src),y
    sta (zp_dst),y
    dey
    lda (zp_src),y
    sta (zp_dst),y
    dey
    lda (zp_src),y
    sta (zp_dst),y
    dey
    lda (zp_src),y
    sta (zp_dst),y
    dey
    lda (zp_src),y
    sta (zp_dst),y
    dey
    lda (zp_src),y
    sta (zp_dst),y
    dey
    lda (zp_src),y
    sta (zp_dst),y
    dey
    lda (zp_src),y
    sta (zp_dst),y
    dey
    lda (zp_src),y
    sta (zp_dst),y
    rts
}

;--------------------------------------------------------------
; irq_top — upper border (raster 1)
;   • Apply nextD016 every frame (fine-scroll XSCROLL).
;   • On coarsePhase == 2: atomically swap $D018 and raster-chase
;     rows 0..18 of the new color matrix to $D800.
;   • Chain to irq_bottom (raster 251).
;--------------------------------------------------------------
irq_top: {
    +irq_start(end)

    lda nextD016
    sta $d016

    lda coarsePhase
    cmp #2
    bne skip_top_commit
    lda nextD018
    sta $d018
    jsr commit_colors_top
    lda #0
    sta coarsePhase
skip_top_commit:

    lda #1
    sta vsyncFlag
    +irq_end(irq_bottom, irq_bottom_line)
end:
}

;--------------------------------------------------------------
; irq_bottom — lower border (raster 251)
;   • On coarsePhase == 1: commit bottom 6 rows (19..24) to $D800.
;   • Chain back to irq_top (raster 1).
;--------------------------------------------------------------
irq_bottom: {
    +irq_start(end)

    lda coarsePhase
    cmp #1
    bne skip_bot_commit
    jsr commit_colors_bottom
    lda #2
    sta coarsePhase
skip_bot_commit:
    +irq_end(irq_top, irq_top_line)
end:
}

;--------------------------------------------------------------
; Variables
;--------------------------------------------------------------
vsyncFlag:      !byte 0
nextD016:       !byte $c7    ; 38-col + XSCROLL=7
nextD018:       !byte D018_A
scrollFine:     !byte 7
scrollCol:      !byte 0
delayCounter:   !byte 1
scrollSpeed:    !byte SCROLL_SPEED
paused:         !byte 0
muteFlag:       !byte 0
keySpacePrev:   !byte 0
keyMPrev:       !byte 0
keyPlusPrev:    !byte 0
keyMinusPrev:   !byte 0
keyRowState:    !byte 0
displayBuf:     !byte 0
workBufOffset:  !byte 0
coarsePhase:    !byte 0     ; 0=idle, 1=lower commits bottom, 2=upper swaps + commits top
scrollDir:      !byte 0     ; 0=forward/right, 1=reverse/left (used by pingpong mode)
* = music_load
sid_data:

!byte $4C,$D1,$10,$4C,$0A,$11,$4C,$DB,$10,$4C,$06,$11,$B9,$6A,$15,$4C
!byte $19,$10,$A8,$A9,$00,$9D,$47,$14,$98,$9D,$1E,$14,$BD,$0D,$14,$9D
!byte $1D,$14,$60,$9D,$20,$14,$A9,$00,$9D,$49,$14,$60,$9D,$22,$14,$A9
!byte $00,$9D,$23,$14,$60,$A8,$B9,$F3,$15,$8D,$06,$14,$B9,$FA,$15,$8D
!byte $07,$14,$A9,$00,$8D,$34,$14,$8D,$3B,$14,$8D,$42,$14,$60,$DE,$48
!byte $14,$4C,$93,$12,$F0,$FB,$BD,$48,$14,$D0,$F3,$A9,$00,$85,$FC,$BD
!byte $47,$14,$30,$09,$D9,$F3,$15,$90,$05,$F0,$02,$49,$FF,$18,$69,$02
!byte $9D,$47,$14,$4A,$90,$2E,$B0,$43,$98,$F0,$50,$B9,$F3,$15,$85,$FC
!byte $BD,$1D,$14,$C9,$02,$90,$1D,$F0,$32,$BC,$36,$14,$BD,$4A,$14,$F9
!byte $71,$14,$48,$BD,$4B,$14,$F9,$D1,$14,$A8,$68,$B0,$17,$65,$FB,$98
!byte $65,$FC,$10,$27,$BD,$4A,$14,$65,$FB,$9D,$4A,$14,$BD,$4B,$14,$65
!byte $FC,$4C,$90,$12,$E5,$FB,$98,$E5,$FC,$30,$10,$BD,$4A,$14,$E5,$FB
!byte $9D,$4A,$14,$BD,$4B,$14,$E5,$FC,$4C,$90,$12,$BC,$36,$14,$4C,$82
!byte $12,$8D,$D6,$10,$0A,$69,$00,$8D,$0D,$11,$60,$8D,$FC,$10,$8C,$01
!byte $11,$BD,$5E,$14,$F0,$10,$98,$DD,$60,$14,$90,$19,$D0,$08,$AD,$FC
!byte $10,$DD,$5F,$14,$90,$0F,$A9,$01,$9D,$5E,$14,$A9,$00,$9D,$5F,$14
!byte $A9,$00,$9D,$60,$14,$60,$8D,$4A,$11,$60,$A2,$00,$A0,$00,$30,$32
!byte $8A,$A2,$29,$9D,$08,$14,$CA,$10,$FA,$8D,$15,$D4,$8D,$43,$11,$8E
!byte $0D,$11,$AA,$20,$2D,$11,$A2,$07,$20,$2D,$11,$A2,$0E,$98,$C8,$9D
!byte $32,$14,$A9,$05,$9D,$34,$14,$A9,$01,$9D,$35,$14,$9D,$37,$14,$4C
!byte $7E,$13,$A9,$00,$8D,$17,$D4,$A9,$00,$09,$0F,$8D,$18,$D4,$20,$58
!byte $11,$A2,$07,$20,$58,$11,$A2,$0E,$DE,$35,$14,$F0,$2B,$10,$15,$BD
!byte $34,$14,$C9,$02,$B0,$0B,$A8,$49,$01,$9D,$34,$14,$B9,$06,$14,$E9
!byte $00,$9D,$35,$14,$4C,$2C,$12,$E9,$D0,$FE,$0A,$14,$DD,$0A,$14,$D0
!byte $4C,$A9,$00,$9D,$0A,$14,$F0,$40,$BC,$0D,$14,$B9,$F1,$13,$8D,$21
!byte $12,$8D,$2A,$12,$BD,$0B,$14,$D0,$34,$BC,$32,$14,$B9,$31,$15,$85
!byte $FB,$B9,$37,$15,$85,$FC,$BC,$08,$14,$B1,$FB,$C9,$FF,$90,$06,$C8
!byte $B1,$FB,$A8,$B1,$FB,$C9,$E0,$90,$08,$E9,$F0,$9D,$09,$14,$C8,$B1
!byte $FB,$C9,$D0,$B0,$B2,$9D,$33,$14,$C8,$98,$9D,$08,$14,$BC,$37,$14
!byte $BD,$1F,$14,$F0,$51,$38,$E9,$60,$9D,$36,$14,$A9,$00,$9D,$1D,$14
!byte $9D,$1F,$14,$B9,$6E,$15,$9D,$48,$14,$B9,$6A,$15,$9D,$1E,$14,$BD
!byte $0D,$14,$C9,$03,$F0,$30,$A9,$09,$9D,$21,$14,$FE,$38,$14,$B9,$66
!byte $15,$F0,$08,$9D,$22,$14,$A9,$00,$9D,$23,$14,$B9,$62,$15,$9D,$20
!byte $14,$B9,$5E,$15,$9D,$5D,$14,$B9,$5A,$15,$9D,$5C,$14,$BD,$0E,$14
!byte $20,$0C,$10,$4C,$58,$13,$BD,$0E,$14,$20,$0C,$10,$BC,$20,$14,$F0
!byte $30,$B9,$72,$15,$C9,$10,$B0,$0A,$DD,$49,$14,$F0,$0A,$FE,$49,$14
!byte $D0,$1F,$E9,$10,$9D,$21,$14,$B9,$73,$15,$C9,$FF,$C8,$98,$90,$04
!byte $18,$B9,$94,$15,$9D,$20,$14,$A9,$00,$9D,$49,$14,$B9,$93,$15,$D0
!byte $19,$BD,$35,$14,$F0,$30,$BC,$1D,$14,$B9,$01,$14,$8D,$78,$12,$BC
!byte $1E,$14,$B9,$FA,$15,$85,$FB,$4C,$54,$10,$10,$05,$7D,$36,$14,$29
!byte $7F,$A8,$A9,$00,$9D,$47,$14,$B9,$71,$14,$9D,$4A,$14,$B9,$D1,$14
!byte $9D,$4B,$14,$BD,$35,$14,$C9,$02,$F0,$43,$BC,$22,$14,$F0,$3B,$1D
!byte $0B,$14,$F0,$36,$BD,$23,$14,$D0,$11,$B9,$B6,$15,$10,$09,$B9,$D4
!byte $15,$9D,$4C,$14,$4C,$CB,$12,$9D,$23,$14,$BD,$4C,$14,$18,$79,$D4
!byte $15,$69,$00,$9D,$4C,$14,$DE,$23,$14,$D0,$0F,$B9,$B7,$15,$C9,$FF
!byte $C8,$98,$90,$03,$B9,$D4,$15,$9D,$22,$14,$4C,$58,$13,$BC,$33,$14
!byte $B9,$3D,$15,$85,$FB,$B9,$4C,$15,$85,$FC,$BC,$0B,$14,$B1,$FB,$C9
!byte $40,$90,$18,$C9,$60,$90,$1E,$C9,$C0,$90,$2E,$BD,$0C,$14,$D0,$02
!byte $B1,$FB,$69,$00,$9D,$0C,$14,$F0,$46,$D0,$4D,$9D,$37,$14,$C8,$B1
!byte $FB,$C9,$60,$B0,$14,$C9,$50,$29,$0F,$9D,$0D,$14,$F0,$06,$C8,$B1
!byte $FB,$9D,$0E,$14,$B0,$29,$C8,$B1,$FB,$C9,$BD,$90,$06,$F0,$20,$09
!byte $F0,$D0,$19,$7D,$09,$14,$9D,$1F,$14,$BD,$0D,$14,$C9,$03,$F0,$0F
!byte $A9,$00,$9D,$5D,$14,$A9,$2F,$9D,$5C,$14,$A9,$FE,$9D,$38,$14,$C8
!byte $B1,$FB,$F0,$01,$98,$9D,$0B,$14,$BC,$5E,$14,$D0,$2B,$BD,$5C,$14
!byte $9D,$05,$D4,$BD,$5D,$14,$9D,$06,$D4,$BD,$4C,$14,$9D,$02,$D4,$9D
!byte $03,$D4,$BD,$4A,$14,$9D,$00,$D4,$BD,$4B,$14,$9D,$01,$D4,$BD,$21
!byte $14,$3D,$38,$14,$9D,$04,$D4,$60,$BD,$5F,$14,$85,$FB,$BD,$60,$14
!byte $85,$FC,$A9,$FE,$9D,$38,$14,$A9,$00,$9D,$20,$14,$FE,$5E,$14,$C0
!byte $02,$F0,$0A,$B0,$26,$9D,$06,$D4,$9D,$05,$D4,$90,$C5,$A8,$B1,$FB
!byte $9D,$05,$D4,$C8,$B1,$FB,$9D,$06,$D4,$C8,$B1,$FB,$9D,$02,$D4,$9D
!byte $03,$D4,$A9,$09,$9D,$21,$14,$9D,$04,$D4,$60,$B1,$FB,$D0,$05,$9D
!byte $5E,$14,$F0,$F0,$A8,$B9,$F1,$13,$9D,$00,$D4,$B9,$51,$14,$9D,$01
!byte $D4,$BC,$5E,$14,$B1,$FB,$F0,$E2,$C9,$82,$B0,$DE,$FE,$5E,$14,$90
!byte $D3,$0C,$12,$12,$19,$19,$23,$23,$23,$23,$2C,$35,$35,$35,$35,$35
!byte $44,$54,$7B,$7B,$78,$5B,$08,$05,$00,$00,$00,$00,$00,$00,$00,$00
!byte $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
!byte $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
!byte $00,$00,$00,$00,$00,$00,$00,$01,$FE,$01,$00,$00,$00,$00,$01,$FE
!byte $02,$00,$00,$00,$00,$01,$FE,$00,$00,$00,$00,$00,$00,$00,$00,$00
!byte $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
!byte $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
!byte $00,$17,$27,$39,$4B,$5F,$74,$8A,$A1,$BA,$D4,$F0,$0E,$2D,$4E,$71
!byte $96,$BE,$E8,$14,$43,$74,$A9,$E1,$1C,$5A,$9C,$E2,$2D,$7C,$CF,$28
!byte $85,$E8,$52,$C1,$37,$B4,$39,$C5,$5A,$F7,$9E,$4F,$0A,$D1,$A3,$82
!byte $6E,$68,$71,$8A,$B3,$EE,$3C,$9E,$15,$A2,$46,$04,$DC,$D0,$E2,$14
!byte $67,$DD,$79,$3C,$29,$44,$8D,$08,$B8,$A1,$C5,$28,$CD,$BA,$F1,$78
!byte $53,$87,$1A,$10,$71,$42,$89,$4F,$9B,$74,$E2,$F0,$A6,$0E,$33,$20
!byte $FF,$01,$01,$01,$01,$01,$01,$01,$01,$01,$01,$01,$02,$02,$02,$02
!byte $02,$02,$02,$03,$03,$03,$03,$03,$04,$04,$04,$04,$05,$05,$05,$06
!byte $06,$06,$07,$07,$08,$08,$09,$09,$0A,$0A,$0B,$0C,$0D,$0D,$0E,$0F
!byte $10,$11,$12,$13,$14,$15,$17,$18,$1A,$1B,$1D,$1F,$20,$22,$24,$27
!byte $29,$2B,$2E,$31,$34,$37,$3A,$3E,$41,$45,$49,$4E,$52,$57,$5C,$62
!byte $68,$6E,$75,$7C,$83,$8B,$93,$9C,$A5,$AF,$B9,$C4,$D0,$DD,$EA,$F8
!byte $FF,$01,$0F,$1D,$23,$26,$29,$16,$16,$16,$16,$16,$16,$2C,$64,$AC
!byte $BC,$DA,$F6,$1A,$3E,$62,$83,$FF,$42,$85,$A6,$E9,$16,$16,$16,$16
!byte $16,$16,$17,$17,$17,$17,$17,$18,$18,$18,$18,$79,$3A,$8E,$0F,$30
!byte $00,$0A,$F0,$01,$06,$06,$08,$01,$00,$01,$01,$00,$00,$02,$00,$00
!byte $00,$0E,$00,$51,$0A,$31,$06,$FF,$21,$FF,$21,$00,$00,$00,$20,$0C
!byte $91,$90,$08,$91,$90,$04,$91,$31,$91,$90,$91,$90,$0B,$91,$90,$02
!byte $05,$91,$90,$04,$FF,$80,$80,$80,$80,$01,$80,$00,$26,$23,$20,$1E
!byte $00,$80,$5F,$5A,$80,$5F,$80,$80,$20,$26,$30,$80,$6C,$5C,$80,$5C
!byte $80,$80,$80,$5C,$80,$30,$08,$80,$20,$0F,$20,$0F,$FF,$80,$20,$0F
!byte $20,$0F,$FF,$80,$20,$0F,$20,$0F,$FF,$80,$30,$0F,$30,$0F,$FF,$80
!byte $20,$0F,$20,$0F,$FF,$08,$EF,$00,$10,$00,$02,$07,$EF,$00,$10,$00
!byte $08,$06,$DF,$00,$DF,$00,$02,$05,$30,$00,$CF,$00,$14,$04,$40,$00
!byte $AF,$00,$1A,$00,$00,$03,$00,$0C,$00,$00,$00,$A0,$2F,$64,$06,$20
!byte $40,$F0,$00,$D1,$03,$04,$00,$D1,$03,$08,$09,$D1,$0B,$FF,$00,$F0
!byte $01,$D1,$05,$06,$01,$D1,$05,$07,$0A,$D1,$0C,$FF,$00,$F0,$02,$D1
!byte $02,$FF,$00,$0E,$FF,$00,$0D,$FF,$00,$02,$FF,$00,$01,$40,$78,$FD
!byte $84,$FD,$49,$07,$84,$50,$FE,$82,$FD,$49,$0D,$78,$50,$FE,$84,$FD
!byte $49,$13,$7F,$50,$FE,$80,$FD,$49,$19,$78,$50,$FE,$84,$FD,$49,$13
!byte $84,$50,$FE,$82,$FD,$49,$0D,$78,$50,$FE,$84,$FD,$49,$07,$7F,$50
!byte $FE,$80,$FD,$00,$50,$BD,$01,$7F,$FD,$8B,$FD,$49,$07,$89,$50,$FE
!byte $87,$BD,$59,$0D,$50,$49,$0D,$7F,$50,$FE,$87,$BD,$59,$13,$50,$49
!byte $13,$86,$50,$FE,$84,$BD,$59,$19,$50,$49,$19,$7F,$50,$FE,$8B,$BD
!byte $59,$13,$50,$49,$13,$89,$50,$FE,$87,$BD,$59,$0D,$50,$49,$0D,$7F
!byte $50,$FE,$87,$FD,$49,$07,$86,$50,$FE,$84,$BD,$00,$04,$4E,$04,$90
!byte $50,$F2,$84,$F2,$84,$84,$E3,$48,$0E,$88,$50,$00,$01,$4E,$04,$78
!byte $50,$FE,$84,$FD,$49,$07,$81,$50,$FE,$7E,$FD,$49,$0D,$78,$50,$FE
!byte $84,$FD,$49,$13,$81,$50,$FE,$7E,$FD,$00,$01,$40,$7F,$FD,$8B,$FD
!byte $49,$07,$86,$50,$FE,$7A,$FD,$49,$0D,$7F,$50,$FE,$8B,$FD,$49,$13
!byte $7F,$50,$FE,$86,$FD,$00,$5F,$08,$50,$01,$7E,$FD,$87,$FD,$49,$07
!byte $86,$50,$FE,$84,$BD,$59,$0D,$50,$49,$0D,$7F,$50,$FE,$87,$BD,$59
!byte $13,$50,$49,$13,$86,$50,$FE,$84,$BD,$00,$5F,$08,$50,$01,$86,$FD
!byte $8E,$FD,$49,$07,$8D,$50,$FE,$8B,$BD,$59,$0D,$50,$49,$0D,$86,$50
!byte $FE,$8E,$BD,$59,$13,$50,$49,$13,$8F,$50,$FE,$89,$BD,$00,$01,$40
!byte $7F,$FD,$8B,$FD,$49,$07,$86,$50,$FE,$7A,$FD,$49,$0D,$7F,$50,$59
!byte $0D,$50,$8B,$FD,$03,$49,$13,$9D,$50,$49,$13,$9E,$50,$A0,$BD,$A3
!byte $BD,$00,$5E,$04,$50,$01,$86,$FD,$8E,$BD,$59,$07,$50,$8D,$FD,$8B
!byte $BD,$59,$0D,$50,$86,$FD,$8E,$BD,$49,$13,$81,$50,$89,$BD,$88,$BD
!byte $8B,$BD,$00,$01,$4E,$04,$7A,$50,$81,$BD,$86,$BD,$89,$BD,$49,$07
!byte $81,$50,$49,$07,$88,$50,$49,$07,$75,$50,$49,$07,$82,$50,$49,$0D
!byte $7A,$50,$49,$0D,$81,$50,$49,$0D,$86,$50,$49,$0D,$89,$50,$49,$13
!byte $81,$50,$49,$13,$88,$50,$49,$13,$75,$50,$49,$13,$82,$50,$49,$19
!byte $7B,$50,$49,$19,$82,$50,$49,$19,$87,$50,$49,$19,$8B,$50,$49,$13
!byte $82,$50,$49,$13,$89,$50,$49,$13,$76,$50,$49,$13,$82,$50,$49,$0D
!byte $7B,$50,$49,$0D,$82,$50,$49,$0D,$87,$50,$49,$0D,$8B,$50,$49,$07
!byte $82,$50,$49,$07,$89,$50,$49,$07,$76,$50,$49,$07,$82,$50,$00,$03
!byte $41,$01,$A3,$43,$00,$A5,$50,$FD,$43,$00,$9E,$50,$FD,$BE,$FE,$A1
!byte $43,$00,$A3,$51,$01,$43,$00,$A5,$50,$FD,$43,$00,$A8,$50,$FD,$BE
!byte $FE,$A7,$BD,$43,$00,$A6,$50,$FC,$43,$00,$9F,$50,$FD,$BE,$FE,$A3
!byte $43,$00,$A5,$43,$03,$A6,$50,$FC,$43,$00,$AA,$50,$FD,$BE,$FE,$A6
!byte $BD,$00,$01,$40,$7D,$BD,$84,$BD,$89,$BD,$8D,$BD,$84,$BD,$8B,$BD
!byte $78,$BD,$84,$BD,$7A,$BD,$81,$BD,$86,$BD,$89,$BD,$7A,$BD,$88,$BD
!byte $81,$BD,$7A,$BD,$7D,$BD,$84,$BD,$89,$BD,$8D,$BD,$84,$BD,$8B,$BD
!byte $78,$BD,$84,$BD,$7A,$BD,$81,$BD,$86,$BD,$89,$BD,$7A,$BD,$88,$BD
!byte $81,$BD,$7A,$BD,$00,$03,$40,$A5,$F3,$A0,$BD,$51,$05,$BD,$43,$05
!byte $A1,$50,$F6,$43,$00,$97,$50,$41,$06,$97,$43,$06,$99,$50,$F5,$94
!byte $BD,$95,$F5,$BE,$FD,$00,$02,$40,$A5,$BE,$99,$BE,$99,$BE,$99,$BE
!byte $A5,$BE,$99,$BE,$99,$BE,$99,$BE,$A5,$BE,$99,$BE,$99,$BE,$99,$BE
!byte $A5,$BE,$99,$BE,$99,$BE,$99,$BE,$A5,$BE,$99,$BE,$99,$BE,$99,$BE
!byte $A5,$BE,$99,$BE,$99,$BE,$99,$BE,$A5,$BE,$99,$BE,$99,$BE,$99,$BE
!byte $A5,$BE,$99,$BE,$99,$BE,$99,$BE,$00,$50,$C1,$00

;--------------------------------------------------------------
; Source data (uncompressed, 160 cols × 25 rows)
;--------------------------------------------------------------
* = $2000
screen_data:

!byte $08,$30,$30,$30,$30,$30,$30,$30,$30,$30,$31,$31,$31,$31,$31,$31,$31,$31,$31,$31,$32,$32,$32,$32,$32,$32,$32,$32,$32,$32,$33,$33,$33,$33,$33,$33,$33,$33,$33,$33,$34,$34,$34,$34,$34,$34,$34,$34,$34,$34,$35,$35,$35,$35,$35,$35,$35,$35,$35,$35,$36,$36,$36,$36,$36,$36,$36,$36,$36,$36,$37,$37,$37,$37,$37,$37,$37,$37,$37,$37,$08,$30,$30,$30,$30,$30,$30,$30,$30,$30,$31,$31,$31,$31,$31,$31,$31,$31,$31,$31,$32,$32,$32,$32,$32,$32,$32,$32,$32,$32,$33,$33,$33,$33,$33,$33,$33,$33,$33,$33
!byte $13,$31,$32,$33,$34,$35,$36,$37,$38,$39,$30,$31,$32,$33,$34,$35,$36,$37,$38,$39,$30,$31,$32,$33,$34,$35,$36,$37,$38,$39,$30,$31,$32,$33,$34,$35,$36,$37,$38,$39,$30,$31,$32,$33,$34,$35,$36,$37,$38,$39,$30,$31,$32,$33,$34,$35,$36,$37,$38,$39,$30,$31,$32,$33,$34,$35,$36,$37,$38,$39,$30,$31,$32,$33,$34,$35,$36,$37,$38,$39,$13,$31,$32,$33,$34,$35,$36,$37,$38,$39,$30,$31,$32,$33,$34,$35,$36,$37,$38,$39,$30,$31,$32,$33,$34,$35,$36,$37,$38,$39,$30,$31,$32,$33,$34,$35,$36,$37,$38,$39
!byte $03,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$03,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0
!byte $12,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$12,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0
!byte $0F,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$0F,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0
!byte $0C,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$0C,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0
!byte $0C,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$0C,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0
!byte $2D,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$2D,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0
!byte $17,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$17,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0
!byte $12,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$12,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0
!byte $01,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$01,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0
!byte $10,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$10,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0
!byte $20,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$20,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0
!byte $20,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$20,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0
!byte $20,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$20,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0
!byte $20,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$20,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0
!byte $20,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$20,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0
!byte $20,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$20,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0
!byte $20,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$20,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0
!byte $20,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$20,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0
!byte $20,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$20,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0
!byte $20,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$20,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0
!byte $20,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$20,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0
!byte $20,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$20,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0
!byte $20,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$20,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0

color_data:

!byte $00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07
!byte $00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07
!byte $00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07
!byte $00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07
!byte $00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07
!byte $00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07
!byte $00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07
!byte $00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07
!byte $00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07
!byte $00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07
!byte $00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07
!byte $00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07
!byte $00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07
!byte $00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07
!byte $00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07
!byte $00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07
!byte $00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07
!byte $00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07
!byte $00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07
!byte $00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07
!byte $00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07
!byte $00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07
!byte $00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07
!byte $00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07
!byte $00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07,$08,$09,$0A,$0B,$0C,$0D,$0E,$0F,$00,$01,$02,$03,$04,$05,$06,$07

;--------------------------------------------------------------
; Color commit routines — placed after source data to avoid char
; buffer B at $0C00. Each row uses an indirect source pointer (base
; from src_col_row_lo/hi[X] + scrollCol) and an abs-Y destination
; at $D800 + row*40. Inner 40-byte body fully unrolled (12 cyc/byte).
;--------------------------------------------------------------
commit_colors_top: {
    ldx #0
    lda src_col_row_lo,x
    clc
    adc scrollCol
    sta zp_cmt_src
    lda src_col_row_hi,x
    adc #0
    sta zp_cmt_src+1
    inx
    ldy #39
    lda (zp_cmt_src),y
    sta $D800,y
    dey
    lda (zp_cmt_src),y
    sta $D800,y
    dey
    lda (zp_cmt_src),y
    sta $D800,y
    dey
    lda (zp_cmt_src),y
    sta $D800,y
    dey
    lda (zp_cmt_src),y
    sta $D800,y
    dey
    lda (zp_cmt_src),y
    sta $D800,y
    dey
    lda (zp_cmt_src),y
    sta $D800,y
    dey
    lda (zp_cmt_src),y
    sta $D800,y
    dey
    lda (zp_cmt_src),y
    sta $D800,y
    dey
    lda (zp_cmt_src),y
    sta $D800,y
    dey
    lda (zp_cmt_src),y
    sta $D800,y
    dey
    lda (zp_cmt_src),y
    sta $D800,y
    dey
    lda (zp_cmt_src),y
    sta $D800,y
    dey
    lda (zp_cmt_src),y
    sta $D800,y
    dey
    lda (zp_cmt_src),y
    sta $D800,y
    dey
    lda (zp_cmt_src),y
    sta $D800,y
    dey
    lda (zp_cmt_src),y
    sta $D800,y
    dey
    lda (zp_cmt_src),y
    sta $D800,y
    dey
    lda (zp_cmt_src),y
    sta $D800,y
    dey
    lda (zp_cmt_src),y
    sta $D800,y
    dey
    lda (zp_cmt_src),y
    sta $D800,y
    dey
    lda (zp_cmt_src),y
    sta $D800,y
    dey
    lda (zp_cmt_src),y
    sta $D800,y
    dey
    lda (zp_cmt_src),y
    sta $D800,y
    dey
    lda (zp_cmt_src),y
    sta $D800,y
    dey
    lda (zp_cmt_src),y
    sta $D800,y
    dey
    lda (zp_cmt_src),y
    sta $D800,y
    dey
    lda (zp_cmt_src),y
    sta $D800,y
    dey
    lda (zp_cmt_src),y
    sta $D800,y
    dey
    lda (zp_cmt_src),y
    sta $D800,y
    dey
    lda (zp_cmt_src),y
    sta $D800,y
    dey
    lda (zp_cmt_src),y
    sta $D800,y
    dey
    lda (zp_cmt_src),y
    sta $D800,y
    dey
    lda (zp_cmt_src),y
    sta $D800,y
    dey
    lda (zp_cmt_src),y
    sta $D800,y
    dey
    lda (zp_cmt_src),y
    sta $D800,y
    dey
    lda (zp_cmt_src),y
    sta $D800,y
    dey
    lda (zp_cmt_src),y
    sta $D800,y
    dey
    lda (zp_cmt_src),y
    sta $D800,y
    dey
    lda (zp_cmt_src),y
    sta $D800,y
    lda src_col_row_lo,x
    clc
    adc scrollCol
    sta zp_cmt_src
    lda src_col_row_hi,x
    adc #0
    sta zp_cmt_src+1
    inx
    ldy #39
    lda (zp_cmt_src),y
    sta $D828,y
    dey
    lda (zp_cmt_src),y
    sta $D828,y
    dey
    lda (zp_cmt_src),y
    sta $D828,y
    dey
    lda (zp_cmt_src),y
    sta $D828,y
    dey
    lda (zp_cmt_src),y
    sta $D828,y
    dey
    lda (zp_cmt_src),y
    sta $D828,y
    dey
    lda (zp_cmt_src),y
    sta $D828,y
    dey
    lda (zp_cmt_src),y
    sta $D828,y
    dey
    lda (zp_cmt_src),y
    sta $D828,y
    dey
    lda (zp_cmt_src),y
    sta $D828,y
    dey
    lda (zp_cmt_src),y
    sta $D828,y
    dey
    lda (zp_cmt_src),y
    sta $D828,y
    dey
    lda (zp_cmt_src),y
    sta $D828,y
    dey
    lda (zp_cmt_src),y
    sta $D828,y
    dey
    lda (zp_cmt_src),y
    sta $D828,y
    dey
    lda (zp_cmt_src),y
    sta $D828,y
    dey
    lda (zp_cmt_src),y
    sta $D828,y
    dey
    lda (zp_cmt_src),y
    sta $D828,y
    dey
    lda (zp_cmt_src),y
    sta $D828,y
    dey
    lda (zp_cmt_src),y
    sta $D828,y
    dey
    lda (zp_cmt_src),y
    sta $D828,y
    dey
    lda (zp_cmt_src),y
    sta $D828,y
    dey
    lda (zp_cmt_src),y
    sta $D828,y
    dey
    lda (zp_cmt_src),y
    sta $D828,y
    dey
    lda (zp_cmt_src),y
    sta $D828,y
    dey
    lda (zp_cmt_src),y
    sta $D828,y
    dey
    lda (zp_cmt_src),y
    sta $D828,y
    dey
    lda (zp_cmt_src),y
    sta $D828,y
    dey
    lda (zp_cmt_src),y
    sta $D828,y
    dey
    lda (zp_cmt_src),y
    sta $D828,y
    dey
    lda (zp_cmt_src),y
    sta $D828,y
    dey
    lda (zp_cmt_src),y
    sta $D828,y
    dey
    lda (zp_cmt_src),y
    sta $D828,y
    dey
    lda (zp_cmt_src),y
    sta $D828,y
    dey
    lda (zp_cmt_src),y
    sta $D828,y
    dey
    lda (zp_cmt_src),y
    sta $D828,y
    dey
    lda (zp_cmt_src),y
    sta $D828,y
    dey
    lda (zp_cmt_src),y
    sta $D828,y
    dey
    lda (zp_cmt_src),y
    sta $D828,y
    dey
    lda (zp_cmt_src),y
    sta $D828,y
    lda src_col_row_lo,x
    clc
    adc scrollCol
    sta zp_cmt_src
    lda src_col_row_hi,x
    adc #0
    sta zp_cmt_src+1
    inx
    ldy #39
    lda (zp_cmt_src),y
    sta $D850,y
    dey
    lda (zp_cmt_src),y
    sta $D850,y
    dey
    lda (zp_cmt_src),y
    sta $D850,y
    dey
    lda (zp_cmt_src),y
    sta $D850,y
    dey
    lda (zp_cmt_src),y
    sta $D850,y
    dey
    lda (zp_cmt_src),y
    sta $D850,y
    dey
    lda (zp_cmt_src),y
    sta $D850,y
    dey
    lda (zp_cmt_src),y
    sta $D850,y
    dey
    lda (zp_cmt_src),y
    sta $D850,y
    dey
    lda (zp_cmt_src),y
    sta $D850,y
    dey
    lda (zp_cmt_src),y
    sta $D850,y
    dey
    lda (zp_cmt_src),y
    sta $D850,y
    dey
    lda (zp_cmt_src),y
    sta $D850,y
    dey
    lda (zp_cmt_src),y
    sta $D850,y
    dey
    lda (zp_cmt_src),y
    sta $D850,y
    dey
    lda (zp_cmt_src),y
    sta $D850,y
    dey
    lda (zp_cmt_src),y
    sta $D850,y
    dey
    lda (zp_cmt_src),y
    sta $D850,y
    dey
    lda (zp_cmt_src),y
    sta $D850,y
    dey
    lda (zp_cmt_src),y
    sta $D850,y
    dey
    lda (zp_cmt_src),y
    sta $D850,y
    dey
    lda (zp_cmt_src),y
    sta $D850,y
    dey
    lda (zp_cmt_src),y
    sta $D850,y
    dey
    lda (zp_cmt_src),y
    sta $D850,y
    dey
    lda (zp_cmt_src),y
    sta $D850,y
    dey
    lda (zp_cmt_src),y
    sta $D850,y
    dey
    lda (zp_cmt_src),y
    sta $D850,y
    dey
    lda (zp_cmt_src),y
    sta $D850,y
    dey
    lda (zp_cmt_src),y
    sta $D850,y
    dey
    lda (zp_cmt_src),y
    sta $D850,y
    dey
    lda (zp_cmt_src),y
    sta $D850,y
    dey
    lda (zp_cmt_src),y
    sta $D850,y
    dey
    lda (zp_cmt_src),y
    sta $D850,y
    dey
    lda (zp_cmt_src),y
    sta $D850,y
    dey
    lda (zp_cmt_src),y
    sta $D850,y
    dey
    lda (zp_cmt_src),y
    sta $D850,y
    dey
    lda (zp_cmt_src),y
    sta $D850,y
    dey
    lda (zp_cmt_src),y
    sta $D850,y
    dey
    lda (zp_cmt_src),y
    sta $D850,y
    dey
    lda (zp_cmt_src),y
    sta $D850,y
    lda src_col_row_lo,x
    clc
    adc scrollCol
    sta zp_cmt_src
    lda src_col_row_hi,x
    adc #0
    sta zp_cmt_src+1
    inx
    ldy #39
    lda (zp_cmt_src),y
    sta $D878,y
    dey
    lda (zp_cmt_src),y
    sta $D878,y
    dey
    lda (zp_cmt_src),y
    sta $D878,y
    dey
    lda (zp_cmt_src),y
    sta $D878,y
    dey
    lda (zp_cmt_src),y
    sta $D878,y
    dey
    lda (zp_cmt_src),y
    sta $D878,y
    dey
    lda (zp_cmt_src),y
    sta $D878,y
    dey
    lda (zp_cmt_src),y
    sta $D878,y
    dey
    lda (zp_cmt_src),y
    sta $D878,y
    dey
    lda (zp_cmt_src),y
    sta $D878,y
    dey
    lda (zp_cmt_src),y
    sta $D878,y
    dey
    lda (zp_cmt_src),y
    sta $D878,y
    dey
    lda (zp_cmt_src),y
    sta $D878,y
    dey
    lda (zp_cmt_src),y
    sta $D878,y
    dey
    lda (zp_cmt_src),y
    sta $D878,y
    dey
    lda (zp_cmt_src),y
    sta $D878,y
    dey
    lda (zp_cmt_src),y
    sta $D878,y
    dey
    lda (zp_cmt_src),y
    sta $D878,y
    dey
    lda (zp_cmt_src),y
    sta $D878,y
    dey
    lda (zp_cmt_src),y
    sta $D878,y
    dey
    lda (zp_cmt_src),y
    sta $D878,y
    dey
    lda (zp_cmt_src),y
    sta $D878,y
    dey
    lda (zp_cmt_src),y
    sta $D878,y
    dey
    lda (zp_cmt_src),y
    sta $D878,y
    dey
    lda (zp_cmt_src),y
    sta $D878,y
    dey
    lda (zp_cmt_src),y
    sta $D878,y
    dey
    lda (zp_cmt_src),y
    sta $D878,y
    dey
    lda (zp_cmt_src),y
    sta $D878,y
    dey
    lda (zp_cmt_src),y
    sta $D878,y
    dey
    lda (zp_cmt_src),y
    sta $D878,y
    dey
    lda (zp_cmt_src),y
    sta $D878,y
    dey
    lda (zp_cmt_src),y
    sta $D878,y
    dey
    lda (zp_cmt_src),y
    sta $D878,y
    dey
    lda (zp_cmt_src),y
    sta $D878,y
    dey
    lda (zp_cmt_src),y
    sta $D878,y
    dey
    lda (zp_cmt_src),y
    sta $D878,y
    dey
    lda (zp_cmt_src),y
    sta $D878,y
    dey
    lda (zp_cmt_src),y
    sta $D878,y
    dey
    lda (zp_cmt_src),y
    sta $D878,y
    dey
    lda (zp_cmt_src),y
    sta $D878,y
    lda src_col_row_lo,x
    clc
    adc scrollCol
    sta zp_cmt_src
    lda src_col_row_hi,x
    adc #0
    sta zp_cmt_src+1
    inx
    ldy #39
    lda (zp_cmt_src),y
    sta $D8A0,y
    dey
    lda (zp_cmt_src),y
    sta $D8A0,y
    dey
    lda (zp_cmt_src),y
    sta $D8A0,y
    dey
    lda (zp_cmt_src),y
    sta $D8A0,y
    dey
    lda (zp_cmt_src),y
    sta $D8A0,y
    dey
    lda (zp_cmt_src),y
    sta $D8A0,y
    dey
    lda (zp_cmt_src),y
    sta $D8A0,y
    dey
    lda (zp_cmt_src),y
    sta $D8A0,y
    dey
    lda (zp_cmt_src),y
    sta $D8A0,y
    dey
    lda (zp_cmt_src),y
    sta $D8A0,y
    dey
    lda (zp_cmt_src),y
    sta $D8A0,y
    dey
    lda (zp_cmt_src),y
    sta $D8A0,y
    dey
    lda (zp_cmt_src),y
    sta $D8A0,y
    dey
    lda (zp_cmt_src),y
    sta $D8A0,y
    dey
    lda (zp_cmt_src),y
    sta $D8A0,y
    dey
    lda (zp_cmt_src),y
    sta $D8A0,y
    dey
    lda (zp_cmt_src),y
    sta $D8A0,y
    dey
    lda (zp_cmt_src),y
    sta $D8A0,y
    dey
    lda (zp_cmt_src),y
    sta $D8A0,y
    dey
    lda (zp_cmt_src),y
    sta $D8A0,y
    dey
    lda (zp_cmt_src),y
    sta $D8A0,y
    dey
    lda (zp_cmt_src),y
    sta $D8A0,y
    dey
    lda (zp_cmt_src),y
    sta $D8A0,y
    dey
    lda (zp_cmt_src),y
    sta $D8A0,y
    dey
    lda (zp_cmt_src),y
    sta $D8A0,y
    dey
    lda (zp_cmt_src),y
    sta $D8A0,y
    dey
    lda (zp_cmt_src),y
    sta $D8A0,y
    dey
    lda (zp_cmt_src),y
    sta $D8A0,y
    dey
    lda (zp_cmt_src),y
    sta $D8A0,y
    dey
    lda (zp_cmt_src),y
    sta $D8A0,y
    dey
    lda (zp_cmt_src),y
    sta $D8A0,y
    dey
    lda (zp_cmt_src),y
    sta $D8A0,y
    dey
    lda (zp_cmt_src),y
    sta $D8A0,y
    dey
    lda (zp_cmt_src),y
    sta $D8A0,y
    dey
    lda (zp_cmt_src),y
    sta $D8A0,y
    dey
    lda (zp_cmt_src),y
    sta $D8A0,y
    dey
    lda (zp_cmt_src),y
    sta $D8A0,y
    dey
    lda (zp_cmt_src),y
    sta $D8A0,y
    dey
    lda (zp_cmt_src),y
    sta $D8A0,y
    dey
    lda (zp_cmt_src),y
    sta $D8A0,y
    lda src_col_row_lo,x
    clc
    adc scrollCol
    sta zp_cmt_src
    lda src_col_row_hi,x
    adc #0
    sta zp_cmt_src+1
    inx
    ldy #39
    lda (zp_cmt_src),y
    sta $D8C8,y
    dey
    lda (zp_cmt_src),y
    sta $D8C8,y
    dey
    lda (zp_cmt_src),y
    sta $D8C8,y
    dey
    lda (zp_cmt_src),y
    sta $D8C8,y
    dey
    lda (zp_cmt_src),y
    sta $D8C8,y
    dey
    lda (zp_cmt_src),y
    sta $D8C8,y
    dey
    lda (zp_cmt_src),y
    sta $D8C8,y
    dey
    lda (zp_cmt_src),y
    sta $D8C8,y
    dey
    lda (zp_cmt_src),y
    sta $D8C8,y
    dey
    lda (zp_cmt_src),y
    sta $D8C8,y
    dey
    lda (zp_cmt_src),y
    sta $D8C8,y
    dey
    lda (zp_cmt_src),y
    sta $D8C8,y
    dey
    lda (zp_cmt_src),y
    sta $D8C8,y
    dey
    lda (zp_cmt_src),y
    sta $D8C8,y
    dey
    lda (zp_cmt_src),y
    sta $D8C8,y
    dey
    lda (zp_cmt_src),y
    sta $D8C8,y
    dey
    lda (zp_cmt_src),y
    sta $D8C8,y
    dey
    lda (zp_cmt_src),y
    sta $D8C8,y
    dey
    lda (zp_cmt_src),y
    sta $D8C8,y
    dey
    lda (zp_cmt_src),y
    sta $D8C8,y
    dey
    lda (zp_cmt_src),y
    sta $D8C8,y
    dey
    lda (zp_cmt_src),y
    sta $D8C8,y
    dey
    lda (zp_cmt_src),y
    sta $D8C8,y
    dey
    lda (zp_cmt_src),y
    sta $D8C8,y
    dey
    lda (zp_cmt_src),y
    sta $D8C8,y
    dey
    lda (zp_cmt_src),y
    sta $D8C8,y
    dey
    lda (zp_cmt_src),y
    sta $D8C8,y
    dey
    lda (zp_cmt_src),y
    sta $D8C8,y
    dey
    lda (zp_cmt_src),y
    sta $D8C8,y
    dey
    lda (zp_cmt_src),y
    sta $D8C8,y
    dey
    lda (zp_cmt_src),y
    sta $D8C8,y
    dey
    lda (zp_cmt_src),y
    sta $D8C8,y
    dey
    lda (zp_cmt_src),y
    sta $D8C8,y
    dey
    lda (zp_cmt_src),y
    sta $D8C8,y
    dey
    lda (zp_cmt_src),y
    sta $D8C8,y
    dey
    lda (zp_cmt_src),y
    sta $D8C8,y
    dey
    lda (zp_cmt_src),y
    sta $D8C8,y
    dey
    lda (zp_cmt_src),y
    sta $D8C8,y
    dey
    lda (zp_cmt_src),y
    sta $D8C8,y
    dey
    lda (zp_cmt_src),y
    sta $D8C8,y
    lda src_col_row_lo,x
    clc
    adc scrollCol
    sta zp_cmt_src
    lda src_col_row_hi,x
    adc #0
    sta zp_cmt_src+1
    inx
    ldy #39
    lda (zp_cmt_src),y
    sta $D8F0,y
    dey
    lda (zp_cmt_src),y
    sta $D8F0,y
    dey
    lda (zp_cmt_src),y
    sta $D8F0,y
    dey
    lda (zp_cmt_src),y
    sta $D8F0,y
    dey
    lda (zp_cmt_src),y
    sta $D8F0,y
    dey
    lda (zp_cmt_src),y
    sta $D8F0,y
    dey
    lda (zp_cmt_src),y
    sta $D8F0,y
    dey
    lda (zp_cmt_src),y
    sta $D8F0,y
    dey
    lda (zp_cmt_src),y
    sta $D8F0,y
    dey
    lda (zp_cmt_src),y
    sta $D8F0,y
    dey
    lda (zp_cmt_src),y
    sta $D8F0,y
    dey
    lda (zp_cmt_src),y
    sta $D8F0,y
    dey
    lda (zp_cmt_src),y
    sta $D8F0,y
    dey
    lda (zp_cmt_src),y
    sta $D8F0,y
    dey
    lda (zp_cmt_src),y
    sta $D8F0,y
    dey
    lda (zp_cmt_src),y
    sta $D8F0,y
    dey
    lda (zp_cmt_src),y
    sta $D8F0,y
    dey
    lda (zp_cmt_src),y
    sta $D8F0,y
    dey
    lda (zp_cmt_src),y
    sta $D8F0,y
    dey
    lda (zp_cmt_src),y
    sta $D8F0,y
    dey
    lda (zp_cmt_src),y
    sta $D8F0,y
    dey
    lda (zp_cmt_src),y
    sta $D8F0,y
    dey
    lda (zp_cmt_src),y
    sta $D8F0,y
    dey
    lda (zp_cmt_src),y
    sta $D8F0,y
    dey
    lda (zp_cmt_src),y
    sta $D8F0,y
    dey
    lda (zp_cmt_src),y
    sta $D8F0,y
    dey
    lda (zp_cmt_src),y
    sta $D8F0,y
    dey
    lda (zp_cmt_src),y
    sta $D8F0,y
    dey
    lda (zp_cmt_src),y
    sta $D8F0,y
    dey
    lda (zp_cmt_src),y
    sta $D8F0,y
    dey
    lda (zp_cmt_src),y
    sta $D8F0,y
    dey
    lda (zp_cmt_src),y
    sta $D8F0,y
    dey
    lda (zp_cmt_src),y
    sta $D8F0,y
    dey
    lda (zp_cmt_src),y
    sta $D8F0,y
    dey
    lda (zp_cmt_src),y
    sta $D8F0,y
    dey
    lda (zp_cmt_src),y
    sta $D8F0,y
    dey
    lda (zp_cmt_src),y
    sta $D8F0,y
    dey
    lda (zp_cmt_src),y
    sta $D8F0,y
    dey
    lda (zp_cmt_src),y
    sta $D8F0,y
    dey
    lda (zp_cmt_src),y
    sta $D8F0,y
    lda src_col_row_lo,x
    clc
    adc scrollCol
    sta zp_cmt_src
    lda src_col_row_hi,x
    adc #0
    sta zp_cmt_src+1
    inx
    ldy #39
    lda (zp_cmt_src),y
    sta $D918,y
    dey
    lda (zp_cmt_src),y
    sta $D918,y
    dey
    lda (zp_cmt_src),y
    sta $D918,y
    dey
    lda (zp_cmt_src),y
    sta $D918,y
    dey
    lda (zp_cmt_src),y
    sta $D918,y
    dey
    lda (zp_cmt_src),y
    sta $D918,y
    dey
    lda (zp_cmt_src),y
    sta $D918,y
    dey
    lda (zp_cmt_src),y
    sta $D918,y
    dey
    lda (zp_cmt_src),y
    sta $D918,y
    dey
    lda (zp_cmt_src),y
    sta $D918,y
    dey
    lda (zp_cmt_src),y
    sta $D918,y
    dey
    lda (zp_cmt_src),y
    sta $D918,y
    dey
    lda (zp_cmt_src),y
    sta $D918,y
    dey
    lda (zp_cmt_src),y
    sta $D918,y
    dey
    lda (zp_cmt_src),y
    sta $D918,y
    dey
    lda (zp_cmt_src),y
    sta $D918,y
    dey
    lda (zp_cmt_src),y
    sta $D918,y
    dey
    lda (zp_cmt_src),y
    sta $D918,y
    dey
    lda (zp_cmt_src),y
    sta $D918,y
    dey
    lda (zp_cmt_src),y
    sta $D918,y
    dey
    lda (zp_cmt_src),y
    sta $D918,y
    dey
    lda (zp_cmt_src),y
    sta $D918,y
    dey
    lda (zp_cmt_src),y
    sta $D918,y
    dey
    lda (zp_cmt_src),y
    sta $D918,y
    dey
    lda (zp_cmt_src),y
    sta $D918,y
    dey
    lda (zp_cmt_src),y
    sta $D918,y
    dey
    lda (zp_cmt_src),y
    sta $D918,y
    dey
    lda (zp_cmt_src),y
    sta $D918,y
    dey
    lda (zp_cmt_src),y
    sta $D918,y
    dey
    lda (zp_cmt_src),y
    sta $D918,y
    dey
    lda (zp_cmt_src),y
    sta $D918,y
    dey
    lda (zp_cmt_src),y
    sta $D918,y
    dey
    lda (zp_cmt_src),y
    sta $D918,y
    dey
    lda (zp_cmt_src),y
    sta $D918,y
    dey
    lda (zp_cmt_src),y
    sta $D918,y
    dey
    lda (zp_cmt_src),y
    sta $D918,y
    dey
    lda (zp_cmt_src),y
    sta $D918,y
    dey
    lda (zp_cmt_src),y
    sta $D918,y
    dey
    lda (zp_cmt_src),y
    sta $D918,y
    dey
    lda (zp_cmt_src),y
    sta $D918,y
    lda src_col_row_lo,x
    clc
    adc scrollCol
    sta zp_cmt_src
    lda src_col_row_hi,x
    adc #0
    sta zp_cmt_src+1
    inx
    ldy #39
    lda (zp_cmt_src),y
    sta $D940,y
    dey
    lda (zp_cmt_src),y
    sta $D940,y
    dey
    lda (zp_cmt_src),y
    sta $D940,y
    dey
    lda (zp_cmt_src),y
    sta $D940,y
    dey
    lda (zp_cmt_src),y
    sta $D940,y
    dey
    lda (zp_cmt_src),y
    sta $D940,y
    dey
    lda (zp_cmt_src),y
    sta $D940,y
    dey
    lda (zp_cmt_src),y
    sta $D940,y
    dey
    lda (zp_cmt_src),y
    sta $D940,y
    dey
    lda (zp_cmt_src),y
    sta $D940,y
    dey
    lda (zp_cmt_src),y
    sta $D940,y
    dey
    lda (zp_cmt_src),y
    sta $D940,y
    dey
    lda (zp_cmt_src),y
    sta $D940,y
    dey
    lda (zp_cmt_src),y
    sta $D940,y
    dey
    lda (zp_cmt_src),y
    sta $D940,y
    dey
    lda (zp_cmt_src),y
    sta $D940,y
    dey
    lda (zp_cmt_src),y
    sta $D940,y
    dey
    lda (zp_cmt_src),y
    sta $D940,y
    dey
    lda (zp_cmt_src),y
    sta $D940,y
    dey
    lda (zp_cmt_src),y
    sta $D940,y
    dey
    lda (zp_cmt_src),y
    sta $D940,y
    dey
    lda (zp_cmt_src),y
    sta $D940,y
    dey
    lda (zp_cmt_src),y
    sta $D940,y
    dey
    lda (zp_cmt_src),y
    sta $D940,y
    dey
    lda (zp_cmt_src),y
    sta $D940,y
    dey
    lda (zp_cmt_src),y
    sta $D940,y
    dey
    lda (zp_cmt_src),y
    sta $D940,y
    dey
    lda (zp_cmt_src),y
    sta $D940,y
    dey
    lda (zp_cmt_src),y
    sta $D940,y
    dey
    lda (zp_cmt_src),y
    sta $D940,y
    dey
    lda (zp_cmt_src),y
    sta $D940,y
    dey
    lda (zp_cmt_src),y
    sta $D940,y
    dey
    lda (zp_cmt_src),y
    sta $D940,y
    dey
    lda (zp_cmt_src),y
    sta $D940,y
    dey
    lda (zp_cmt_src),y
    sta $D940,y
    dey
    lda (zp_cmt_src),y
    sta $D940,y
    dey
    lda (zp_cmt_src),y
    sta $D940,y
    dey
    lda (zp_cmt_src),y
    sta $D940,y
    dey
    lda (zp_cmt_src),y
    sta $D940,y
    dey
    lda (zp_cmt_src),y
    sta $D940,y
    lda src_col_row_lo,x
    clc
    adc scrollCol
    sta zp_cmt_src
    lda src_col_row_hi,x
    adc #0
    sta zp_cmt_src+1
    inx
    ldy #39
    lda (zp_cmt_src),y
    sta $D968,y
    dey
    lda (zp_cmt_src),y
    sta $D968,y
    dey
    lda (zp_cmt_src),y
    sta $D968,y
    dey
    lda (zp_cmt_src),y
    sta $D968,y
    dey
    lda (zp_cmt_src),y
    sta $D968,y
    dey
    lda (zp_cmt_src),y
    sta $D968,y
    dey
    lda (zp_cmt_src),y
    sta $D968,y
    dey
    lda (zp_cmt_src),y
    sta $D968,y
    dey
    lda (zp_cmt_src),y
    sta $D968,y
    dey
    lda (zp_cmt_src),y
    sta $D968,y
    dey
    lda (zp_cmt_src),y
    sta $D968,y
    dey
    lda (zp_cmt_src),y
    sta $D968,y
    dey
    lda (zp_cmt_src),y
    sta $D968,y
    dey
    lda (zp_cmt_src),y
    sta $D968,y
    dey
    lda (zp_cmt_src),y
    sta $D968,y
    dey
    lda (zp_cmt_src),y
    sta $D968,y
    dey
    lda (zp_cmt_src),y
    sta $D968,y
    dey
    lda (zp_cmt_src),y
    sta $D968,y
    dey
    lda (zp_cmt_src),y
    sta $D968,y
    dey
    lda (zp_cmt_src),y
    sta $D968,y
    dey
    lda (zp_cmt_src),y
    sta $D968,y
    dey
    lda (zp_cmt_src),y
    sta $D968,y
    dey
    lda (zp_cmt_src),y
    sta $D968,y
    dey
    lda (zp_cmt_src),y
    sta $D968,y
    dey
    lda (zp_cmt_src),y
    sta $D968,y
    dey
    lda (zp_cmt_src),y
    sta $D968,y
    dey
    lda (zp_cmt_src),y
    sta $D968,y
    dey
    lda (zp_cmt_src),y
    sta $D968,y
    dey
    lda (zp_cmt_src),y
    sta $D968,y
    dey
    lda (zp_cmt_src),y
    sta $D968,y
    dey
    lda (zp_cmt_src),y
    sta $D968,y
    dey
    lda (zp_cmt_src),y
    sta $D968,y
    dey
    lda (zp_cmt_src),y
    sta $D968,y
    dey
    lda (zp_cmt_src),y
    sta $D968,y
    dey
    lda (zp_cmt_src),y
    sta $D968,y
    dey
    lda (zp_cmt_src),y
    sta $D968,y
    dey
    lda (zp_cmt_src),y
    sta $D968,y
    dey
    lda (zp_cmt_src),y
    sta $D968,y
    dey
    lda (zp_cmt_src),y
    sta $D968,y
    dey
    lda (zp_cmt_src),y
    sta $D968,y
    lda src_col_row_lo,x
    clc
    adc scrollCol
    sta zp_cmt_src
    lda src_col_row_hi,x
    adc #0
    sta zp_cmt_src+1
    inx
    ldy #39
    lda (zp_cmt_src),y
    sta $D990,y
    dey
    lda (zp_cmt_src),y
    sta $D990,y
    dey
    lda (zp_cmt_src),y
    sta $D990,y
    dey
    lda (zp_cmt_src),y
    sta $D990,y
    dey
    lda (zp_cmt_src),y
    sta $D990,y
    dey
    lda (zp_cmt_src),y
    sta $D990,y
    dey
    lda (zp_cmt_src),y
    sta $D990,y
    dey
    lda (zp_cmt_src),y
    sta $D990,y
    dey
    lda (zp_cmt_src),y
    sta $D990,y
    dey
    lda (zp_cmt_src),y
    sta $D990,y
    dey
    lda (zp_cmt_src),y
    sta $D990,y
    dey
    lda (zp_cmt_src),y
    sta $D990,y
    dey
    lda (zp_cmt_src),y
    sta $D990,y
    dey
    lda (zp_cmt_src),y
    sta $D990,y
    dey
    lda (zp_cmt_src),y
    sta $D990,y
    dey
    lda (zp_cmt_src),y
    sta $D990,y
    dey
    lda (zp_cmt_src),y
    sta $D990,y
    dey
    lda (zp_cmt_src),y
    sta $D990,y
    dey
    lda (zp_cmt_src),y
    sta $D990,y
    dey
    lda (zp_cmt_src),y
    sta $D990,y
    dey
    lda (zp_cmt_src),y
    sta $D990,y
    dey
    lda (zp_cmt_src),y
    sta $D990,y
    dey
    lda (zp_cmt_src),y
    sta $D990,y
    dey
    lda (zp_cmt_src),y
    sta $D990,y
    dey
    lda (zp_cmt_src),y
    sta $D990,y
    dey
    lda (zp_cmt_src),y
    sta $D990,y
    dey
    lda (zp_cmt_src),y
    sta $D990,y
    dey
    lda (zp_cmt_src),y
    sta $D990,y
    dey
    lda (zp_cmt_src),y
    sta $D990,y
    dey
    lda (zp_cmt_src),y
    sta $D990,y
    dey
    lda (zp_cmt_src),y
    sta $D990,y
    dey
    lda (zp_cmt_src),y
    sta $D990,y
    dey
    lda (zp_cmt_src),y
    sta $D990,y
    dey
    lda (zp_cmt_src),y
    sta $D990,y
    dey
    lda (zp_cmt_src),y
    sta $D990,y
    dey
    lda (zp_cmt_src),y
    sta $D990,y
    dey
    lda (zp_cmt_src),y
    sta $D990,y
    dey
    lda (zp_cmt_src),y
    sta $D990,y
    dey
    lda (zp_cmt_src),y
    sta $D990,y
    dey
    lda (zp_cmt_src),y
    sta $D990,y
    lda src_col_row_lo,x
    clc
    adc scrollCol
    sta zp_cmt_src
    lda src_col_row_hi,x
    adc #0
    sta zp_cmt_src+1
    inx
    ldy #39
    lda (zp_cmt_src),y
    sta $D9B8,y
    dey
    lda (zp_cmt_src),y
    sta $D9B8,y
    dey
    lda (zp_cmt_src),y
    sta $D9B8,y
    dey
    lda (zp_cmt_src),y
    sta $D9B8,y
    dey
    lda (zp_cmt_src),y
    sta $D9B8,y
    dey
    lda (zp_cmt_src),y
    sta $D9B8,y
    dey
    lda (zp_cmt_src),y
    sta $D9B8,y
    dey
    lda (zp_cmt_src),y
    sta $D9B8,y
    dey
    lda (zp_cmt_src),y
    sta $D9B8,y
    dey
    lda (zp_cmt_src),y
    sta $D9B8,y
    dey
    lda (zp_cmt_src),y
    sta $D9B8,y
    dey
    lda (zp_cmt_src),y
    sta $D9B8,y
    dey
    lda (zp_cmt_src),y
    sta $D9B8,y
    dey
    lda (zp_cmt_src),y
    sta $D9B8,y
    dey
    lda (zp_cmt_src),y
    sta $D9B8,y
    dey
    lda (zp_cmt_src),y
    sta $D9B8,y
    dey
    lda (zp_cmt_src),y
    sta $D9B8,y
    dey
    lda (zp_cmt_src),y
    sta $D9B8,y
    dey
    lda (zp_cmt_src),y
    sta $D9B8,y
    dey
    lda (zp_cmt_src),y
    sta $D9B8,y
    dey
    lda (zp_cmt_src),y
    sta $D9B8,y
    dey
    lda (zp_cmt_src),y
    sta $D9B8,y
    dey
    lda (zp_cmt_src),y
    sta $D9B8,y
    dey
    lda (zp_cmt_src),y
    sta $D9B8,y
    dey
    lda (zp_cmt_src),y
    sta $D9B8,y
    dey
    lda (zp_cmt_src),y
    sta $D9B8,y
    dey
    lda (zp_cmt_src),y
    sta $D9B8,y
    dey
    lda (zp_cmt_src),y
    sta $D9B8,y
    dey
    lda (zp_cmt_src),y
    sta $D9B8,y
    dey
    lda (zp_cmt_src),y
    sta $D9B8,y
    dey
    lda (zp_cmt_src),y
    sta $D9B8,y
    dey
    lda (zp_cmt_src),y
    sta $D9B8,y
    dey
    lda (zp_cmt_src),y
    sta $D9B8,y
    dey
    lda (zp_cmt_src),y
    sta $D9B8,y
    dey
    lda (zp_cmt_src),y
    sta $D9B8,y
    dey
    lda (zp_cmt_src),y
    sta $D9B8,y
    dey
    lda (zp_cmt_src),y
    sta $D9B8,y
    dey
    lda (zp_cmt_src),y
    sta $D9B8,y
    dey
    lda (zp_cmt_src),y
    sta $D9B8,y
    dey
    lda (zp_cmt_src),y
    sta $D9B8,y
    lda src_col_row_lo,x
    clc
    adc scrollCol
    sta zp_cmt_src
    lda src_col_row_hi,x
    adc #0
    sta zp_cmt_src+1
    inx
    ldy #39
    lda (zp_cmt_src),y
    sta $D9E0,y
    dey
    lda (zp_cmt_src),y
    sta $D9E0,y
    dey
    lda (zp_cmt_src),y
    sta $D9E0,y
    dey
    lda (zp_cmt_src),y
    sta $D9E0,y
    dey
    lda (zp_cmt_src),y
    sta $D9E0,y
    dey
    lda (zp_cmt_src),y
    sta $D9E0,y
    dey
    lda (zp_cmt_src),y
    sta $D9E0,y
    dey
    lda (zp_cmt_src),y
    sta $D9E0,y
    dey
    lda (zp_cmt_src),y
    sta $D9E0,y
    dey
    lda (zp_cmt_src),y
    sta $D9E0,y
    dey
    lda (zp_cmt_src),y
    sta $D9E0,y
    dey
    lda (zp_cmt_src),y
    sta $D9E0,y
    dey
    lda (zp_cmt_src),y
    sta $D9E0,y
    dey
    lda (zp_cmt_src),y
    sta $D9E0,y
    dey
    lda (zp_cmt_src),y
    sta $D9E0,y
    dey
    lda (zp_cmt_src),y
    sta $D9E0,y
    dey
    lda (zp_cmt_src),y
    sta $D9E0,y
    dey
    lda (zp_cmt_src),y
    sta $D9E0,y
    dey
    lda (zp_cmt_src),y
    sta $D9E0,y
    dey
    lda (zp_cmt_src),y
    sta $D9E0,y
    dey
    lda (zp_cmt_src),y
    sta $D9E0,y
    dey
    lda (zp_cmt_src),y
    sta $D9E0,y
    dey
    lda (zp_cmt_src),y
    sta $D9E0,y
    dey
    lda (zp_cmt_src),y
    sta $D9E0,y
    dey
    lda (zp_cmt_src),y
    sta $D9E0,y
    dey
    lda (zp_cmt_src),y
    sta $D9E0,y
    dey
    lda (zp_cmt_src),y
    sta $D9E0,y
    dey
    lda (zp_cmt_src),y
    sta $D9E0,y
    dey
    lda (zp_cmt_src),y
    sta $D9E0,y
    dey
    lda (zp_cmt_src),y
    sta $D9E0,y
    dey
    lda (zp_cmt_src),y
    sta $D9E0,y
    dey
    lda (zp_cmt_src),y
    sta $D9E0,y
    dey
    lda (zp_cmt_src),y
    sta $D9E0,y
    dey
    lda (zp_cmt_src),y
    sta $D9E0,y
    dey
    lda (zp_cmt_src),y
    sta $D9E0,y
    dey
    lda (zp_cmt_src),y
    sta $D9E0,y
    dey
    lda (zp_cmt_src),y
    sta $D9E0,y
    dey
    lda (zp_cmt_src),y
    sta $D9E0,y
    dey
    lda (zp_cmt_src),y
    sta $D9E0,y
    dey
    lda (zp_cmt_src),y
    sta $D9E0,y
    lda src_col_row_lo,x
    clc
    adc scrollCol
    sta zp_cmt_src
    lda src_col_row_hi,x
    adc #0
    sta zp_cmt_src+1
    inx
    ldy #39
    lda (zp_cmt_src),y
    sta $DA08,y
    dey
    lda (zp_cmt_src),y
    sta $DA08,y
    dey
    lda (zp_cmt_src),y
    sta $DA08,y
    dey
    lda (zp_cmt_src),y
    sta $DA08,y
    dey
    lda (zp_cmt_src),y
    sta $DA08,y
    dey
    lda (zp_cmt_src),y
    sta $DA08,y
    dey
    lda (zp_cmt_src),y
    sta $DA08,y
    dey
    lda (zp_cmt_src),y
    sta $DA08,y
    dey
    lda (zp_cmt_src),y
    sta $DA08,y
    dey
    lda (zp_cmt_src),y
    sta $DA08,y
    dey
    lda (zp_cmt_src),y
    sta $DA08,y
    dey
    lda (zp_cmt_src),y
    sta $DA08,y
    dey
    lda (zp_cmt_src),y
    sta $DA08,y
    dey
    lda (zp_cmt_src),y
    sta $DA08,y
    dey
    lda (zp_cmt_src),y
    sta $DA08,y
    dey
    lda (zp_cmt_src),y
    sta $DA08,y
    dey
    lda (zp_cmt_src),y
    sta $DA08,y
    dey
    lda (zp_cmt_src),y
    sta $DA08,y
    dey
    lda (zp_cmt_src),y
    sta $DA08,y
    dey
    lda (zp_cmt_src),y
    sta $DA08,y
    dey
    lda (zp_cmt_src),y
    sta $DA08,y
    dey
    lda (zp_cmt_src),y
    sta $DA08,y
    dey
    lda (zp_cmt_src),y
    sta $DA08,y
    dey
    lda (zp_cmt_src),y
    sta $DA08,y
    dey
    lda (zp_cmt_src),y
    sta $DA08,y
    dey
    lda (zp_cmt_src),y
    sta $DA08,y
    dey
    lda (zp_cmt_src),y
    sta $DA08,y
    dey
    lda (zp_cmt_src),y
    sta $DA08,y
    dey
    lda (zp_cmt_src),y
    sta $DA08,y
    dey
    lda (zp_cmt_src),y
    sta $DA08,y
    dey
    lda (zp_cmt_src),y
    sta $DA08,y
    dey
    lda (zp_cmt_src),y
    sta $DA08,y
    dey
    lda (zp_cmt_src),y
    sta $DA08,y
    dey
    lda (zp_cmt_src),y
    sta $DA08,y
    dey
    lda (zp_cmt_src),y
    sta $DA08,y
    dey
    lda (zp_cmt_src),y
    sta $DA08,y
    dey
    lda (zp_cmt_src),y
    sta $DA08,y
    dey
    lda (zp_cmt_src),y
    sta $DA08,y
    dey
    lda (zp_cmt_src),y
    sta $DA08,y
    dey
    lda (zp_cmt_src),y
    sta $DA08,y
    lda src_col_row_lo,x
    clc
    adc scrollCol
    sta zp_cmt_src
    lda src_col_row_hi,x
    adc #0
    sta zp_cmt_src+1
    inx
    ldy #39
    lda (zp_cmt_src),y
    sta $DA30,y
    dey
    lda (zp_cmt_src),y
    sta $DA30,y
    dey
    lda (zp_cmt_src),y
    sta $DA30,y
    dey
    lda (zp_cmt_src),y
    sta $DA30,y
    dey
    lda (zp_cmt_src),y
    sta $DA30,y
    dey
    lda (zp_cmt_src),y
    sta $DA30,y
    dey
    lda (zp_cmt_src),y
    sta $DA30,y
    dey
    lda (zp_cmt_src),y
    sta $DA30,y
    dey
    lda (zp_cmt_src),y
    sta $DA30,y
    dey
    lda (zp_cmt_src),y
    sta $DA30,y
    dey
    lda (zp_cmt_src),y
    sta $DA30,y
    dey
    lda (zp_cmt_src),y
    sta $DA30,y
    dey
    lda (zp_cmt_src),y
    sta $DA30,y
    dey
    lda (zp_cmt_src),y
    sta $DA30,y
    dey
    lda (zp_cmt_src),y
    sta $DA30,y
    dey
    lda (zp_cmt_src),y
    sta $DA30,y
    dey
    lda (zp_cmt_src),y
    sta $DA30,y
    dey
    lda (zp_cmt_src),y
    sta $DA30,y
    dey
    lda (zp_cmt_src),y
    sta $DA30,y
    dey
    lda (zp_cmt_src),y
    sta $DA30,y
    dey
    lda (zp_cmt_src),y
    sta $DA30,y
    dey
    lda (zp_cmt_src),y
    sta $DA30,y
    dey
    lda (zp_cmt_src),y
    sta $DA30,y
    dey
    lda (zp_cmt_src),y
    sta $DA30,y
    dey
    lda (zp_cmt_src),y
    sta $DA30,y
    dey
    lda (zp_cmt_src),y
    sta $DA30,y
    dey
    lda (zp_cmt_src),y
    sta $DA30,y
    dey
    lda (zp_cmt_src),y
    sta $DA30,y
    dey
    lda (zp_cmt_src),y
    sta $DA30,y
    dey
    lda (zp_cmt_src),y
    sta $DA30,y
    dey
    lda (zp_cmt_src),y
    sta $DA30,y
    dey
    lda (zp_cmt_src),y
    sta $DA30,y
    dey
    lda (zp_cmt_src),y
    sta $DA30,y
    dey
    lda (zp_cmt_src),y
    sta $DA30,y
    dey
    lda (zp_cmt_src),y
    sta $DA30,y
    dey
    lda (zp_cmt_src),y
    sta $DA30,y
    dey
    lda (zp_cmt_src),y
    sta $DA30,y
    dey
    lda (zp_cmt_src),y
    sta $DA30,y
    dey
    lda (zp_cmt_src),y
    sta $DA30,y
    dey
    lda (zp_cmt_src),y
    sta $DA30,y
    lda src_col_row_lo,x
    clc
    adc scrollCol
    sta zp_cmt_src
    lda src_col_row_hi,x
    adc #0
    sta zp_cmt_src+1
    inx
    ldy #39
    lda (zp_cmt_src),y
    sta $DA58,y
    dey
    lda (zp_cmt_src),y
    sta $DA58,y
    dey
    lda (zp_cmt_src),y
    sta $DA58,y
    dey
    lda (zp_cmt_src),y
    sta $DA58,y
    dey
    lda (zp_cmt_src),y
    sta $DA58,y
    dey
    lda (zp_cmt_src),y
    sta $DA58,y
    dey
    lda (zp_cmt_src),y
    sta $DA58,y
    dey
    lda (zp_cmt_src),y
    sta $DA58,y
    dey
    lda (zp_cmt_src),y
    sta $DA58,y
    dey
    lda (zp_cmt_src),y
    sta $DA58,y
    dey
    lda (zp_cmt_src),y
    sta $DA58,y
    dey
    lda (zp_cmt_src),y
    sta $DA58,y
    dey
    lda (zp_cmt_src),y
    sta $DA58,y
    dey
    lda (zp_cmt_src),y
    sta $DA58,y
    dey
    lda (zp_cmt_src),y
    sta $DA58,y
    dey
    lda (zp_cmt_src),y
    sta $DA58,y
    dey
    lda (zp_cmt_src),y
    sta $DA58,y
    dey
    lda (zp_cmt_src),y
    sta $DA58,y
    dey
    lda (zp_cmt_src),y
    sta $DA58,y
    dey
    lda (zp_cmt_src),y
    sta $DA58,y
    dey
    lda (zp_cmt_src),y
    sta $DA58,y
    dey
    lda (zp_cmt_src),y
    sta $DA58,y
    dey
    lda (zp_cmt_src),y
    sta $DA58,y
    dey
    lda (zp_cmt_src),y
    sta $DA58,y
    dey
    lda (zp_cmt_src),y
    sta $DA58,y
    dey
    lda (zp_cmt_src),y
    sta $DA58,y
    dey
    lda (zp_cmt_src),y
    sta $DA58,y
    dey
    lda (zp_cmt_src),y
    sta $DA58,y
    dey
    lda (zp_cmt_src),y
    sta $DA58,y
    dey
    lda (zp_cmt_src),y
    sta $DA58,y
    dey
    lda (zp_cmt_src),y
    sta $DA58,y
    dey
    lda (zp_cmt_src),y
    sta $DA58,y
    dey
    lda (zp_cmt_src),y
    sta $DA58,y
    dey
    lda (zp_cmt_src),y
    sta $DA58,y
    dey
    lda (zp_cmt_src),y
    sta $DA58,y
    dey
    lda (zp_cmt_src),y
    sta $DA58,y
    dey
    lda (zp_cmt_src),y
    sta $DA58,y
    dey
    lda (zp_cmt_src),y
    sta $DA58,y
    dey
    lda (zp_cmt_src),y
    sta $DA58,y
    dey
    lda (zp_cmt_src),y
    sta $DA58,y
    lda src_col_row_lo,x
    clc
    adc scrollCol
    sta zp_cmt_src
    lda src_col_row_hi,x
    adc #0
    sta zp_cmt_src+1
    inx
    ldy #39
    lda (zp_cmt_src),y
    sta $DA80,y
    dey
    lda (zp_cmt_src),y
    sta $DA80,y
    dey
    lda (zp_cmt_src),y
    sta $DA80,y
    dey
    lda (zp_cmt_src),y
    sta $DA80,y
    dey
    lda (zp_cmt_src),y
    sta $DA80,y
    dey
    lda (zp_cmt_src),y
    sta $DA80,y
    dey
    lda (zp_cmt_src),y
    sta $DA80,y
    dey
    lda (zp_cmt_src),y
    sta $DA80,y
    dey
    lda (zp_cmt_src),y
    sta $DA80,y
    dey
    lda (zp_cmt_src),y
    sta $DA80,y
    dey
    lda (zp_cmt_src),y
    sta $DA80,y
    dey
    lda (zp_cmt_src),y
    sta $DA80,y
    dey
    lda (zp_cmt_src),y
    sta $DA80,y
    dey
    lda (zp_cmt_src),y
    sta $DA80,y
    dey
    lda (zp_cmt_src),y
    sta $DA80,y
    dey
    lda (zp_cmt_src),y
    sta $DA80,y
    dey
    lda (zp_cmt_src),y
    sta $DA80,y
    dey
    lda (zp_cmt_src),y
    sta $DA80,y
    dey
    lda (zp_cmt_src),y
    sta $DA80,y
    dey
    lda (zp_cmt_src),y
    sta $DA80,y
    dey
    lda (zp_cmt_src),y
    sta $DA80,y
    dey
    lda (zp_cmt_src),y
    sta $DA80,y
    dey
    lda (zp_cmt_src),y
    sta $DA80,y
    dey
    lda (zp_cmt_src),y
    sta $DA80,y
    dey
    lda (zp_cmt_src),y
    sta $DA80,y
    dey
    lda (zp_cmt_src),y
    sta $DA80,y
    dey
    lda (zp_cmt_src),y
    sta $DA80,y
    dey
    lda (zp_cmt_src),y
    sta $DA80,y
    dey
    lda (zp_cmt_src),y
    sta $DA80,y
    dey
    lda (zp_cmt_src),y
    sta $DA80,y
    dey
    lda (zp_cmt_src),y
    sta $DA80,y
    dey
    lda (zp_cmt_src),y
    sta $DA80,y
    dey
    lda (zp_cmt_src),y
    sta $DA80,y
    dey
    lda (zp_cmt_src),y
    sta $DA80,y
    dey
    lda (zp_cmt_src),y
    sta $DA80,y
    dey
    lda (zp_cmt_src),y
    sta $DA80,y
    dey
    lda (zp_cmt_src),y
    sta $DA80,y
    dey
    lda (zp_cmt_src),y
    sta $DA80,y
    dey
    lda (zp_cmt_src),y
    sta $DA80,y
    dey
    lda (zp_cmt_src),y
    sta $DA80,y
    lda src_col_row_lo,x
    clc
    adc scrollCol
    sta zp_cmt_src
    lda src_col_row_hi,x
    adc #0
    sta zp_cmt_src+1
    inx
    ldy #39
    lda (zp_cmt_src),y
    sta $DAA8,y
    dey
    lda (zp_cmt_src),y
    sta $DAA8,y
    dey
    lda (zp_cmt_src),y
    sta $DAA8,y
    dey
    lda (zp_cmt_src),y
    sta $DAA8,y
    dey
    lda (zp_cmt_src),y
    sta $DAA8,y
    dey
    lda (zp_cmt_src),y
    sta $DAA8,y
    dey
    lda (zp_cmt_src),y
    sta $DAA8,y
    dey
    lda (zp_cmt_src),y
    sta $DAA8,y
    dey
    lda (zp_cmt_src),y
    sta $DAA8,y
    dey
    lda (zp_cmt_src),y
    sta $DAA8,y
    dey
    lda (zp_cmt_src),y
    sta $DAA8,y
    dey
    lda (zp_cmt_src),y
    sta $DAA8,y
    dey
    lda (zp_cmt_src),y
    sta $DAA8,y
    dey
    lda (zp_cmt_src),y
    sta $DAA8,y
    dey
    lda (zp_cmt_src),y
    sta $DAA8,y
    dey
    lda (zp_cmt_src),y
    sta $DAA8,y
    dey
    lda (zp_cmt_src),y
    sta $DAA8,y
    dey
    lda (zp_cmt_src),y
    sta $DAA8,y
    dey
    lda (zp_cmt_src),y
    sta $DAA8,y
    dey
    lda (zp_cmt_src),y
    sta $DAA8,y
    dey
    lda (zp_cmt_src),y
    sta $DAA8,y
    dey
    lda (zp_cmt_src),y
    sta $DAA8,y
    dey
    lda (zp_cmt_src),y
    sta $DAA8,y
    dey
    lda (zp_cmt_src),y
    sta $DAA8,y
    dey
    lda (zp_cmt_src),y
    sta $DAA8,y
    dey
    lda (zp_cmt_src),y
    sta $DAA8,y
    dey
    lda (zp_cmt_src),y
    sta $DAA8,y
    dey
    lda (zp_cmt_src),y
    sta $DAA8,y
    dey
    lda (zp_cmt_src),y
    sta $DAA8,y
    dey
    lda (zp_cmt_src),y
    sta $DAA8,y
    dey
    lda (zp_cmt_src),y
    sta $DAA8,y
    dey
    lda (zp_cmt_src),y
    sta $DAA8,y
    dey
    lda (zp_cmt_src),y
    sta $DAA8,y
    dey
    lda (zp_cmt_src),y
    sta $DAA8,y
    dey
    lda (zp_cmt_src),y
    sta $DAA8,y
    dey
    lda (zp_cmt_src),y
    sta $DAA8,y
    dey
    lda (zp_cmt_src),y
    sta $DAA8,y
    dey
    lda (zp_cmt_src),y
    sta $DAA8,y
    dey
    lda (zp_cmt_src),y
    sta $DAA8,y
    dey
    lda (zp_cmt_src),y
    sta $DAA8,y
    lda src_col_row_lo,x
    clc
    adc scrollCol
    sta zp_cmt_src
    lda src_col_row_hi,x
    adc #0
    sta zp_cmt_src+1
    inx
    ldy #39
    lda (zp_cmt_src),y
    sta $DAD0,y
    dey
    lda (zp_cmt_src),y
    sta $DAD0,y
    dey
    lda (zp_cmt_src),y
    sta $DAD0,y
    dey
    lda (zp_cmt_src),y
    sta $DAD0,y
    dey
    lda (zp_cmt_src),y
    sta $DAD0,y
    dey
    lda (zp_cmt_src),y
    sta $DAD0,y
    dey
    lda (zp_cmt_src),y
    sta $DAD0,y
    dey
    lda (zp_cmt_src),y
    sta $DAD0,y
    dey
    lda (zp_cmt_src),y
    sta $DAD0,y
    dey
    lda (zp_cmt_src),y
    sta $DAD0,y
    dey
    lda (zp_cmt_src),y
    sta $DAD0,y
    dey
    lda (zp_cmt_src),y
    sta $DAD0,y
    dey
    lda (zp_cmt_src),y
    sta $DAD0,y
    dey
    lda (zp_cmt_src),y
    sta $DAD0,y
    dey
    lda (zp_cmt_src),y
    sta $DAD0,y
    dey
    lda (zp_cmt_src),y
    sta $DAD0,y
    dey
    lda (zp_cmt_src),y
    sta $DAD0,y
    dey
    lda (zp_cmt_src),y
    sta $DAD0,y
    dey
    lda (zp_cmt_src),y
    sta $DAD0,y
    dey
    lda (zp_cmt_src),y
    sta $DAD0,y
    dey
    lda (zp_cmt_src),y
    sta $DAD0,y
    dey
    lda (zp_cmt_src),y
    sta $DAD0,y
    dey
    lda (zp_cmt_src),y
    sta $DAD0,y
    dey
    lda (zp_cmt_src),y
    sta $DAD0,y
    dey
    lda (zp_cmt_src),y
    sta $DAD0,y
    dey
    lda (zp_cmt_src),y
    sta $DAD0,y
    dey
    lda (zp_cmt_src),y
    sta $DAD0,y
    dey
    lda (zp_cmt_src),y
    sta $DAD0,y
    dey
    lda (zp_cmt_src),y
    sta $DAD0,y
    dey
    lda (zp_cmt_src),y
    sta $DAD0,y
    dey
    lda (zp_cmt_src),y
    sta $DAD0,y
    dey
    lda (zp_cmt_src),y
    sta $DAD0,y
    dey
    lda (zp_cmt_src),y
    sta $DAD0,y
    dey
    lda (zp_cmt_src),y
    sta $DAD0,y
    dey
    lda (zp_cmt_src),y
    sta $DAD0,y
    dey
    lda (zp_cmt_src),y
    sta $DAD0,y
    dey
    lda (zp_cmt_src),y
    sta $DAD0,y
    dey
    lda (zp_cmt_src),y
    sta $DAD0,y
    dey
    lda (zp_cmt_src),y
    sta $DAD0,y
    dey
    lda (zp_cmt_src),y
    sta $DAD0,y
    rts
}

commit_colors_bottom: {
    ldx #19
    lda src_col_row_lo,x
    clc
    adc scrollCol
    sta zp_cmt_src
    lda src_col_row_hi,x
    adc #0
    sta zp_cmt_src+1
    inx
    ldy #39
    lda (zp_cmt_src),y
    sta $DAF8,y
    dey
    lda (zp_cmt_src),y
    sta $DAF8,y
    dey
    lda (zp_cmt_src),y
    sta $DAF8,y
    dey
    lda (zp_cmt_src),y
    sta $DAF8,y
    dey
    lda (zp_cmt_src),y
    sta $DAF8,y
    dey
    lda (zp_cmt_src),y
    sta $DAF8,y
    dey
    lda (zp_cmt_src),y
    sta $DAF8,y
    dey
    lda (zp_cmt_src),y
    sta $DAF8,y
    dey
    lda (zp_cmt_src),y
    sta $DAF8,y
    dey
    lda (zp_cmt_src),y
    sta $DAF8,y
    dey
    lda (zp_cmt_src),y
    sta $DAF8,y
    dey
    lda (zp_cmt_src),y
    sta $DAF8,y
    dey
    lda (zp_cmt_src),y
    sta $DAF8,y
    dey
    lda (zp_cmt_src),y
    sta $DAF8,y
    dey
    lda (zp_cmt_src),y
    sta $DAF8,y
    dey
    lda (zp_cmt_src),y
    sta $DAF8,y
    dey
    lda (zp_cmt_src),y
    sta $DAF8,y
    dey
    lda (zp_cmt_src),y
    sta $DAF8,y
    dey
    lda (zp_cmt_src),y
    sta $DAF8,y
    dey
    lda (zp_cmt_src),y
    sta $DAF8,y
    dey
    lda (zp_cmt_src),y
    sta $DAF8,y
    dey
    lda (zp_cmt_src),y
    sta $DAF8,y
    dey
    lda (zp_cmt_src),y
    sta $DAF8,y
    dey
    lda (zp_cmt_src),y
    sta $DAF8,y
    dey
    lda (zp_cmt_src),y
    sta $DAF8,y
    dey
    lda (zp_cmt_src),y
    sta $DAF8,y
    dey
    lda (zp_cmt_src),y
    sta $DAF8,y
    dey
    lda (zp_cmt_src),y
    sta $DAF8,y
    dey
    lda (zp_cmt_src),y
    sta $DAF8,y
    dey
    lda (zp_cmt_src),y
    sta $DAF8,y
    dey
    lda (zp_cmt_src),y
    sta $DAF8,y
    dey
    lda (zp_cmt_src),y
    sta $DAF8,y
    dey
    lda (zp_cmt_src),y
    sta $DAF8,y
    dey
    lda (zp_cmt_src),y
    sta $DAF8,y
    dey
    lda (zp_cmt_src),y
    sta $DAF8,y
    dey
    lda (zp_cmt_src),y
    sta $DAF8,y
    dey
    lda (zp_cmt_src),y
    sta $DAF8,y
    dey
    lda (zp_cmt_src),y
    sta $DAF8,y
    dey
    lda (zp_cmt_src),y
    sta $DAF8,y
    dey
    lda (zp_cmt_src),y
    sta $DAF8,y
    lda src_col_row_lo,x
    clc
    adc scrollCol
    sta zp_cmt_src
    lda src_col_row_hi,x
    adc #0
    sta zp_cmt_src+1
    inx
    ldy #39
    lda (zp_cmt_src),y
    sta $DB20,y
    dey
    lda (zp_cmt_src),y
    sta $DB20,y
    dey
    lda (zp_cmt_src),y
    sta $DB20,y
    dey
    lda (zp_cmt_src),y
    sta $DB20,y
    dey
    lda (zp_cmt_src),y
    sta $DB20,y
    dey
    lda (zp_cmt_src),y
    sta $DB20,y
    dey
    lda (zp_cmt_src),y
    sta $DB20,y
    dey
    lda (zp_cmt_src),y
    sta $DB20,y
    dey
    lda (zp_cmt_src),y
    sta $DB20,y
    dey
    lda (zp_cmt_src),y
    sta $DB20,y
    dey
    lda (zp_cmt_src),y
    sta $DB20,y
    dey
    lda (zp_cmt_src),y
    sta $DB20,y
    dey
    lda (zp_cmt_src),y
    sta $DB20,y
    dey
    lda (zp_cmt_src),y
    sta $DB20,y
    dey
    lda (zp_cmt_src),y
    sta $DB20,y
    dey
    lda (zp_cmt_src),y
    sta $DB20,y
    dey
    lda (zp_cmt_src),y
    sta $DB20,y
    dey
    lda (zp_cmt_src),y
    sta $DB20,y
    dey
    lda (zp_cmt_src),y
    sta $DB20,y
    dey
    lda (zp_cmt_src),y
    sta $DB20,y
    dey
    lda (zp_cmt_src),y
    sta $DB20,y
    dey
    lda (zp_cmt_src),y
    sta $DB20,y
    dey
    lda (zp_cmt_src),y
    sta $DB20,y
    dey
    lda (zp_cmt_src),y
    sta $DB20,y
    dey
    lda (zp_cmt_src),y
    sta $DB20,y
    dey
    lda (zp_cmt_src),y
    sta $DB20,y
    dey
    lda (zp_cmt_src),y
    sta $DB20,y
    dey
    lda (zp_cmt_src),y
    sta $DB20,y
    dey
    lda (zp_cmt_src),y
    sta $DB20,y
    dey
    lda (zp_cmt_src),y
    sta $DB20,y
    dey
    lda (zp_cmt_src),y
    sta $DB20,y
    dey
    lda (zp_cmt_src),y
    sta $DB20,y
    dey
    lda (zp_cmt_src),y
    sta $DB20,y
    dey
    lda (zp_cmt_src),y
    sta $DB20,y
    dey
    lda (zp_cmt_src),y
    sta $DB20,y
    dey
    lda (zp_cmt_src),y
    sta $DB20,y
    dey
    lda (zp_cmt_src),y
    sta $DB20,y
    dey
    lda (zp_cmt_src),y
    sta $DB20,y
    dey
    lda (zp_cmt_src),y
    sta $DB20,y
    dey
    lda (zp_cmt_src),y
    sta $DB20,y
    lda src_col_row_lo,x
    clc
    adc scrollCol
    sta zp_cmt_src
    lda src_col_row_hi,x
    adc #0
    sta zp_cmt_src+1
    inx
    ldy #39
    lda (zp_cmt_src),y
    sta $DB48,y
    dey
    lda (zp_cmt_src),y
    sta $DB48,y
    dey
    lda (zp_cmt_src),y
    sta $DB48,y
    dey
    lda (zp_cmt_src),y
    sta $DB48,y
    dey
    lda (zp_cmt_src),y
    sta $DB48,y
    dey
    lda (zp_cmt_src),y
    sta $DB48,y
    dey
    lda (zp_cmt_src),y
    sta $DB48,y
    dey
    lda (zp_cmt_src),y
    sta $DB48,y
    dey
    lda (zp_cmt_src),y
    sta $DB48,y
    dey
    lda (zp_cmt_src),y
    sta $DB48,y
    dey
    lda (zp_cmt_src),y
    sta $DB48,y
    dey
    lda (zp_cmt_src),y
    sta $DB48,y
    dey
    lda (zp_cmt_src),y
    sta $DB48,y
    dey
    lda (zp_cmt_src),y
    sta $DB48,y
    dey
    lda (zp_cmt_src),y
    sta $DB48,y
    dey
    lda (zp_cmt_src),y
    sta $DB48,y
    dey
    lda (zp_cmt_src),y
    sta $DB48,y
    dey
    lda (zp_cmt_src),y
    sta $DB48,y
    dey
    lda (zp_cmt_src),y
    sta $DB48,y
    dey
    lda (zp_cmt_src),y
    sta $DB48,y
    dey
    lda (zp_cmt_src),y
    sta $DB48,y
    dey
    lda (zp_cmt_src),y
    sta $DB48,y
    dey
    lda (zp_cmt_src),y
    sta $DB48,y
    dey
    lda (zp_cmt_src),y
    sta $DB48,y
    dey
    lda (zp_cmt_src),y
    sta $DB48,y
    dey
    lda (zp_cmt_src),y
    sta $DB48,y
    dey
    lda (zp_cmt_src),y
    sta $DB48,y
    dey
    lda (zp_cmt_src),y
    sta $DB48,y
    dey
    lda (zp_cmt_src),y
    sta $DB48,y
    dey
    lda (zp_cmt_src),y
    sta $DB48,y
    dey
    lda (zp_cmt_src),y
    sta $DB48,y
    dey
    lda (zp_cmt_src),y
    sta $DB48,y
    dey
    lda (zp_cmt_src),y
    sta $DB48,y
    dey
    lda (zp_cmt_src),y
    sta $DB48,y
    dey
    lda (zp_cmt_src),y
    sta $DB48,y
    dey
    lda (zp_cmt_src),y
    sta $DB48,y
    dey
    lda (zp_cmt_src),y
    sta $DB48,y
    dey
    lda (zp_cmt_src),y
    sta $DB48,y
    dey
    lda (zp_cmt_src),y
    sta $DB48,y
    dey
    lda (zp_cmt_src),y
    sta $DB48,y
    lda src_col_row_lo,x
    clc
    adc scrollCol
    sta zp_cmt_src
    lda src_col_row_hi,x
    adc #0
    sta zp_cmt_src+1
    inx
    ldy #39
    lda (zp_cmt_src),y
    sta $DB70,y
    dey
    lda (zp_cmt_src),y
    sta $DB70,y
    dey
    lda (zp_cmt_src),y
    sta $DB70,y
    dey
    lda (zp_cmt_src),y
    sta $DB70,y
    dey
    lda (zp_cmt_src),y
    sta $DB70,y
    dey
    lda (zp_cmt_src),y
    sta $DB70,y
    dey
    lda (zp_cmt_src),y
    sta $DB70,y
    dey
    lda (zp_cmt_src),y
    sta $DB70,y
    dey
    lda (zp_cmt_src),y
    sta $DB70,y
    dey
    lda (zp_cmt_src),y
    sta $DB70,y
    dey
    lda (zp_cmt_src),y
    sta $DB70,y
    dey
    lda (zp_cmt_src),y
    sta $DB70,y
    dey
    lda (zp_cmt_src),y
    sta $DB70,y
    dey
    lda (zp_cmt_src),y
    sta $DB70,y
    dey
    lda (zp_cmt_src),y
    sta $DB70,y
    dey
    lda (zp_cmt_src),y
    sta $DB70,y
    dey
    lda (zp_cmt_src),y
    sta $DB70,y
    dey
    lda (zp_cmt_src),y
    sta $DB70,y
    dey
    lda (zp_cmt_src),y
    sta $DB70,y
    dey
    lda (zp_cmt_src),y
    sta $DB70,y
    dey
    lda (zp_cmt_src),y
    sta $DB70,y
    dey
    lda (zp_cmt_src),y
    sta $DB70,y
    dey
    lda (zp_cmt_src),y
    sta $DB70,y
    dey
    lda (zp_cmt_src),y
    sta $DB70,y
    dey
    lda (zp_cmt_src),y
    sta $DB70,y
    dey
    lda (zp_cmt_src),y
    sta $DB70,y
    dey
    lda (zp_cmt_src),y
    sta $DB70,y
    dey
    lda (zp_cmt_src),y
    sta $DB70,y
    dey
    lda (zp_cmt_src),y
    sta $DB70,y
    dey
    lda (zp_cmt_src),y
    sta $DB70,y
    dey
    lda (zp_cmt_src),y
    sta $DB70,y
    dey
    lda (zp_cmt_src),y
    sta $DB70,y
    dey
    lda (zp_cmt_src),y
    sta $DB70,y
    dey
    lda (zp_cmt_src),y
    sta $DB70,y
    dey
    lda (zp_cmt_src),y
    sta $DB70,y
    dey
    lda (zp_cmt_src),y
    sta $DB70,y
    dey
    lda (zp_cmt_src),y
    sta $DB70,y
    dey
    lda (zp_cmt_src),y
    sta $DB70,y
    dey
    lda (zp_cmt_src),y
    sta $DB70,y
    dey
    lda (zp_cmt_src),y
    sta $DB70,y
    lda src_col_row_lo,x
    clc
    adc scrollCol
    sta zp_cmt_src
    lda src_col_row_hi,x
    adc #0
    sta zp_cmt_src+1
    inx
    ldy #39
    lda (zp_cmt_src),y
    sta $DB98,y
    dey
    lda (zp_cmt_src),y
    sta $DB98,y
    dey
    lda (zp_cmt_src),y
    sta $DB98,y
    dey
    lda (zp_cmt_src),y
    sta $DB98,y
    dey
    lda (zp_cmt_src),y
    sta $DB98,y
    dey
    lda (zp_cmt_src),y
    sta $DB98,y
    dey
    lda (zp_cmt_src),y
    sta $DB98,y
    dey
    lda (zp_cmt_src),y
    sta $DB98,y
    dey
    lda (zp_cmt_src),y
    sta $DB98,y
    dey
    lda (zp_cmt_src),y
    sta $DB98,y
    dey
    lda (zp_cmt_src),y
    sta $DB98,y
    dey
    lda (zp_cmt_src),y
    sta $DB98,y
    dey
    lda (zp_cmt_src),y
    sta $DB98,y
    dey
    lda (zp_cmt_src),y
    sta $DB98,y
    dey
    lda (zp_cmt_src),y
    sta $DB98,y
    dey
    lda (zp_cmt_src),y
    sta $DB98,y
    dey
    lda (zp_cmt_src),y
    sta $DB98,y
    dey
    lda (zp_cmt_src),y
    sta $DB98,y
    dey
    lda (zp_cmt_src),y
    sta $DB98,y
    dey
    lda (zp_cmt_src),y
    sta $DB98,y
    dey
    lda (zp_cmt_src),y
    sta $DB98,y
    dey
    lda (zp_cmt_src),y
    sta $DB98,y
    dey
    lda (zp_cmt_src),y
    sta $DB98,y
    dey
    lda (zp_cmt_src),y
    sta $DB98,y
    dey
    lda (zp_cmt_src),y
    sta $DB98,y
    dey
    lda (zp_cmt_src),y
    sta $DB98,y
    dey
    lda (zp_cmt_src),y
    sta $DB98,y
    dey
    lda (zp_cmt_src),y
    sta $DB98,y
    dey
    lda (zp_cmt_src),y
    sta $DB98,y
    dey
    lda (zp_cmt_src),y
    sta $DB98,y
    dey
    lda (zp_cmt_src),y
    sta $DB98,y
    dey
    lda (zp_cmt_src),y
    sta $DB98,y
    dey
    lda (zp_cmt_src),y
    sta $DB98,y
    dey
    lda (zp_cmt_src),y
    sta $DB98,y
    dey
    lda (zp_cmt_src),y
    sta $DB98,y
    dey
    lda (zp_cmt_src),y
    sta $DB98,y
    dey
    lda (zp_cmt_src),y
    sta $DB98,y
    dey
    lda (zp_cmt_src),y
    sta $DB98,y
    dey
    lda (zp_cmt_src),y
    sta $DB98,y
    dey
    lda (zp_cmt_src),y
    sta $DB98,y
    lda src_col_row_lo,x
    clc
    adc scrollCol
    sta zp_cmt_src
    lda src_col_row_hi,x
    adc #0
    sta zp_cmt_src+1
    inx
    ldy #39
    lda (zp_cmt_src),y
    sta $DBC0,y
    dey
    lda (zp_cmt_src),y
    sta $DBC0,y
    dey
    lda (zp_cmt_src),y
    sta $DBC0,y
    dey
    lda (zp_cmt_src),y
    sta $DBC0,y
    dey
    lda (zp_cmt_src),y
    sta $DBC0,y
    dey
    lda (zp_cmt_src),y
    sta $DBC0,y
    dey
    lda (zp_cmt_src),y
    sta $DBC0,y
    dey
    lda (zp_cmt_src),y
    sta $DBC0,y
    dey
    lda (zp_cmt_src),y
    sta $DBC0,y
    dey
    lda (zp_cmt_src),y
    sta $DBC0,y
    dey
    lda (zp_cmt_src),y
    sta $DBC0,y
    dey
    lda (zp_cmt_src),y
    sta $DBC0,y
    dey
    lda (zp_cmt_src),y
    sta $DBC0,y
    dey
    lda (zp_cmt_src),y
    sta $DBC0,y
    dey
    lda (zp_cmt_src),y
    sta $DBC0,y
    dey
    lda (zp_cmt_src),y
    sta $DBC0,y
    dey
    lda (zp_cmt_src),y
    sta $DBC0,y
    dey
    lda (zp_cmt_src),y
    sta $DBC0,y
    dey
    lda (zp_cmt_src),y
    sta $DBC0,y
    dey
    lda (zp_cmt_src),y
    sta $DBC0,y
    dey
    lda (zp_cmt_src),y
    sta $DBC0,y
    dey
    lda (zp_cmt_src),y
    sta $DBC0,y
    dey
    lda (zp_cmt_src),y
    sta $DBC0,y
    dey
    lda (zp_cmt_src),y
    sta $DBC0,y
    dey
    lda (zp_cmt_src),y
    sta $DBC0,y
    dey
    lda (zp_cmt_src),y
    sta $DBC0,y
    dey
    lda (zp_cmt_src),y
    sta $DBC0,y
    dey
    lda (zp_cmt_src),y
    sta $DBC0,y
    dey
    lda (zp_cmt_src),y
    sta $DBC0,y
    dey
    lda (zp_cmt_src),y
    sta $DBC0,y
    dey
    lda (zp_cmt_src),y
    sta $DBC0,y
    dey
    lda (zp_cmt_src),y
    sta $DBC0,y
    dey
    lda (zp_cmt_src),y
    sta $DBC0,y
    dey
    lda (zp_cmt_src),y
    sta $DBC0,y
    dey
    lda (zp_cmt_src),y
    sta $DBC0,y
    dey
    lda (zp_cmt_src),y
    sta $DBC0,y
    dey
    lda (zp_cmt_src),y
    sta $DBC0,y
    dey
    lda (zp_cmt_src),y
    sta $DBC0,y
    dey
    lda (zp_cmt_src),y
    sta $DBC0,y
    dey
    lda (zp_cmt_src),y
    sta $DBC0,y
    rts
}

;--------------------------------------------------------------
; Row address tables — placed AFTER the commit routines so they
; don't occupy the $0AA0..$0C93 range that used to collide with
; char buffer B at $0C00. Referenced via absolute,X addressing
; so location doesn't matter.
;--------------------------------------------------------------
; Source screen row BASES (25 entries, each row 160 bytes wide)
src_scr_row_lo: !byte $00,$78,$F0,$68,$E0,$58,$D0,$48,$C0,$38,$B0,$28,$A0,$18,$90,$08,$80,$F8,$70,$E8,$60,$D8,$50,$C8,$40
src_scr_row_hi: !byte $20,$20,$20,$21,$21,$22,$22,$23,$23,$24,$24,$25,$25,$26,$26,$27,$27,$27,$28,$28,$29,$29,$2A,$2A,$2B
; Source color row BASES
src_col_row_lo: !byte $B8,$30,$A8,$20,$98,$10,$88,$00,$78,$F0,$68,$E0,$58,$D0,$48,$C0,$38,$B0,$28,$A0,$18,$90,$08,$80,$F8
src_col_row_hi: !byte $2B,$2C,$2C,$2D,$2D,$2E,$2E,$2F,$2F,$2F,$30,$30,$31,$31,$32,$32,$33,$33,$34,$34,$35,$35,$36,$36,$36
; Dest screen rows (relative to $0400, workBufOffset adds $08 for $0C00)
screen_dest_lo: !byte $00,$28,$50,$78,$A0,$C8,$F0,$18,$40,$68,$90,$B8,$E0,$08,$30,$58,$80,$A8,$D0,$F8,$20,$48,$70,$98,$C0
screen_dest_hi: !byte $04,$04,$04,$04,$04,$04,$04,$05,$05,$05,$05,$05,$05,$06,$06,$06,$06,$06,$06,$06,$07,$07,$07,$07,$07
; Dest color rows ($D800)
color_dest_lo: !byte $00,$28,$50,$78,$A0,$C8,$F0,$18,$40,$68,$90,$B8,$E0,$08,$30,$58,$80,$A8,$D0,$F8,$20,$48,$70,$98,$C0
color_dest_hi: !byte $D8,$D8,$D8,$D8,$D8,$D8,$D8,$D9,$D9,$D9,$D9,$D9,$D9,$DA,$DA,$DA,$DA,$DA,$DA,$DA,$DB,$DB,$DB,$DB,$DB

