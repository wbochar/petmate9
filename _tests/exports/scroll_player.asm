
; Petmate9 Vertical Smooth Scroller (C64) — Double Buffered
; Source: debug-vscroll-40x50 (40x50), pingpong 0..25
; Buffer A = $0400, Buffer B = $0C00 — swap via $D018 in IRQ
!include "macros.asm"


!let irq_top_line    = 1
!let irq_bottom_line = 251
!let debug_build     = FALSE
!let TOTAL_ROWS      = 50
!let VISIBLE_ROWS    = 25
!let MAX_SCROLL      = 25
!let ROW_WIDTH       = 40
!let SCROLL_SPEED    = 1
!let D018_A          = $15
!let D018_B          = $35

!let zp_src        = $20
!let zp_dst        = $22
!let zp_src_row    = $24
!let zp_vis_row    = $25
!let zp_cmt_src    = $26     ; dedicated commit-source pointer (IRQ-safe)

+basic_start(entry)

;--------------------------------------------------------------
; Entry
;--------------------------------------------------------------
entry: {



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
    sta scrollRow
    sta displayBuf          ; 0 = showing buffer A
    sta workBufOffset       ; 0 = writing to $0400 (initial fill)
    sta coarsePhase         ; 0 = idle (no split-buffer commit in flight)
    sta scrollDir           ; 0 = forward/down, 1 = reverse/up (pingpong mode)
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

    ; Set initial VIC registers
    lda #$17                ; 24-row mode, YSCROLL=7
    sta nextD011
    sta $d011
    lda #D018_A
    sta nextD018
    sta $d018

    ; ── Main loop: double-buffered prepare-ahead ──
    ; Fine-scroll: just queue nextD011.
    ; Coarse-scroll: write 25 rows to the OFF-SCREEN buffer
    ; (no tearing), update color RAM, then queue buffer swap.
    ; IRQ applies $D011 + $D018 atomically at a fixed raster line.

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

    ; Pingpong fine+coarse stepping with smooth turnarounds
    lda scrollDir
    beq pp_fwd_fine

pp_rev_fine:
    inc scrollFine
    lda scrollFine
    cmp #8
    bcc prep_fine
    ; Reverse coarse boundary crossed
    lda scrollRow
    bne pp_rev_do_coarse
    ; At top: turn around and start moving forward
    lda #7
    sta scrollFine
    lda #0
    sta $d404
    sta $d40b
    sta $d412
    sta $d417
    sta scrollDir
    jmp prep_fine
pp_rev_do_coarse:
    lda #0
    sta scrollFine
    dec scrollRow
    jmp do_coarse

pp_fwd_fine:
    dec scrollFine
    bpl prep_fine
    ; Forward coarse boundary crossed
    lda scrollRow
    cmp #MAX_SCROLL
    bcc pp_fwd_do_coarse
    ; At bottom: turn around and start moving reverse
    lda #0
    sta scrollFine
    lda #1
    sta scrollDir
    jmp prep_fine
pp_fwd_do_coarse:
    lda #7
    sta scrollFine
    inc scrollRow


do_coarse:
    ; Determine work-buffer offset ($00 = $0400, $08 = $0C00)
    lda displayBuf
    bne work_is_a
    lda #$08                ; displaying A → work is B
    jmp set_work
work_is_a:
    lda #$00                ; displaying B → work is A
set_work:
    sta workBufOffset

    ; Arm the two-stage color commit BEFORE the long char copy. If
    ; the lower-border IRQ fires mid-copy, it will see coarsePhase=1
    ; and commit the bottom rows. The commit uses zp_cmt_src (not
    ; zp_src), so it won't disturb copy_row's state.
    ;   1 → lower-border IRQ this frame commits rows 19..24
    ;   2 → next upper-border IRQ swaps $D018 + commits rows 0..18
    ; Flip displayBuf and queue the $D018 swap BEFORE arming, so the
    ; next upper IRQ has everything it needs the moment phase==2.
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

    lda #1
    sta coarsePhase

    ; Now do the big 25-row char copy. It may be preempted by the
    ; lower-border IRQ — that's fine, the commit uses separate zp
    ; and writes to $D800 only, not to our char buffer.
    ; Color RAM is NOT touched here; the IRQ chain commits $D800
    ; across frame N-1 lower border + frame N upper border.
    jsr copy_window_screen

prep_fine:
    lda #$10
    ora scrollFine
    sta nextD011
post_frame_work:
    ; Keep coarse prep timing tight: do controls/music after
    ; nextD011 + optional off-screen copy has been prepared.
    jsr handle_input

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
; copy_window_screen – 25 rows from source to work buffer
;   workBufOffset: $00 writes to $04xx, $08 writes to $0Cxx
;--------------------------------------------------------------
copy_window_screen: {
    lda scrollRow
    sta zp_src_row
    lda #0
    sta zp_vis_row
row_loop:
    ldx zp_src_row
    lda scr_row_lo,x
    sta zp_src
    lda scr_row_hi,x
    sta zp_src+1
    ldx zp_vis_row
    lda screen_dest_lo,x
    sta zp_dst
    lda screen_dest_hi,x
    clc
    adc workBufOffset       ; +$00 for A, +$08 for B
    sta zp_dst+1
    jsr copy_row
    inc zp_src_row
    lda zp_src_row
    cmp #TOTAL_ROWS
    bcc copy_screen_src_ok
    lda #0
    sta zp_src_row
copy_screen_src_ok:
    inc zp_vis_row
    lda zp_vis_row
    cmp #VISIBLE_ROWS
    bne row_loop
    rts
}

;--------------------------------------------------------------
; copy_window_color – initial fill of LIVE $D800 during setup only.
; During scroll, $D800 is updated by the IRQs (commit_colors_top/bottom).
;--------------------------------------------------------------
copy_window_color: {
    lda scrollRow
    sta zp_src_row
    lda #0
    sta zp_vis_row
row_loop:
    ldx zp_src_row
    lda col_row_lo,x
    sta zp_src
    lda col_row_hi,x
    sta zp_src+1
    ldx zp_vis_row
    lda color_dest_lo,x
    sta zp_dst
    lda color_dest_hi,x
    sta zp_dst+1
    jsr copy_row
    inc zp_src_row
    lda zp_src_row
    cmp #TOTAL_ROWS
    bcc copy_color_src_ok
    lda #0
    sta zp_src_row
copy_color_src_ok:
    inc zp_vis_row
    lda zp_vis_row
    cmp #VISIBLE_ROWS
    bne row_loop
    rts
}

;--------------------------------------------------------------
; copy_row – copy ROW_WIDTH bytes from (zp_src) to (zp_dst).
; Inner loop fully unrolled: removes the per-byte 'bpl' branch and
; brings the 25-row char copy down to ~14,000 cyc so the main-loop
; coarse prep completes BEFORE the raster-251 lower-border IRQ fires
; at frame cycle 15813. Without the unroll it would overrun and the
; commit would slip by a frame.
;--------------------------------------------------------------
copy_row: {
    ldy #ROW_WIDTH-1
    ; 40 byte pairs, 39 inter-byte dey's. Last byte doesn't dey.
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
;   • Apply nextD011 every frame (fine-scroll YSCROLL).
;   • On coarsePhase == 2: atomically swap $D018 to the new char
;     buffer, then raster-chase the top 19 rows of the new color
;     matrix into $D800. Row K's copy completes before raster 51+K*8.
;   • Chain to irq_bottom (raster 251).
;--------------------------------------------------------------
irq_top: {
    +irq_start(end)

    lda nextD011
    sta $d011

    lda coarsePhase
    cmp #2
    bne skip_top_commit
!if (debug_build) {
    lda #7
    sta $d020
}
    ; Chars and top-half colors commit together in the same IRQ
    lda nextD018
    sta $d018
    jsr commit_colors_top
    lda #0
    sta coarsePhase
!if (debug_build) {
    lda #14
    sta $d020
}
skip_top_commit:

    lda #1
    sta vsyncFlag

    +irq_end(irq_bottom, irq_bottom_line)
end:
}

;--------------------------------------------------------------
; irq_bottom — lower border (raster 251)
;   • On coarsePhase == 1: commit bottom 6 rows (19..24) to $D800.
;     The beam has already finished drawing all 25 rows of the
;     current frame, so these writes are invisible this frame
;     and will be displayed next frame along with the top half
;     (committed by the next irq_top).
;   • Chain back to irq_top (raster 1).
;--------------------------------------------------------------
irq_bottom: {
    +irq_start(end)

    lda coarsePhase
    cmp #1
    bne skip_bot_commit
!if (debug_build) {
    lda #2
    sta $d020
}
    jsr commit_colors_bottom
    lda #2
    sta coarsePhase
!if (debug_build) {
    lda #14
    sta $d020
}
skip_bot_commit:
    +irq_end(irq_top, irq_top_line)
end:
}

;--------------------------------------------------------------
; Variables
;--------------------------------------------------------------
vsyncFlag:      !byte 0
nextD011:       !byte $17
nextD018:       !byte D018_A
scrollFine:     !byte 7
scrollRow:      !byte 0
delayCounter:   !byte 1
scrollSpeed:    !byte SCROLL_SPEED
paused:         !byte 0
muteFlag:       !byte 0
keySpacePrev:   !byte 0
keyMPrev:       !byte 0
keyPlusPrev:    !byte 0
keyMinusPrev:   !byte 0
keyRowState:    !byte 0
displayBuf:     !byte 0     ; 0 = showing A, 1 = showing B
workBufOffset:  !byte 0     ; $00 = write to $04xx, $08 = write to $0Cxx
coarsePhase:    !byte 0     ; 0=idle, 1=lower-IRQ commits bottom, 2=upper-IRQ swaps + commits top
scrollDir:      !byte 0     ; 0=forward/down, 1=reverse/up (used by pingpong mode)





;--------------------------------------------------------------
; Source data (uncompressed for fast row access)
;--------------------------------------------------------------
* = $2000
screen_data:

!byte $16,$13,$03,$12,$0F,$0C,$0C,$2D,$10,$09,$0E,$07,$10,$0F,$0E,$07,$20,$20,$20,$20,$20,$20,$20,$20,$20,$20,$20,$20,$20,$20,$20,$20,$20,$20,$20,$20,$20,$20,$20,$20
!byte $30,$31,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0
!byte $30,$32,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0
!byte $30,$33,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0
!byte $30,$34,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0
!byte $30,$35,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0
!byte $30,$36,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0
!byte $30,$37,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0
!byte $30,$38,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0
!byte $30,$39,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0
!byte $31,$30,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0
!byte $31,$31,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0
!byte $31,$32,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0
!byte $31,$33,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0
!byte $31,$34,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0
!byte $31,$35,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0
!byte $31,$36,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0
!byte $31,$37,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0
!byte $31,$38,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0
!byte $31,$39,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0
!byte $32,$30,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0
!byte $32,$31,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0
!byte $32,$32,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0
!byte $32,$33,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0
!byte $32,$34,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0
!byte $32,$35,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0
!byte $32,$36,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0
!byte $32,$37,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0
!byte $32,$38,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0
!byte $32,$39,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0
!byte $33,$30,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0
!byte $33,$31,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0
!byte $33,$32,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0
!byte $33,$33,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0
!byte $33,$34,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0
!byte $33,$35,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0
!byte $33,$36,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0
!byte $33,$37,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0
!byte $33,$38,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0
!byte $33,$39,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0
!byte $34,$30,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0
!byte $34,$31,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0
!byte $34,$32,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0
!byte $34,$33,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0
!byte $34,$34,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0
!byte $34,$35,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0
!byte $34,$36,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0
!byte $34,$37,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0
!byte $34,$38,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0
!byte $34,$39,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0,$A0

color_data:

!byte $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
!byte $01,$01,$01,$01,$01,$01,$01,$01,$01,$01,$01,$01,$01,$01,$01,$01,$01,$01,$01,$01,$01,$01,$01,$01,$01,$01,$01,$01,$01,$01,$01,$01,$01,$01,$01,$01,$01,$01,$01,$01
!byte $02,$02,$02,$02,$02,$02,$02,$02,$02,$02,$02,$02,$02,$02,$02,$02,$02,$02,$02,$02,$02,$02,$02,$02,$02,$02,$02,$02,$02,$02,$02,$02,$02,$02,$02,$02,$02,$02,$02,$02
!byte $03,$03,$03,$03,$03,$03,$03,$03,$03,$03,$03,$03,$03,$03,$03,$03,$03,$03,$03,$03,$03,$03,$03,$03,$03,$03,$03,$03,$03,$03,$03,$03,$03,$03,$03,$03,$03,$03,$03,$03
!byte $04,$04,$04,$04,$04,$04,$04,$04,$04,$04,$04,$04,$04,$04,$04,$04,$04,$04,$04,$04,$04,$04,$04,$04,$04,$04,$04,$04,$04,$04,$04,$04,$04,$04,$04,$04,$04,$04,$04,$04
!byte $05,$05,$05,$05,$05,$05,$05,$05,$05,$05,$05,$05,$05,$05,$05,$05,$05,$05,$05,$05,$05,$05,$05,$05,$05,$05,$05,$05,$05,$05,$05,$05,$05,$05,$05,$05,$05,$05,$05,$05
!byte $06,$06,$06,$06,$06,$06,$06,$06,$06,$06,$06,$06,$06,$06,$06,$06,$06,$06,$06,$06,$06,$06,$06,$06,$06,$06,$06,$06,$06,$06,$06,$06,$06,$06,$06,$06,$06,$06,$06,$06
!byte $07,$07,$07,$07,$07,$07,$07,$07,$07,$07,$07,$07,$07,$07,$07,$07,$07,$07,$07,$07,$07,$07,$07,$07,$07,$07,$07,$07,$07,$07,$07,$07,$07,$07,$07,$07,$07,$07,$07,$07
!byte $08,$08,$08,$08,$08,$08,$08,$08,$08,$08,$08,$08,$08,$08,$08,$08,$08,$08,$08,$08,$08,$08,$08,$08,$08,$08,$08,$08,$08,$08,$08,$08,$08,$08,$08,$08,$08,$08,$08,$08
!byte $09,$09,$09,$09,$09,$09,$09,$09,$09,$09,$09,$09,$09,$09,$09,$09,$09,$09,$09,$09,$09,$09,$09,$09,$09,$09,$09,$09,$09,$09,$09,$09,$09,$09,$09,$09,$09,$09,$09,$09
!byte $0A,$0A,$0A,$0A,$0A,$0A,$0A,$0A,$0A,$0A,$0A,$0A,$0A,$0A,$0A,$0A,$0A,$0A,$0A,$0A,$0A,$0A,$0A,$0A,$0A,$0A,$0A,$0A,$0A,$0A,$0A,$0A,$0A,$0A,$0A,$0A,$0A,$0A,$0A,$0A
!byte $0B,$0B,$0B,$0B,$0B,$0B,$0B,$0B,$0B,$0B,$0B,$0B,$0B,$0B,$0B,$0B,$0B,$0B,$0B,$0B,$0B,$0B,$0B,$0B,$0B,$0B,$0B,$0B,$0B,$0B,$0B,$0B,$0B,$0B,$0B,$0B,$0B,$0B,$0B,$0B
!byte $0C,$0C,$0C,$0C,$0C,$0C,$0C,$0C,$0C,$0C,$0C,$0C,$0C,$0C,$0C,$0C,$0C,$0C,$0C,$0C,$0C,$0C,$0C,$0C,$0C,$0C,$0C,$0C,$0C,$0C,$0C,$0C,$0C,$0C,$0C,$0C,$0C,$0C,$0C,$0C
!byte $0D,$0D,$0D,$0D,$0D,$0D,$0D,$0D,$0D,$0D,$0D,$0D,$0D,$0D,$0D,$0D,$0D,$0D,$0D,$0D,$0D,$0D,$0D,$0D,$0D,$0D,$0D,$0D,$0D,$0D,$0D,$0D,$0D,$0D,$0D,$0D,$0D,$0D,$0D,$0D
!byte $0E,$0E,$0E,$0E,$0E,$0E,$0E,$0E,$0E,$0E,$0E,$0E,$0E,$0E,$0E,$0E,$0E,$0E,$0E,$0E,$0E,$0E,$0E,$0E,$0E,$0E,$0E,$0E,$0E,$0E,$0E,$0E,$0E,$0E,$0E,$0E,$0E,$0E,$0E,$0E
!byte $0F,$0F,$0F,$0F,$0F,$0F,$0F,$0F,$0F,$0F,$0F,$0F,$0F,$0F,$0F,$0F,$0F,$0F,$0F,$0F,$0F,$0F,$0F,$0F,$0F,$0F,$0F,$0F,$0F,$0F,$0F,$0F,$0F,$0F,$0F,$0F,$0F,$0F,$0F,$0F
!byte $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
!byte $01,$01,$01,$01,$01,$01,$01,$01,$01,$01,$01,$01,$01,$01,$01,$01,$01,$01,$01,$01,$01,$01,$01,$01,$01,$01,$01,$01,$01,$01,$01,$01,$01,$01,$01,$01,$01,$01,$01,$01
!byte $02,$02,$02,$02,$02,$02,$02,$02,$02,$02,$02,$02,$02,$02,$02,$02,$02,$02,$02,$02,$02,$02,$02,$02,$02,$02,$02,$02,$02,$02,$02,$02,$02,$02,$02,$02,$02,$02,$02,$02
!byte $03,$03,$03,$03,$03,$03,$03,$03,$03,$03,$03,$03,$03,$03,$03,$03,$03,$03,$03,$03,$03,$03,$03,$03,$03,$03,$03,$03,$03,$03,$03,$03,$03,$03,$03,$03,$03,$03,$03,$03
!byte $04,$04,$04,$04,$04,$04,$04,$04,$04,$04,$04,$04,$04,$04,$04,$04,$04,$04,$04,$04,$04,$04,$04,$04,$04,$04,$04,$04,$04,$04,$04,$04,$04,$04,$04,$04,$04,$04,$04,$04
!byte $05,$05,$05,$05,$05,$05,$05,$05,$05,$05,$05,$05,$05,$05,$05,$05,$05,$05,$05,$05,$05,$05,$05,$05,$05,$05,$05,$05,$05,$05,$05,$05,$05,$05,$05,$05,$05,$05,$05,$05
!byte $06,$06,$06,$06,$06,$06,$06,$06,$06,$06,$06,$06,$06,$06,$06,$06,$06,$06,$06,$06,$06,$06,$06,$06,$06,$06,$06,$06,$06,$06,$06,$06,$06,$06,$06,$06,$06,$06,$06,$06
!byte $07,$07,$07,$07,$07,$07,$07,$07,$07,$07,$07,$07,$07,$07,$07,$07,$07,$07,$07,$07,$07,$07,$07,$07,$07,$07,$07,$07,$07,$07,$07,$07,$07,$07,$07,$07,$07,$07,$07,$07
!byte $08,$08,$08,$08,$08,$08,$08,$08,$08,$08,$08,$08,$08,$08,$08,$08,$08,$08,$08,$08,$08,$08,$08,$08,$08,$08,$08,$08,$08,$08,$08,$08,$08,$08,$08,$08,$08,$08,$08,$08
!byte $09,$09,$09,$09,$09,$09,$09,$09,$09,$09,$09,$09,$09,$09,$09,$09,$09,$09,$09,$09,$09,$09,$09,$09,$09,$09,$09,$09,$09,$09,$09,$09,$09,$09,$09,$09,$09,$09,$09,$09
!byte $0A,$0A,$0A,$0A,$0A,$0A,$0A,$0A,$0A,$0A,$0A,$0A,$0A,$0A,$0A,$0A,$0A,$0A,$0A,$0A,$0A,$0A,$0A,$0A,$0A,$0A,$0A,$0A,$0A,$0A,$0A,$0A,$0A,$0A,$0A,$0A,$0A,$0A,$0A,$0A
!byte $0B,$0B,$0B,$0B,$0B,$0B,$0B,$0B,$0B,$0B,$0B,$0B,$0B,$0B,$0B,$0B,$0B,$0B,$0B,$0B,$0B,$0B,$0B,$0B,$0B,$0B,$0B,$0B,$0B,$0B,$0B,$0B,$0B,$0B,$0B,$0B,$0B,$0B,$0B,$0B
!byte $0C,$0C,$0C,$0C,$0C,$0C,$0C,$0C,$0C,$0C,$0C,$0C,$0C,$0C,$0C,$0C,$0C,$0C,$0C,$0C,$0C,$0C,$0C,$0C,$0C,$0C,$0C,$0C,$0C,$0C,$0C,$0C,$0C,$0C,$0C,$0C,$0C,$0C,$0C,$0C
!byte $0D,$0D,$0D,$0D,$0D,$0D,$0D,$0D,$0D,$0D,$0D,$0D,$0D,$0D,$0D,$0D,$0D,$0D,$0D,$0D,$0D,$0D,$0D,$0D,$0D,$0D,$0D,$0D,$0D,$0D,$0D,$0D,$0D,$0D,$0D,$0D,$0D,$0D,$0D,$0D
!byte $0E,$0E,$0E,$0E,$0E,$0E,$0E,$0E,$0E,$0E,$0E,$0E,$0E,$0E,$0E,$0E,$0E,$0E,$0E,$0E,$0E,$0E,$0E,$0E,$0E,$0E,$0E,$0E,$0E,$0E,$0E,$0E,$0E,$0E,$0E,$0E,$0E,$0E,$0E,$0E
!byte $0F,$0F,$0F,$0F,$0F,$0F,$0F,$0F,$0F,$0F,$0F,$0F,$0F,$0F,$0F,$0F,$0F,$0F,$0F,$0F,$0F,$0F,$0F,$0F,$0F,$0F,$0F,$0F,$0F,$0F,$0F,$0F,$0F,$0F,$0F,$0F,$0F,$0F,$0F,$0F
!byte $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
!byte $01,$01,$01,$01,$01,$01,$01,$01,$01,$01,$01,$01,$01,$01,$01,$01,$01,$01,$01,$01,$01,$01,$01,$01,$01,$01,$01,$01,$01,$01,$01,$01,$01,$01,$01,$01,$01,$01,$01,$01
!byte $02,$02,$02,$02,$02,$02,$02,$02,$02,$02,$02,$02,$02,$02,$02,$02,$02,$02,$02,$02,$02,$02,$02,$02,$02,$02,$02,$02,$02,$02,$02,$02,$02,$02,$02,$02,$02,$02,$02,$02
!byte $03,$03,$03,$03,$03,$03,$03,$03,$03,$03,$03,$03,$03,$03,$03,$03,$03,$03,$03,$03,$03,$03,$03,$03,$03,$03,$03,$03,$03,$03,$03,$03,$03,$03,$03,$03,$03,$03,$03,$03
!byte $04,$04,$04,$04,$04,$04,$04,$04,$04,$04,$04,$04,$04,$04,$04,$04,$04,$04,$04,$04,$04,$04,$04,$04,$04,$04,$04,$04,$04,$04,$04,$04,$04,$04,$04,$04,$04,$04,$04,$04
!byte $05,$05,$05,$05,$05,$05,$05,$05,$05,$05,$05,$05,$05,$05,$05,$05,$05,$05,$05,$05,$05,$05,$05,$05,$05,$05,$05,$05,$05,$05,$05,$05,$05,$05,$05,$05,$05,$05,$05,$05
!byte $06,$06,$06,$06,$06,$06,$06,$06,$06,$06,$06,$06,$06,$06,$06,$06,$06,$06,$06,$06,$06,$06,$06,$06,$06,$06,$06,$06,$06,$06,$06,$06,$06,$06,$06,$06,$06,$06,$06,$06
!byte $07,$07,$07,$07,$07,$07,$07,$07,$07,$07,$07,$07,$07,$07,$07,$07,$07,$07,$07,$07,$07,$07,$07,$07,$07,$07,$07,$07,$07,$07,$07,$07,$07,$07,$07,$07,$07,$07,$07,$07
!byte $08,$08,$08,$08,$08,$08,$08,$08,$08,$08,$08,$08,$08,$08,$08,$08,$08,$08,$08,$08,$08,$08,$08,$08,$08,$08,$08,$08,$08,$08,$08,$08,$08,$08,$08,$08,$08,$08,$08,$08
!byte $09,$09,$09,$09,$09,$09,$09,$09,$09,$09,$09,$09,$09,$09,$09,$09,$09,$09,$09,$09,$09,$09,$09,$09,$09,$09,$09,$09,$09,$09,$09,$09,$09,$09,$09,$09,$09,$09,$09,$09
!byte $0A,$0A,$0A,$0A,$0A,$0A,$0A,$0A,$0A,$0A,$0A,$0A,$0A,$0A,$0A,$0A,$0A,$0A,$0A,$0A,$0A,$0A,$0A,$0A,$0A,$0A,$0A,$0A,$0A,$0A,$0A,$0A,$0A,$0A,$0A,$0A,$0A,$0A,$0A,$0A
!byte $0B,$0B,$0B,$0B,$0B,$0B,$0B,$0B,$0B,$0B,$0B,$0B,$0B,$0B,$0B,$0B,$0B,$0B,$0B,$0B,$0B,$0B,$0B,$0B,$0B,$0B,$0B,$0B,$0B,$0B,$0B,$0B,$0B,$0B,$0B,$0B,$0B,$0B,$0B,$0B
!byte $0C,$0C,$0C,$0C,$0C,$0C,$0C,$0C,$0C,$0C,$0C,$0C,$0C,$0C,$0C,$0C,$0C,$0C,$0C,$0C,$0C,$0C,$0C,$0C,$0C,$0C,$0C,$0C,$0C,$0C,$0C,$0C,$0C,$0C,$0C,$0C,$0C,$0C,$0C,$0C
!byte $0D,$0D,$0D,$0D,$0D,$0D,$0D,$0D,$0D,$0D,$0D,$0D,$0D,$0D,$0D,$0D,$0D,$0D,$0D,$0D,$0D,$0D,$0D,$0D,$0D,$0D,$0D,$0D,$0D,$0D,$0D,$0D,$0D,$0D,$0D,$0D,$0D,$0D,$0D,$0D
!byte $0E,$0E,$0E,$0E,$0E,$0E,$0E,$0E,$0E,$0E,$0E,$0E,$0E,$0E,$0E,$0E,$0E,$0E,$0E,$0E,$0E,$0E,$0E,$0E,$0E,$0E,$0E,$0E,$0E,$0E,$0E,$0E,$0E,$0E,$0E,$0E,$0E,$0E,$0E,$0E
!byte $0F,$0F,$0F,$0F,$0F,$0F,$0F,$0F,$0F,$0F,$0F,$0F,$0F,$0F,$0F,$0F,$0F,$0F,$0F,$0F,$0F,$0F,$0F,$0F,$0F,$0F,$0F,$0F,$0F,$0F,$0F,$0F,$0F,$0F,$0F,$0F,$0F,$0F,$0F,$0F
!byte $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
!byte $01,$01,$01,$01,$01,$01,$01,$01,$01,$01,$01,$01,$01,$01,$01,$01,$01,$01,$01,$01,$01,$01,$01,$01,$01,$01,$01,$01,$01,$01,$01,$01,$01,$01,$01,$01,$01,$01,$01,$01

;--------------------------------------------------------------
; Color commit routines — placed after source data so they don't
; collide with char buffer B at $0C00. Each row body is fully
; unrolled (40 × lda (zp),y / sta abs,y / dey) hitting 12 cyc/byte.
; Both routines use X as a running source-row pointer and pull
; the source base from col_row_lo/hi,x tables.
;--------------------------------------------------------------
commit_colors_top: {
    ldx scrollRow
    cpx #TOTAL_ROWS
    bcc cmt_row_idx_ok_0
    ldx #0
cmt_row_idx_ok_0:
    lda col_row_lo,x
    sta zp_cmt_src
    lda col_row_hi,x
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
    cpx #TOTAL_ROWS
    bcc cmt_row_idx_ok_1
    ldx #0
cmt_row_idx_ok_1:
    lda col_row_lo,x
    sta zp_cmt_src
    lda col_row_hi,x
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
    cpx #TOTAL_ROWS
    bcc cmt_row_idx_ok_2
    ldx #0
cmt_row_idx_ok_2:
    lda col_row_lo,x
    sta zp_cmt_src
    lda col_row_hi,x
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
    cpx #TOTAL_ROWS
    bcc cmt_row_idx_ok_3
    ldx #0
cmt_row_idx_ok_3:
    lda col_row_lo,x
    sta zp_cmt_src
    lda col_row_hi,x
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
    cpx #TOTAL_ROWS
    bcc cmt_row_idx_ok_4
    ldx #0
cmt_row_idx_ok_4:
    lda col_row_lo,x
    sta zp_cmt_src
    lda col_row_hi,x
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
    cpx #TOTAL_ROWS
    bcc cmt_row_idx_ok_5
    ldx #0
cmt_row_idx_ok_5:
    lda col_row_lo,x
    sta zp_cmt_src
    lda col_row_hi,x
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
    cpx #TOTAL_ROWS
    bcc cmt_row_idx_ok_6
    ldx #0
cmt_row_idx_ok_6:
    lda col_row_lo,x
    sta zp_cmt_src
    lda col_row_hi,x
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
    cpx #TOTAL_ROWS
    bcc cmt_row_idx_ok_7
    ldx #0
cmt_row_idx_ok_7:
    lda col_row_lo,x
    sta zp_cmt_src
    lda col_row_hi,x
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
    cpx #TOTAL_ROWS
    bcc cmt_row_idx_ok_8
    ldx #0
cmt_row_idx_ok_8:
    lda col_row_lo,x
    sta zp_cmt_src
    lda col_row_hi,x
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
    cpx #TOTAL_ROWS
    bcc cmt_row_idx_ok_9
    ldx #0
cmt_row_idx_ok_9:
    lda col_row_lo,x
    sta zp_cmt_src
    lda col_row_hi,x
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
    cpx #TOTAL_ROWS
    bcc cmt_row_idx_ok_10
    ldx #0
cmt_row_idx_ok_10:
    lda col_row_lo,x
    sta zp_cmt_src
    lda col_row_hi,x
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
    cpx #TOTAL_ROWS
    bcc cmt_row_idx_ok_11
    ldx #0
cmt_row_idx_ok_11:
    lda col_row_lo,x
    sta zp_cmt_src
    lda col_row_hi,x
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
    cpx #TOTAL_ROWS
    bcc cmt_row_idx_ok_12
    ldx #0
cmt_row_idx_ok_12:
    lda col_row_lo,x
    sta zp_cmt_src
    lda col_row_hi,x
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
    cpx #TOTAL_ROWS
    bcc cmt_row_idx_ok_13
    ldx #0
cmt_row_idx_ok_13:
    lda col_row_lo,x
    sta zp_cmt_src
    lda col_row_hi,x
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
    cpx #TOTAL_ROWS
    bcc cmt_row_idx_ok_14
    ldx #0
cmt_row_idx_ok_14:
    lda col_row_lo,x
    sta zp_cmt_src
    lda col_row_hi,x
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
    cpx #TOTAL_ROWS
    bcc cmt_row_idx_ok_15
    ldx #0
cmt_row_idx_ok_15:
    lda col_row_lo,x
    sta zp_cmt_src
    lda col_row_hi,x
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
    cpx #TOTAL_ROWS
    bcc cmt_row_idx_ok_16
    ldx #0
cmt_row_idx_ok_16:
    lda col_row_lo,x
    sta zp_cmt_src
    lda col_row_hi,x
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
    cpx #TOTAL_ROWS
    bcc cmt_row_idx_ok_17
    ldx #0
cmt_row_idx_ok_17:
    lda col_row_lo,x
    sta zp_cmt_src
    lda col_row_hi,x
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
    cpx #TOTAL_ROWS
    bcc cmt_row_idx_ok_18
    ldx #0
cmt_row_idx_ok_18:
    lda col_row_lo,x
    sta zp_cmt_src
    lda col_row_hi,x
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
    lda scrollRow
    clc
    adc #19
    cmp #TOTAL_ROWS
    bcc cmt_bot_idx_ok
    sec
    sbc #TOTAL_ROWS
cmt_bot_idx_ok:
    tax
    cpx #TOTAL_ROWS
    bcc cmt_row_idx_ok_19
    ldx #0
cmt_row_idx_ok_19:
    lda col_row_lo,x
    sta zp_cmt_src
    lda col_row_hi,x
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
    cpx #TOTAL_ROWS
    bcc cmt_row_idx_ok_20
    ldx #0
cmt_row_idx_ok_20:
    lda col_row_lo,x
    sta zp_cmt_src
    lda col_row_hi,x
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
    cpx #TOTAL_ROWS
    bcc cmt_row_idx_ok_21
    ldx #0
cmt_row_idx_ok_21:
    lda col_row_lo,x
    sta zp_cmt_src
    lda col_row_hi,x
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
    cpx #TOTAL_ROWS
    bcc cmt_row_idx_ok_22
    ldx #0
cmt_row_idx_ok_22:
    lda col_row_lo,x
    sta zp_cmt_src
    lda col_row_hi,x
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
    cpx #TOTAL_ROWS
    bcc cmt_row_idx_ok_23
    ldx #0
cmt_row_idx_ok_23:
    lda col_row_lo,x
    sta zp_cmt_src
    lda col_row_hi,x
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
    cpx #TOTAL_ROWS
    bcc cmt_row_idx_ok_24
    ldx #0
cmt_row_idx_ok_24:
    lda col_row_lo,x
    sta zp_cmt_src
    lda col_row_hi,x
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
; char buffer B at $0C00. They're referenced via absolute,X
; addressing so their actual load address doesn't matter.
;--------------------------------------------------------------
scr_row_lo: !byte $00,$28,$50,$78,$A0,$C8,$F0,$18,$40,$68,$90,$B8,$E0,$08,$30,$58,$80,$A8,$D0,$F8,$20,$48,$70,$98,$C0,$E8,$10,$38,$60,$88,$B0,$D8,$00,$28,$50,$78,$A0,$C8,$F0,$18,$40,$68,$90,$B8,$E0,$08,$30,$58,$80,$A8
scr_row_hi: !byte $20,$20,$20,$20,$20,$20,$20,$21,$21,$21,$21,$21,$21,$22,$22,$22,$22,$22,$22,$22,$23,$23,$23,$23,$23,$23,$24,$24,$24,$24,$24,$24,$25,$25,$25,$25,$25,$25,$25,$26,$26,$26,$26,$26,$26,$27,$27,$27,$27,$27
col_row_lo: !byte $D0,$F8,$20,$48,$70,$98,$C0,$E8,$10,$38,$60,$88,$B0,$D8,$00,$28,$50,$78,$A0,$C8,$F0,$18,$40,$68,$90,$B8,$E0,$08,$30,$58,$80,$A8,$D0,$F8,$20,$48,$70,$98,$C0,$E8,$10,$38,$60,$88,$B0,$D8,$00,$28,$50,$78
col_row_hi: !byte $27,$27,$28,$28,$28,$28,$28,$28,$29,$29,$29,$29,$29,$29,$2A,$2A,$2A,$2A,$2A,$2A,$2A,$2B,$2B,$2B,$2B,$2B,$2B,$2C,$2C,$2C,$2C,$2C,$2C,$2C,$2D,$2D,$2D,$2D,$2D,$2D,$2E,$2E,$2E,$2E,$2E,$2E,$2F,$2F,$2F,$2F
; Dest rows relative to $0400 (workBufOffset adds $08 for $0C00)
screen_dest_lo: !byte $00,$28,$50,$78,$A0,$C8,$F0,$18,$40,$68,$90,$B8,$E0,$08,$30,$58,$80,$A8,$D0,$F8,$20,$48,$70,$98,$C0
screen_dest_hi: !byte $04,$04,$04,$04,$04,$04,$04,$05,$05,$05,$05,$05,$05,$06,$06,$06,$06,$06,$06,$06,$07,$07,$07,$07,$07
color_dest_lo: !byte $00,$28,$50,$78,$A0,$C8,$F0,$18,$40,$68,$90,$B8,$E0,$08,$30,$58,$80,$A8,$D0,$F8,$20,$48,$70,$98,$C0
color_dest_hi: !byte $D8,$D8,$D8,$D8,$D8,$D8,$D8,$D9,$D9,$D9,$D9,$D9,$D9,$DA,$DA,$DA,$DA,$DA,$DA,$DA,$DB,$DB,$DB,$DB,$DB

