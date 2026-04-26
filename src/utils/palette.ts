
import { Rgb, PaletteName, vic20PaletteName, petPaletteName, tedPaletteName } from '../redux/types'

const palette: Rgb[] = [
  {r:0x00, g:0x00, b:0x00},
  {r:0xff, g:0xff, b:0xff},
  {r:146, g:74, b:64},
  {r:132, g:197, b:204},
  {r:147, g:81, b:182},
  {r:114, g:177, b:75},
  {r:72, g:58, b:164},
  {r:213, g:223, b:124},
  {r:153, g:105, b:45},
  {r:103, g:82, b:1},
  {r:192, g:129, b:120},
  {r:96, g:96, b:96},
  {r:138, g:138, b:138},
  {r:178, g:236, b:145},
  {r:134, g:122, b:222},
  {r:174, g:174, b:174},
];

function hexToRgb(hex: string): Rgb {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) {
    throw new Error('hexToRgb: impossible -- must mean a syntax error in color defs in palette.ts');
  }
  return {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
  };
}

const colodore = [
  "#000000","#ffffff","#813338","#75cec8",
  "#8e3c97","#56ac4d","#2e2c9b","#edf171",
  "#8e5029","#553800","#c46c71","#4a4a4a",
  "#7b7b7b","#a9ff9f","#706deb","#b2b2b2"
];

const pepto = [
  "#000000","#ffffff","#67372d","#73a3b1",
  "#6e3e83","#5b8d48","#362976","#b7c576",
  "#6c4f2a","#423908","#98675b","#444444",
  "#6c6c6c","#9dd28a","#6d5fb0","#959595"
];

const vice = [
  "#000000","#ffffff","#b96a54","#acf3fe",
  "#be73f8","#9ae35b","#695af1","#fffd84",
  "#c5913c","#8c7817","#f3ab98","#818181",
  "#b6b6b6","#dcfea3","#b1a0fc","#e0e0e0"
];

const vic20ntsc = [
 "#000000",
"#ffffff",
"#f91137",
"#35f9f6",
"#ff3cc6",
"#3ceda9",
"#0f57f7",
"#fee963",
"#fb6244",
"#fbbfde",
"#f3ace5",
"#a8eadd",
"#e6b8f7",
"#abdda4",
"#6ab3e7",
"#f7daa5"
]

const vic20pal = [
  "#000000",
 "#ffffff",
 "#ae2627",
 "#6deffe",
 "#b140fe",
 "#5de139",
 "#3331fd",
 "#dad729",
 "#c25714",
 "#e4b175",
 "#e19394",
 "#a6f6fc",
 "#dda0fe",
 "#98e393",
 "#878ffe",
 "#e3de87"
 ]

 const petwhite = [
  "#000000",
 "#ffffff",
 "#000000",
 "#000000",
 "#000000",
 "#000000",
 "#000000",
 "#000000",
 "#000000",
 "#000000",
 "#000000",
 "#000000",
 "#000000",
 "#000000",
 "#000000",
 "#000000",

]
const petgreen = [
  "#000000",
 "#41ff00",
 "#000000",
 "#000000",
 "#000000",
 "#000000",
 "#000000",
 "#000000",
 "#000000",
 "#000000",
 "#000000",
 "#000000",
 "#000000",
 "#000000",
 "#000000",
 "#000000",

]

const petamber = [
"#000000",
"#ffa800",
"#000000",
"#000000",
"#000000",
"#000000",
"#000000",
"#000000",
"#000000",
"#000000",
"#000000",
"#000000",
"#000000",
"#000000",
"#000000",
"#000000"
]



// VDC RGBI palette (CGA-compatible, 16 colors)
// This is a fixed hardware palette — no user variants.
const vdcRGBI = [
  "#000000",  //  0  Black
  "#555555",  //  1  Dark Gray
  "#0000AA",  //  2  Dark Blue
  "#5555FF",  //  3  Light Blue
  "#00AA00",  //  4  Dark Green
  "#55FF55",  //  5  Light Green
  "#00AAAA",  //  6  Dark Cyan
  "#55FFFF",  //  7  Light Cyan
  "#AA0000",  //  8  Dark Red
  "#FF5555",  //  9  Light Red
  "#AA00AA",  // 10  Dark Purple
  "#FF55FF",  // 11  Light Purple
  "#AA5500",  // 12  Brown (CGA brown-fix)
  "#FFFF55",  // 13  Yellow
  "#AAAAAA",  // 14  Light Gray
  "#FFFFFF",  // 15  White
];

export const vdcPalette: Rgb[] = vdcRGBI.map(hexToRgb);

export const colorPalettes: {[k in PaletteName]: Rgb[]} = {
  'petmate': palette,
  'colodore': colodore.map(hexToRgb),
  'pepto': pepto.map(hexToRgb),
  'vice': vice.map(hexToRgb),

};
export const vic20ColorPalettes: {[k in vic20PaletteName]: Rgb[]} = {

  'vic20ntsc': vic20ntsc.map(hexToRgb),
  'vic20pal': vic20pal.map(hexToRgb),
  }

  export const petColorPalettes: {[k in petPaletteName]: Rgb[]} = {

    'petwhite': petwhite.map(hexToRgb),
    'petgreen': petgreen.map(hexToRgb),
    'petamber': petamber.map(hexToRgb),
    }

// ── TED (C16/Plus4) palettes ─────────────────────────────────────
// 128 entries each, indexed by TED color byte: (luminance << 4) | hue
// Hue 0 = black at all luminances; hues 1-15 × 8 luminance levels.

function buildTedPalette(hueTable: string[][]): Rgb[] {
  const out: Rgb[] = [];
  for (let lum = 0; lum < 8; lum++) {
    for (let hue = 0; hue < 16; hue++) {
      out.push(hexToRgb(hueTable[hue][lum]));
    }
  }
  return out;
}

// PAL hue data: [hue][luminance 0-7]
const tedPALHues: string[][] = [
  /*  0 Black   */ ['#000000','#000000','#000000','#000000','#000000','#000000','#000000','#000000'],
  /*  1 White   */ ['#202020','#404040','#606060','#808080','#9f9f9f','#bfbfbf','#dfdfdf','#ffffff'],
  /*  2 Red     */ ['#651517','#722224','#7c2c2e','#8b3b3d','#ad5d5f','#d18183','#e79799','#ffcdcf'],
  /*  3 Cyan    */ ['#004643','#045350','#0c5d5a','#1b6c69','#3d8e8b','#61b2af','#77c8c5','#adf2f0'],
  /*  4 Purple  */ ['#5b0a6a','#681777','#722181','#813090','#a352b2','#c776d6','#dd8cec','#fcc2ff'],
  /*  5 Green   */ ['#005101','#085e09','#126813','#217722','#439944','#67bd68','#7dd37e','#b3f7b4'],
  /*  6 Blue    */ ['#202190','#2d2e9d','#3738a7','#4647b6','#6869d8','#8c8df5','#a2a3ff','#d8d9ff'],
  /*  7 Yellow  */ ['#3a3a00','#474700','#515100','#606000','#828212','#a6a636','#bcbc4c','#ecec82'],
  /*  8 Orange  */ ['#592300','#663000','#703a05','#804912','#a16b34','#c58f58','#dba56e','#fbdba4'],
  /*  9 Brown   */ ['#4c2f00','#593c00','#634600','#725503','#94771e','#b89b42','#ceb158','#f5e68e'],
  /* 10 YelGrn  */ ['#1e4800','#2b5500','#355f00','#446e00','#669012','#8ab436','#a0ca4c','#d6f382'],
  /* 11 Pink    */ ['#661031','#731d3e','#7d2748','#8c3657','#ae5879','#d27c9d','#e892b3','#ffc8e7'],
  /* 12 BluGrn  */ ['#004b2d','#04583a','#0b6244','#1a7153','#3c9375','#60b799','#76cdaf','#acf4e5'],
  /* 13 LtBlue  */ ['#0b2f7e','#183c8b','#224695','#3155a4','#5377c6','#779bea','#8db1f6','#c3e6ff'],
  /* 14 DkBlue  */ ['#2d1995','#3a26a2','#4430ac','#533fbb','#7561dd','#9985f7','#af9bff','#e5d1ff'],
  /* 15 LtGreen */ ['#0e4e00','#1b5b00','#256500','#347404','#569620','#7aba44','#90d05a','#c6f690'],
];

// NTSC hue data: [hue][luminance 0-7]
const tedNTSCHues: string[][] = [
  /*  0 Black   */ ['#000000','#000000','#000000','#000000','#000000','#000000','#000000','#000000'],
  /*  1 White   */ ['#202020','#404040','#606060','#808080','#9f9f9f','#bfbfbf','#dfdfdf','#ffffff'],
  /*  2 Red     */ ['#580902','#782922','#984942','#b86962','#d88882','#f7a8a2','#ffc8c2','#ffe8e2'],
  /*  3 Cyan    */ ['#00373d','#08575d','#27777d','#47969d','#67b6bd','#87d6dd','#a7f6fd','#c7ffff'],
  /*  4 Purple  */ ['#4b0056','#6b1f76','#8b3f96','#aa5fb6','#ca7fd6','#ea9ff6','#ffbfff','#ffdfff'],
  /*  5 Green   */ ['#004000','#156009','#358029','#55a049','#74c069','#94e089','#b4ffa9','#d4ffc9'],
  /*  6 Blue    */ ['#20116d','#40318d','#6051ac','#8071cc','#9f90ec','#bfb0ff','#dfd0ff','#fff0ff'],
  /*  7 Yellow  */ ['#202f00','#404f00','#606f13','#808e33','#9fae53','#bfce72','#dfee92','#ffffb2'],
  /*  8 Orange  */ ['#4b1500','#6b3409','#8b5429','#aa7449','#ca9469','#eab489','#ffd4a9','#fff4c9'],
  /*  9 Brown   */ ['#372200','#574200','#776219','#978139','#b7a158','#d7c178','#f6e198','#ffffb8'],
  /* 10 YelGrn  */ ['#093a00','#285900','#487919','#689939','#88b958','#a8d978','#c8f998','#e8ffb8'],
  /* 11 Pink    */ ['#5d0120','#7d2140','#9c4160','#bc6180','#dc809f','#fca0bf','#ffc0df','#ffe0ff'],
  /* 12 BluGrn  */ ['#003f20','#035f40','#237f60','#439e80','#63be9f','#82debf','#a2fedf','#c2ffff'],
  /* 13 LtBlue  */ ['#002b56','#154b76','#356b96','#558bb6','#74abd6','#94cbf6','#b4eaff','#d4ffff'],
  /* 14 DkBlue  */ ['#370667','#572687','#7746a7','#9766c6','#b786e6','#d7a6ff','#f6c5ff','#ffe5ff'],
  /* 15 LtGreen */ ['#004202','#086222','#278242','#47a262','#67c282','#87e2a2','#a7ffc2','#c7ffe2'],
];

const tedPALData = buildTedPalette(tedPALHues);
const tedNTSCData = buildTedPalette(tedNTSCHues);

export const tedColorPalettes: {[k in tedPaletteName]: Rgb[]} = {
  'tedPAL': tedPALData,
  'tedNTSC': tedNTSCData,
};

// Standard C64 color names by index
export const C64_COLOR_NAMES: string[] = [
  'Black', 'White', 'Red', 'Cyan',
  'Purple', 'Green', 'Blue', 'Yellow',
  'Orange', 'Brown', 'Light Red', 'Dark Grey',
  'Grey', 'Light Green', 'Light Blue', 'Light Grey'
];

// VIC-20 PAL color names by index
export const VIC20_PAL_COLOR_NAMES: string[] = [
  'Black', 'White', 'Red', 'Cyan',
  'Purple', 'Green', 'Blue', 'Yellow',
  'Orange', 'Light Orange', 'Pink', 'Light Cyan',
  'Light Purple', 'Light Green', 'Light Blue', 'Light Yellow'
];

// VIC-20 NTSC color names by index (NTSC chroma produces different hues)
export const VIC20_NTSC_COLOR_NAMES: string[] = [
  'Black', 'White', 'Red', 'Cyan',
  'Purple', 'Green', 'Blue', 'Yellow',
  'Orange', 'Light Pink', 'Pink', 'Light Cyan',
  'Light Purple', 'Light Green', 'Light Blue', 'Light Yellow'
];

// PET color names (only 2 meaningful colors)
export const PET_COLOR_NAMES: string[] = [
  'Background', 'Foreground',
  '', '', '', '', '', '',
  '', '', '', '', '', '', '', ''
];

// VDC RGBI color names by index
export const VDC_COLOR_NAMES: string[] = [
  'Black', 'Dark Gray', 'Dark Blue', 'Light Blue',
  'Dark Green', 'Light Green', 'Dark Cyan', 'Light Cyan',
  'Dark Red', 'Light Red', 'Dark Purple', 'Light Purple',
  'Brown', 'Yellow', 'Light Gray', 'White'
];

// TED (C16/Plus4) hue names by hue index 0-15
export const TED_HUE_NAMES: string[] = [
  'Black', 'White', 'Red', 'Cyan',
  'Purple', 'Green', 'Blue', 'Yellow',
  'Orange', 'Brown', 'Yellow-Green', 'Pink',
  'Blue-Green', 'Light Blue', 'Dark Blue', 'Light Green'
];

/** Get a human-readable name for a TED color byte. */
export function getTEDColorName(tedByte: number): string {
  const hue = tedByte & 0x0f;
  const lum = (tedByte >> 4) & 0x07;
  if (hue === 0) return 'Black';
  return `${TED_HUE_NAMES[hue]} L${lum}`;
}

export function getColorName(idx: number, charset: string, width?: number): string {
  const prefix = charset.substring(0, 3);
  if (prefix === 'c16') {
    return getTEDColorName(idx);
  } else if (prefix === 'vic') {
    const names = charset.includes('pal') ? VIC20_PAL_COLOR_NAMES : VIC20_NTSC_COLOR_NAMES;
    return names[idx] || `Color ${idx}`;
  } else if (prefix === 'pet') {
    return PET_COLOR_NAMES[idx] || `Color ${idx}`;
  } else if (charset === 'c128vdc') {
    return VDC_COLOR_NAMES[idx] || `Color ${idx}`;
  } else if (prefix === 'c12' && width !== undefined && width >= 80) {
    return VDC_COLOR_NAMES[idx] || `Color ${idx}`;
  }
  return C64_COLOR_NAMES[idx] || `Color ${idx}`;
}

function luminance(color: Rgb): number {
  const r = color.r / 255;
  const g = color.g / 255;
  const b = color.b / 255;
  return (r + r + b + g + g + g) / 6;
}

export function sortPaletteByLuma(
  paletteRemap: number[],
  colorPalette: Rgb[],
  mode: 'default' | 'luma-light-dark' | 'luma-dark-light'
): number[] {
  if (mode === 'default') {
    return paletteRemap;
  }
  const sorted = [...paletteRemap].sort((a, b) => {
    const lumA = luminance(colorPalette[a]);
    const lumB = luminance(colorPalette[b]);
    return mode === 'luma-light-dark'
      ? lumB - lumA
      : lumA - lumB;
  });
  return sorted;
}

/**
 * Step a color index to the next brighter or darker color in the palette,
 * ordered by luminance.  `numColors` limits the usable palette size
 * (e.g. 8 for VIC-20, 2 for PET, 16 for C64).
 */
/**
 * Default foreground colour per computer-type group.
 * Used as fallback when no saved colour exists for a group.
 */
export const DEFAULT_COLORS_BY_GROUP: Record<string, number> = {
  c64: 14,       // light blue
  vic20: 6,      // blue
  pet: 1,        // foreground
  c128vdc: 15,   // white
  c16: 0x00,     // TED black (Plus/4 default text is black on white)
};

/**
 * Derive the colour-group key for a screen based on its charset and width.
 * Screens in the same group share a global foreground colour.
 *
 * Groups:
 *  'c64'      – C64, C128 40-col, C16, DirArt, Cbase, custom fonts
 *  'vic20'    – VIC-20
 *  'pet'      – PET
 *  'c128vdc'  – C128 VDC 80-col
 */
export function getColorGroup(charset: string, width: number): string {
  const prefix = charset.substring(0, 3);
  if (prefix === 'c16') return 'c16';
  if (prefix === 'vic') return 'vic20';
  if (prefix === 'pet') return 'pet';
  // The dedicated `c128vdc` charset is always part of the VDC group, no
  // matter what dimensions it ends up at.  Legacy `c128Upper`/`c128Lower`
  // still fall back to the VDC group only when their width hits 80 cols
  // so existing 80-col workspaces keep their VDC colours.
  if (charset === 'c128vdc') return 'c128vdc';
  if (charset.startsWith('c128') && width >= 80) return 'c128vdc';
  return 'c64';
}

export function getNextColorByLuma(
  colorPalette: Rgb[],
  currentColor: number,
  direction: 'lighter' | 'darker',
  numColors: number,
): number {
  // Build indices sorted by luminance ascending (darkest first)
  const indices = Array.from({ length: numColors }, (_, i) => i);
  indices.sort((a, b) => luminance(colorPalette[a]) - luminance(colorPalette[b]));

  const pos = indices.indexOf(currentColor);
  if (pos === -1) return currentColor;

  let targetPos: number;
  if (direction === 'lighter') {
    targetPos = Math.min(indices.length - 1, pos + 1);
  } else {
    targetPos = Math.max(0, pos - 1);
  }
  return indices[targetPos];
}
