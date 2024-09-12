import { readFile } from 'node:fs/promises'
import { OutputInfo } from 'sharp'
import { palette } from './quantizer.js'

// TODO: use CamelCase?
export type Byte = number
export type Char = Byte[] // 8 bytes
export type PixelColor = Byte[] // TODO: make r, g, b
export type CharSet = Char[]
export type Tile = PixelColor[][] // 8 x 8 pixels

export interface SharpImage {
  data: Buffer
  info: OutputInfo
}

const bytesPerChar = 8

const mask: Byte[] = [0b10000000, 0b01000000, 0b00100000, 0b00010000, 0b00001000, 0b00000100, 0b00000010, 0b00000001]

// array of offsets for each Char in charData
export function charOffsets (charData: Byte[]): number[] {
  return Array(charData.length / bytesPerChar)
    .fill(0)
    .map((_v, i: number) => i * bytesPerChar)
}

// callback (index, array of 8 bytes)
export function forEachCharIn (charData: Byte[], callback: (index: number, charData: Byte[]) => void): void {
  charOffsets(charData).forEach((offset: number, i: number): void => {
    callback(i, charData.slice(offset, offset + bytesPerChar))
  })
}

// the number of bits set to 1 in a Byte
export function countBits (b: Byte): number {
  return mask.filter(m => (b & m) !== 0).length
}

// convert a Byte to 8 pixels. bit 1 will be color, bit 0 will be background color
export function byte2Pixels (b: Byte, color: number, backgroundColor: number): PixelColor[] {
  return mask.map(m => ((b & m) !== 0 ? palette[color] : palette[backgroundColor]))
}

// hamming distance between two bytes (= number of bits that are the same)
export function hamming (b1: Byte, b2: Byte): number {
  return countBits(b1 ^ b2)
}

// euclidian distance between color channels
// pixels are arrays of 3 number (r, g ,b)
export function distance (p1: PixelColor, p2: PixelColor): number {
  return Math.sqrt((p1[0] - p2[0]) ** 2 + (p1[1] - p2[1]) ** 2 + (p1[2] - p2[2]) ** 2)
}

// return average of all channels of an [r, g, b] PixelColor
export function pixelLuminance (p: PixelColor): number {
  return (p[0] + p[1] + p[2]) / 3
}

export function imageCoordinatesToByteOffset (img: SharpImage, x: number, y: number): number {
  // assume 1 Byte per channel
  return (y * img.info.width + x) * img.info.channels
}

// return an array of offsets into SharpImage.data that correspond with the start of each 8x8 cell
export function cellOffsets (img: SharpImage): number[] {
  const cols: number = img.info.width >> 3
  const rows: number = img.info.height >> 3
  return Array(rows)
    .fill(0)
    .map((_v, row) =>
      Array(cols)
        .fill(0)
        .map((_v, col) => imageCoordinatesToByteOffset(img, col * 8, row * 8))
    )
    .flat()
}

// parse an 8 palette index row to a hires Byte
// backgroundcolor is [r, g, b]
export function parseHiresByteFromPixelRow (tileRow: PixelColor[], backgroundColor: PixelColor): Byte {
  return mask.filter((_m, i) => distance(tileRow[i], backgroundColor) > 64).reduce((a, v) => a | v, 0)
}

// get an 8 PixelColor row as array of pixels from SharpImage. pixels are [r, g, b]
export function parse8pixelRow (img: SharpImage, offset: number): PixelColor[] {
  const result: PixelColor[] = []
  for (let i = 0; i < 8; i++) {
    const firstChannelOffset: number = offset + i * img.info.channels
    result.push([img.data[firstChannelOffset], img.data[firstChannelOffset + 1], img.data[firstChannelOffset + 2]])
  }
  return result
}

// map c64 Byte order to "normal" Byte order
export function mapByteOrder (offset: number, bytesPerRow: number): number {
  const x: number = Math.floor(offset / bytesPerChar) % bytesPerRow
  const y: number = Math.floor(offset / (bytesPerRow * bytesPerChar)) * bytesPerChar + (offset % bytesPerChar)
  return y * bytesPerRow + x
}

// read the characters from a binary character set
// return: an array of 8-Byte arrays
export async function readChars (filename: string): Promise<CharSet> {
  const buffer: Buffer = await readFile(filename)

  // read only the first charset
  const charData: Byte[] = Array.from(buffer).slice(0, 255 * 8)

  const chars: CharSet = []
  forEachCharIn(charData, (_i: number, charBytes: Byte[]) => chars.push(charBytes))
  return chars
}

// async function saveChars (chars) {
//   await writeFile('tiles.bin', Uint8Array.from(cells.flat()))
// }
