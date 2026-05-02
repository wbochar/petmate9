; ============================================================
; vdc_dump_to_ram.asm
; C128 VDC helper: copy visible VDC text/attribute RAM into
; CPU-accessible RAM so Ultimate /v1/machine:readmem can fetch it.
;
; Output layout (CPU RAM):
;   $3000-$37CF  : VDC screen bytes   (2000 bytes)
;   $3800-$3FCF  : VDC attribute bytes (2000 bytes)
;   $2FF0-$2FFF  : status/metadata block (16 bytes)
;
; Status block format at $2FF0:
;   +0..+3  magic  "VDCD"  (56 44 43 44)
;   +4      version (01)
;   +5      state   (00=running, 01=done)
;   +6      VDC screen source high (reg 12)
;   +7      VDC screen source low  (reg 13)
;   +8      VDC attr source high   (reg 20)
;   +9      VDC attr source low    (reg 21)
;   +10     copy length low  ($D0 = 2000 bytes)
;   +11     copy length high ($07)
;   +12     XOR checksum of copied screen block
;   +13     XOR checksum of copied attr block
;   +14/+15 reserved
;
; Build:
;   npx c64jasm --out vdc_dump_to_ram.prg vdc_dump_to_ram.asm
; Run:
;   SYS 4864   (entry at $1300)
; ============================================================

!include "macros_vdc.asm"

!let DEST_SCREEN = $3000
!let DEST_ATTR   = $3800
!let COPY_LEN_LO = $d0            ; 2000 bytes = $07D0
!let COPY_LEN_HI = $07

!let STATUS_BASE           = $2ff0
!let STATUS_MAGIC0         = STATUS_BASE + 0
!let STATUS_MAGIC1         = STATUS_BASE + 1
!let STATUS_MAGIC2         = STATUS_BASE + 2
!let STATUS_MAGIC3         = STATUS_BASE + 3
!let STATUS_VERSION        = STATUS_BASE + 4
!let STATUS_STATE          = STATUS_BASE + 5
!let STATUS_SRC_SCREEN_HI  = STATUS_BASE + 6
!let STATUS_SRC_SCREEN_LO  = STATUS_BASE + 7
!let STATUS_SRC_ATTR_HI    = STATUS_BASE + 8
!let STATUS_SRC_ATTR_LO    = STATUS_BASE + 9
!let STATUS_COUNT_LO       = STATUS_BASE + 10
!let STATUS_COUNT_HI       = STATUS_BASE + 11
!let STATUS_CSUM_SCREEN    = STATUS_BASE + 12
!let STATUS_CSUM_ATTR      = STATUS_BASE + 13
!let STATUS_RESERVED14     = STATUS_BASE + 14
!let STATUS_RESERVED15     = STATUS_BASE + 15

; Zero-page scratch
!let zp_dest     = $fb            ; destination pointer (lo/hi)
!let zp_count_lo = $fd            ; copy counter low byte
!let zp_count_hi = $fe            ; copy counter high byte
* = $1300

entry: {
    sei

    ; Signature + initial status
    lda #$56                       ; 'V'
    sta STATUS_MAGIC0
    lda #$44                       ; 'D'
    sta STATUS_MAGIC1
    lda #$43                       ; 'C'
    sta STATUS_MAGIC2
    lda #$44                       ; 'D'
    sta STATUS_MAGIC3
    lda #$01
    sta STATUS_VERSION
    lda #$00
    sta STATUS_STATE
    sta STATUS_CSUM_SCREEN
    sta STATUS_CSUM_ATTR
    sta STATUS_RESERVED14
    sta STATUS_RESERVED15
    lda #COPY_LEN_LO
    sta STATUS_COUNT_LO
    lda #COPY_LEN_HI
    sta STATUS_COUNT_HI

    ; Read current VDC screen/attribute start addresses
    ldx #$0c                       ; VDC screen start hi
    +vdc_read_reg()
    sta STATUS_SRC_SCREEN_HI
    ldx #$0d                       ; VDC screen start lo
    +vdc_read_reg()
    sta STATUS_SRC_SCREEN_LO
    ldx #$14                       ; VDC attr start hi
    +vdc_read_reg()
    sta STATUS_SRC_ATTR_HI
    ldx #$15                       ; VDC attr start lo
    +vdc_read_reg()
    sta STATUS_SRC_ATTR_LO

    ; ------------------------------------------------------------
    ; Copy VDC screen matrix -> $3000
    ; ------------------------------------------------------------
    lda STATUS_SRC_SCREEN_HI
    ldy STATUS_SRC_SCREEN_LO
    +vdc_set_update_addr()

    lda #<DEST_SCREEN
    sta zp_dest
    lda #>DEST_SCREEN
    sta zp_dest+1
    lda #COPY_LEN_LO
    sta zp_count_lo
    lda #COPY_LEN_HI
    sta zp_count_hi

screen_copy_loop:
    ldx #VDC_REG_DATA
    +vdc_read_reg()
    ldy #$00
    sta (zp_dest),y
    eor STATUS_CSUM_SCREEN
    sta STATUS_CSUM_SCREEN
    jsr inc_dest_ptr
    jsr dec_count
    bne screen_copy_loop

    ; ------------------------------------------------------------
    ; Copy VDC attribute matrix -> $3800
    ; ------------------------------------------------------------
    lda STATUS_SRC_ATTR_HI
    ldy STATUS_SRC_ATTR_LO
    +vdc_set_update_addr()

    lda #<DEST_ATTR
    sta zp_dest
    lda #>DEST_ATTR
    sta zp_dest+1
    lda #COPY_LEN_LO
    sta zp_count_lo
    lda #COPY_LEN_HI
    sta zp_count_hi

attr_copy_loop:
    ldx #VDC_REG_DATA
    +vdc_read_reg()
    ldy #$00
    sta (zp_dest),y
    eor STATUS_CSUM_ATTR
    sta STATUS_CSUM_ATTR
    jsr inc_dest_ptr
    jsr dec_count
    bne attr_copy_loop

    lda #$01
    sta STATUS_STATE

    cli
    rts
}

; ------------------------------------------------------------
; Increment destination pointer at zp_dest/zp_dest+1
; ------------------------------------------------------------
inc_dest_ptr: {
    inc zp_dest
    bne done
    inc zp_dest+1
done:
    rts
}

; ------------------------------------------------------------
; 16-bit decrement on zp_count_hi:zp_count_lo
; Returns with Z=1 when counter reaches 0, else Z=0.
; ------------------------------------------------------------
dec_count: {
    sec
    lda zp_count_lo
    sbc #1
    sta zp_count_lo
    lda zp_count_hi
    sbc #0
    sta zp_count_hi
    ora zp_count_lo
    rts
}
