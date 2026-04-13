
import { Rgb, PaletteName, vic20PaletteName, petPaletteName } from '../redux/types'

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

export function getColorName(idx: number, charset: string, width?: number): string {
  const prefix = charset.substring(0, 3);
  if (prefix === 'vic') {
    const names = charset.includes('pal') ? VIC20_PAL_COLOR_NAMES : VIC20_NTSC_COLOR_NAMES;
    return names[idx] || `Color ${idx}`;
  } else if (prefix === 'pet') {
    return PET_COLOR_NAMES[idx] || `Color ${idx}`;
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
