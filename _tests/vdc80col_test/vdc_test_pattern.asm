; ============================================================
; vdc_test_pattern.asm
; C128 VDC 80-Column Test Pattern Generator
;
; Generates a test pattern on the VDC 80-column display:
;   - PETSCII box border around the screen
;   - Title text "PETMATE 9 — C128 VDC 80-COLUMN TEST"
;   - 16 RGBI color bars with labels
;   - Full character set sample (codes $00-$FF)
;   - Column/row markers
;
; Assembler: c64jasm (or compatible)
; Target: Commodore 128 (C128 mode, 80-column output)
;
; The PRG runs from BASIC via SYS. The KERNAL remains banked
; in so VDC character definitions are already loaded.
; ============================================================

!include "macros_vdc.asm"

; Zero-page temporaries
!let zp_ptr   = $fb   ; 16-bit pointer (lo/hi)
!let zp_count = $fd   ; byte counter
!let zp_row   = $fe   ; current row
!let zp_tmp   = $ff   ; scratch

+basic_start(entry)

; ============================================================
; Entry point
; ============================================================
entry: {
    sei

    ; ----- Step 1: Set global colors (reg 26) -----
    lda #$f0              ; fg=white(15), bg=black(0)
    ldx #VDC_REG_COLORS
    +vdc_write_reg()

    ; ----- Step 2: Clear screen RAM (fill with spaces) -----
    lda #>VDC_SCREEN
    ldy #<VDC_SCREEN
    +vdc_set_update_addr()
    lda #$20              ; space character
    +vdc_write_byte()     ; seed fill value into reg 31

    lda #8
    sta zp_count          ; loop counter (8 x 250 = 2000)
clear_scr_loop:
    lda #250
    +vdc_block_fill()
    dec zp_count
    bne clear_scr_loop

    ; ----- Step 3: Clear attribute RAM (white on black) -----
    lda #>VDC_ATTRIB
    ldy #<VDC_ATTRIB
    +vdc_set_update_addr()
    lda #$0f              ; white foreground, no special attrs
    +vdc_write_byte()     ; seed fill value

    lda #8
    sta zp_count
clear_attr_loop:
    lda #250
    +vdc_block_fill()
    dec zp_count
    bne clear_attr_loop

    ; ----- Step 4: Draw border -----
    jsr draw_border

    ; ----- Step 5: Draw title -----
    jsr draw_title

    ; ----- Step 6: Draw color bars -----
    jsr draw_color_bars

    ; ----- Step 7: Draw character set sample -----
    jsr draw_charset_sample

    ; ----- Step 8: Draw column markers -----
    jsr draw_col_markers

    ; ----- Step 9: Hide cursor off-screen -----
    lda #$07
    ldx #VDC_REG_CURSOR_HI
    +vdc_write_reg()
    lda #$d0
    ldx #VDC_REG_CURSOR_LO
    +vdc_write_reg()

    cli
    jmp *
}

; ============================================================
; calc_row_addr — Lookup VDC screen RAM address for a row
; Input:  A = row number (0-24)
; Output: A = high byte, Y = low byte
; Clobbers: X
; ============================================================
calc_row_addr: {
    tax
    ldy row_addr_lo,x
    lda row_addr_hi,x
    rts
}

row_addr_lo:
    !byte $00,$50,$a0,$f0,$40,$90,$e0,$30
    !byte $80,$d0,$20,$70,$c0,$10,$60,$b0
    !byte $00,$50,$a0,$f0,$40,$90,$e0,$30,$80
row_addr_hi:
    !byte $00,$00,$00,$00,$01,$01,$01,$02
    !byte $02,$02,$03,$03,$03,$04,$04,$04
    !byte $05,$05,$05,$05,$06,$06,$06,$07,$07

; ============================================================
; print_string — Write null-terminated string to VDC RAM
; Set VDC update address before calling.
; Input:  zp_ptr/zp_ptr+1 = pointer to string data
; Clobbers: A, X, Y, zp_count
; ============================================================
print_string: {
    lda #0
    sta zp_count          ; string index
loop:
    ldy zp_count
    lda (zp_ptr),y
    beq done
    +vdc_write_byte()
    inc zp_count
    jmp loop
done:
    rts
}

; ============================================================
; print_string_ff — Write $FF-terminated string to VDC RAM
; Input:  zp_ptr/zp_ptr+1 = pointer to string data
; ============================================================
print_string_ff: {
    lda #0
    sta zp_count
loop:
    ldy zp_count
    lda (zp_ptr),y
    cmp #$ff
    beq done
    +vdc_write_byte()
    inc zp_count
    jmp loop
done:
    rts
}

; ============================================================
; fill_attr — Fill N attribute bytes with a color value
; Input:  A = color/attr byte, zp_count = count
; Set VDC update address to attribute RAM location first.
; ============================================================
fill_attr: {
    sta zp_tmp            ; save color
loop:
    lda zp_tmp
    +vdc_write_byte()
    dec zp_count
    bne loop
    rts
}

; ============================================================
; draw_border — PETSCII box around the 80×25 screen
; Screen codes: $70=┌ $6E=┐ $6D=└ $7D=┘ $40=─ $5D=│
; ============================================================
draw_border: {
    ; --- Top row (row 0) ---
    lda #>VDC_SCREEN
    ldy #<VDC_SCREEN
    +vdc_set_update_addr()
    lda #$70
    +vdc_write_byte()
    lda #$40
    +vdc_write_byte()     ; seed for fill
    lda #78
    +vdc_block_fill()
    lda #$6e
    +vdc_write_byte()

    ; --- Bottom row (row 24 = $0780) ---
    lda #$07
    ldy #$80
    +vdc_set_update_addr()
    lda #$6d
    +vdc_write_byte()
    lda #$40
    +vdc_write_byte()
    lda #78
    +vdc_block_fill()
    lda #$7d
    +vdc_write_byte()

    ; --- Left & right columns (rows 1-23) ---
    lda #1
    sta zp_row
vert_loop:
    ; Left column: row*80 + 0
    lda zp_row
    jsr calc_row_addr     ; A=hi, Y=lo
    +vdc_set_update_addr()
    lda #$5d
    +vdc_write_byte()

    ; Right column: row*80 + 79
    lda zp_row
    jsr calc_row_addr     ; A=hi, Y=lo
    sta zp_tmp            ; save high byte
    tya
    clc
    adc #79
    tay
    lda zp_tmp
    adc #0                ; add carry
    +vdc_set_update_addr()
    lda #$5d
    +vdc_write_byte()

    inc zp_row
    lda zp_row
    cmp #24
    bne vert_loop
    rts
}

; ============================================================
; draw_title — Print title and subtitle
; ============================================================
draw_title: {
    ; Row 1, col 2 = 82 = $0052
    lda #$00
    ldy #$52
    +vdc_set_update_addr()
    lda #<title_text
    sta zp_ptr
    lda #>title_text
    sta zp_ptr+1
    jsr print_string

    ; Set title attributes — light cyan
    ; Attr addr = $0800 + 82 = $0852
    lda #$08
    ldy #$52
    +vdc_set_update_addr()
    ; zp_count still has string length from print_string
    jsr count_title_len   ; get length into zp_count
    lda #$07              ; light cyan
    jsr fill_attr

    ; Subtitle on row 2, col 2 = 162 = $00A2
    lda #$00
    ldy #$a2
    +vdc_set_update_addr()
    lda #<subtitle_text
    sta zp_ptr
    lda #>subtitle_text
    sta zp_ptr+1
    jsr print_string
    rts
}

count_title_len: {
    lda #0
    sta zp_count
    tay
loop:
    lda title_text,y
    beq done
    inc zp_count
    iny
    jmp loop
done:
    rts
}

; ============================================================
; draw_color_bars — 16 RGBI color samples (rows 4-9)
; ============================================================
draw_color_bars: {
    ; --- Row 4: horizontal divider ($0141) ---
    lda #$01
    ldy #$41
    +vdc_set_update_addr()
    lda #$40
    +vdc_write_byte()
    lda #78
    +vdc_block_fill()

    ; --- Row 5: Color name labels ($0191) ---
    lda #$01
    ldy #$91
    +vdc_set_update_addr()
    lda #<color_labels
    sta zp_ptr
    lda #>color_labels
    sta zp_ptr+1
    jsr print_string_ff

    ; --- Rows 6-7: Solid blocks ($01E0) ---
    lda #$01
    ldy #$e0
    +vdc_set_update_addr()
    lda #$a0              ; reverse space = solid block
    +vdc_write_byte()
    lda #159              ; 160 total (1 already written + 159 fill)
    +vdc_block_fill()

    ; --- Set attribute colors for row 6 ($09E0) ---
    lda #$09
    ldy #$e0
    +vdc_set_update_addr()
    jsr write_color_bar_attrs

    ; --- Set attribute colors for row 7 ($0A30) ---
    lda #$0a
    ldy #$30
    +vdc_set_update_addr()
    jsr write_color_bar_attrs

    ; --- Row 8: Color index numbers ($0281) ---
    lda #$02
    ldy #$81
    +vdc_set_update_addr()
    lda #<color_numbers
    sta zp_ptr
    lda #>color_numbers
    sta zp_ptr+1
    jsr print_string_ff

    ; --- Row 9: horizontal divider ($02D1) ---
    lda #$02
    ldy #$d1
    +vdc_set_update_addr()
    lda #$40
    +vdc_write_byte()
    lda #78
    +vdc_block_fill()
    rts
}

; Write 80 attribute bytes: 16 colors x (4 colored + 1 black)
write_color_bar_attrs: {
    lda #0
    sta zp_ptr            ; color index 0-15
color_loop:
    lda #4
    sta zp_ptr+1          ; inner count
inner:
    lda zp_ptr            ; current color
    +vdc_write_byte()
    dec zp_ptr+1
    bne inner
    lda #$00              ; black spacer
    +vdc_write_byte()
    inc zp_ptr
    lda zp_ptr
    cmp #16
    bne color_loop
    rts
}

; ============================================================
; draw_charset_sample — Screen codes $00–$FF (rows 10-19)
; 8 rows × 32 chars with space separators
; ============================================================
draw_charset_sample: {
    ; Row 10: label ($0322)
    lda #$03
    ldy #$22
    +vdc_set_update_addr()
    lda #<charset_label
    sta zp_ptr
    lda #>charset_label
    sta zp_ptr+1
    jsr print_string

    ; Rows 11-18: sequential screen codes
    lda #0
    sta zp_tmp            ; current screen code (use zp_tmp, not zp_count)
    lda #11
    sta zp_row

cs_row_loop:
    lda zp_row
    jsr calc_row_addr     ; A=hi, Y=lo (safe: doesn't touch zp_tmp)
    sta zp_ptr+1          ; save hi
    tya
    clc
    adc #2                ; col 2
    tay
    lda zp_ptr+1
    adc #0
    +vdc_set_update_addr()

    lda #32
    sta zp_count          ; 32 chars per row
cs_char_loop:
    lda zp_tmp
    +vdc_write_byte()
    lda #$20              ; space separator
    +vdc_write_byte()
    inc zp_tmp
    dec zp_count
    bne cs_char_loop

    inc zp_row
    lda zp_row
    cmp #19
    bne cs_row_loop

    ; --- Row 19: horizontal divider ---
    lda #19
    jsr calc_row_addr
    sta zp_ptr+1
    tya
    clc
    adc #1
    tay
    lda zp_ptr+1
    adc #0
    +vdc_set_update_addr()
    lda #$40
    +vdc_write_byte()
    lda #78
    +vdc_block_fill()
    rts
}

; ============================================================
; draw_col_markers — Column ruler and info text
; ============================================================
draw_col_markers: {
    ; Row 21: column ruler ($0692)
    lda #$06
    ldy #$92
    +vdc_set_update_addr()
    lda #<cols_text
    sta zp_ptr
    lda #>cols_text
    sta zp_ptr+1
    jsr print_string

    ; Row 23: info text ($0732)
    lda #$07
    ldy #$32
    +vdc_set_update_addr()
    lda #<info_text
    sta zp_ptr
    lda #>info_text
    sta zp_ptr+1
    jsr print_string
    ; zp_count = string length after print_string

    ; Set info text attributes — light green ($0F32)
    lda #$0f
    ldy #$32
    +vdc_set_update_addr()
    ; count length of info_text
    lda #0
    sta zp_count
    tay
info_len_loop:
    lda info_text,y
    beq info_len_done
    inc zp_count
    iny
    jmp info_len_loop
info_len_done:
    lda #$05              ; light green
    jsr fill_attr
    rts
}


; ============================================================
; Data — Text strings (screen codes, null-terminated)
;
; Screen code mapping (uppercase/graphics charset):
;   A-Z = $01-$1A,  0-9 = $30-$39
;   space = $20,  - = $2D,  . = $2E
;   $40 = ─  $5D = │
; ============================================================

title_text:
    ; "PETMATE 9 - C128 VDC 80-COLUMN TEST"
    !byte $10,$05,$14,$0d,$01,$14,$05  ; PETMATE
    !byte $20                          ; (space)
    !byte $39                          ; 9
    !byte $20,$2d,$20                  ; " - "
    !byte $03,$31,$32,$38              ; C128
    !byte $20                          ; (space)
    !byte $16,$04,$03                  ; VDC
    !byte $20                          ; (space)
    !byte $38,$30                      ; 80
    !byte $2d                          ; -
    !byte $03,$0f,$0c,$15,$0d,$0e      ; COLUMN
    !byte $20                          ; (space)
    !byte $14,$05,$13,$14              ; TEST
    !byte $00                          ; null terminator

subtitle_text:
    ; "RGBI OUTPUT - 640X200 - 16 COLORS"
    !byte $12,$07,$02,$09              ; RGBI
    !byte $20                          ; (space)
    !byte $0f,$15,$14,$10,$15,$14      ; OUTPUT
    !byte $20,$2d,$20                  ; " - "
    !byte $36,$34,$30,$18,$32,$30,$30  ; 640X200
    !byte $20,$2d,$20                  ; " - "
    !byte $31,$36                      ; 16
    !byte $20                          ; (space)
    !byte $03,$0f,$0c,$0f,$12,$13      ; COLORS
    !byte $00

color_labels:
    ; 16 color labels, 5 chars each (4 chars + space)
    ; "BLK  GRY1 DBLU LBLU DGRN LGRN DCYN LCYN "
    ; "DRED LRED DPUR LPUR BRN  YEL  GRY2 WHT  "
    !byte $02,$0c,$0b,$20,$20          ; "BLK  "
    !byte $07,$12,$19,$31,$20          ; "GRY1 "
    !byte $04,$02,$0c,$15,$20          ; "DBLU "
    !byte $0c,$02,$0c,$15,$20          ; "LBLU "
    !byte $04,$07,$12,$0e,$20          ; "DGRN "
    !byte $0c,$07,$12,$0e,$20          ; "LGRN "
    !byte $04,$03,$19,$0e,$20          ; "DCYN "
    !byte $0c,$03,$19,$0e,$20          ; "LCYN "
    !byte $04,$12,$05,$04,$20          ; "DRED "
    !byte $0c,$12,$05,$04,$20          ; "LRED "
    !byte $04,$10,$15,$12,$20          ; "DPUR "
    !byte $0c,$10,$15,$12,$20          ; "LPUR "
    !byte $02,$12,$0e,$20,$20          ; "BRN  "
    !byte $19,$05,$0c,$20,$20          ; "YEL  "
    !byte $07,$12,$19,$32,$20          ; "GRY2 "
    !byte $17,$08,$14,$20,$20          ; "WHT  "
    !byte $ff                          ; terminator

color_numbers:
    ; " 0    1    2    3    4    5    6    7    8    9   10   11   12   13   14   15  "
    !byte $20,$30,$20,$20,$20          ; " 0   "
    !byte $20,$31,$20,$20,$20          ; " 1   "
    !byte $20,$32,$20,$20,$20          ; " 2   "
    !byte $20,$33,$20,$20,$20          ; " 3   "
    !byte $20,$34,$20,$20,$20          ; " 4   "
    !byte $20,$35,$20,$20,$20          ; " 5   "
    !byte $20,$36,$20,$20,$20          ; " 6   "
    !byte $20,$37,$20,$20,$20          ; " 7   "
    !byte $20,$38,$20,$20,$20          ; " 8   "
    !byte $20,$39,$20,$20,$20          ; " 9   "
    !byte $31,$30,$20,$20,$20          ; "10   "
    !byte $31,$31,$20,$20,$20          ; "11   "
    !byte $31,$32,$20,$20,$20          ; "12   "
    !byte $31,$33,$20,$20,$20          ; "13   "
    !byte $31,$34,$20,$20,$20          ; "14   "
    !byte $31,$35,$20,$20,$20          ; "15   "
    !byte $ff

charset_label:
    ; "CHARACTER SET (SCREEN CODES $00-$FF):"
    !byte $03,$08,$01,$12,$01,$03,$14,$05,$12  ; CHARACTER
    !byte $20                                  ; (space)
    !byte $13,$05,$14                          ; SET
    !byte $20,$28                              ; " ("
    !byte $13,$03,$12,$05,$05,$0e              ; SCREEN
    !byte $20                                  ;
    !byte $03,$0f,$04,$05,$13                  ; CODES
    !byte $20                                  ;
    !byte $24,$30,$30,$2d,$24,$06,$06          ; $00-$FF
    !byte $29,$3a                              ; "):"
    !byte $00

cols_text:
    ; "80 COLUMNS: 0----+----1----+----2----+----3----+----4----+----5----+----6----+----7----+---"
    !byte $38,$30,$20,$03,$0f,$0c,$15,$0d,$0e,$13,$3a,$20  ; "80 COLUMNS: "
    !byte $30,$2d,$2d,$2d,$2d,$2b,$2d,$2d,$2d,$2d          ; "0----+----"
    !byte $31,$2d,$2d,$2d,$2d,$2b,$2d,$2d,$2d,$2d          ; "1----+----"
    !byte $32,$2d,$2d,$2d,$2d,$2b,$2d,$2d,$2d,$2d          ; "2----+----"
    !byte $33,$2d,$2d,$2d,$2d,$2b,$2d,$2d,$2d,$2d          ; "3----+----"
    !byte $34,$2d,$2d,$2d,$2d,$2b,$2d,$2d,$2d,$2d          ; "4----+----"
    !byte $35,$2d,$2d,$2d,$2d,$2b,$2d,$2d,$2d,$2d          ; "5----+----"
    !byte $36,$2d,$2d,$2d,$2d,$2b,$2d,$2d,$2d,$2d          ; "6----+----"
    !byte $37                                              ; "7"
    !byte $00

info_text:
    ; "VDC 8563/8568 - ACTIVE ON RGBI MONITOR - ACTIVE ON RGBI MONITOR"
    !byte $16,$04,$03                  ; VDC
    !byte $20                          ;
    !byte $38,$35,$36,$33              ; 8563
    !byte $2f                          ; /
    !byte $38,$35,$36,$38              ; 8568
    !byte $20,$2d,$20                  ; " - "
    !byte $10,$05,$14,$0d,$01,$14,$05  ; PETMATE
    !byte $20,$39,$20                  ; " 9 "
    !byte $16,$04,$03                  ; VDC
    !byte $20                          ;
    !byte $14,$05,$13,$14              ; TEST
    !byte $20                          ;
    !byte $10,$01,$14,$14,$05,$12,$0e  ; PATTERN
    !byte $00
