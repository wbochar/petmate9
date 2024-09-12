import sharp from 'sharp'
import { Petmate } from './petmate'
import {
  readChars,
  parse8pixelRow,
  imageCoordinatesToByteOffset,
  cellOffsets,
  byte2Pixels,
  distance,
  Byte,
  PixelColor,
  Tile,
  SharpImage,
  Char,
  CharSet
} from './graphics.js'
import { quantize, quantize2index } from './quantizer'
import { toPetmate, ScreenCell, Screen } from './petmate'

interface WeightedScreenCell {
  cell: ScreenCell
  distance: number
}

enum MatchType {
  slow,
  fast
}

interface Config {
  medianFilter: number
  matcher: MatchType
  allowedChars: number[]
}

const allChars: Byte[] = Array(255)
  .fill(0)
  .map((_c, i) => i)

const defaultConfig: Config = {
  medianFilter: 1,
  matcher: MatchType.slow,
  allowedChars: allChars.slice(0x40, 0x80).concat(allChars.slice(0xc0, 0x100))
}

const supportedChars: Byte[] = allChars
// const supportedChars = allChars.slice(64, 128).concat(allChars.slice(192, 256))
// const supportedChars: Byte[] = [0x20,0xa0,0x66,0x68,0x5c,0xe8,0xdc,0xe6,0x51,0x57,0xd1,0xd7,0x5a,0xda,0x5b,0xdb,0x56,0x7f]
// const supportedChars: Byte[] = [0x20,0xa0,0x66,0x68,0x5c,0xe8,0xdc,0xe6,0x5f,0x69,0xdf,0xe9]
// const supportedChars = allChars.slice(0x40, 0x80).concat(allChars.slice(0xc0, 0x100))
const cols = 40
const rows = 25
const width: number = cols * 8
const height: number = rows * 8
const supportedExtensions: string[] = ['.png', '.jpg', '.webp']

// load and scale the image
async function loadFile (filename: string, config: Config): Promise<SharpImage> {
  return await sharp(filename)
    .resize(width, height)
    .removeAlpha()
    .median(config.medianFilter)
    .raw()
    .toBuffer({ resolveWithObject: true })
}

// pixels is an array of color indices
function mostOccuringColorIndex (pixels: number[]): number {
  const counts: number[] = Array(16).fill(0)
  pixels.forEach(p => counts[p]++)

  return counts.map((c, i) => [i, c]).reduce((a, v) => (v[1] > a[1] ? v : a), [0, 0])[0]
}

// function bestBackgroundColor (img: SharpImage): number {
  // return mostOccuringColorIndex(quantize(img))
// }

// convert a Char (8 bytes) to a colored tile (8 x 8 [r, g, b] pixels)
function char2Tile (char: Char, color: number, backgroundColor: number): Tile {
  return Array.from(char).map(b => byte2Pixels(b, color, backgroundColor))
}

function bestCell (allDistances: WeightedScreenCell[]) {
  const winner: WeightedScreenCell = allDistances.reduce((a, v) => (v.distance < a.distance ? v : a), {
    cell: {
      code: 0,
      color: 0
    },
    distance: Number.MAX_VALUE
  })

  return winner.cell
}

// sum of all distances between corresponding pixels in both rows
function tileRowDistance (row1: PixelColor[], row2: PixelColor[]): number {
  return row1.map((p, i) => distance(p, row2[i])).reduce((a, v) => a + v, 0)
}

// calculate the total color distance between each pixel in both tiles
function tileDistance (t1: Tile, t2: Tile): number {
  return t1.map((row, i) => tileRowDistance(row, t2[i])).reduce((a, v) => a + v, 0)
}

function bestMatch (tile: Tile, chars: CharSet, backgroundColor: number): ScreenCell {
  let finalDistances: WeightedScreenCell[] = []

  Array(16)
    .fill(0)
    .filter((_v, i) => i !== backgroundColor)
    .forEach((_v, bestColor) => {
      const distances: WeightedScreenCell[] = supportedChars.map(charIndex => {
        const charTile = char2Tile(chars[charIndex], bestColor, backgroundColor)
        const cell: ScreenCell = { code: charIndex, color: bestColor }
        return { cell, distance: tileDistance(tile, charTile) }
      })
      finalDistances = [...finalDistances, ...distances]
    })
  return bestCell(finalDistances)
}

function bestFastMatch (tile: Tile, chars: CharSet, backgroundColor: number): ScreenCell {
  const bestColor: number = bestColorMatchForTile(tile, backgroundColor)
  const distances: WeightedScreenCell[] = supportedChars.map(charIndex => {
    const charTile = char2Tile(chars[charIndex], bestColor, backgroundColor)
    const cell: ScreenCell = { code: charIndex, color: bestColor }
    return { cell, distance: tileDistance(tile, charTile) }
  })
  return bestCell(distances)
}

function quantizeTile (tile: Tile): number[] {
  return tile.flatMap(row => row.map(p => quantize2index(p)))
}

// get the most occurring color for the tile, excluding background color
function bestColorMatchForTile (tile: Tile, backgroundColor: number): number {
  return mostOccuringColorIndex(quantizeTile(tile).filter(c => c !== backgroundColor))
}

// cut SharpImage in 8x8 PixelColor tiles, this is a three dimensional array:
// 8 rows of 8 pixels of [r, g, b]
function cutIntoTiles (img: SharpImage): Tile[] {
  return cellOffsets(img).map(offset =>
    Array(8)
      .fill(0)
      .map((_v, y) => offset + imageCoordinatesToByteOffset(img, 0, y))
      .map(rowOffset => parse8pixelRow(img, rowOffset))
  )
}

// convert an image file to a 40x25 array of screencodes
async function convertFile (filename: string, charSet: CharSet, backgroundColor: number, config: Config): Promise<Screen> {
  const image: SharpImage = await loadFile(filename, config)
  console.log(filename)
  // const backgroundColor: number = bestBackgroundColor(image)
  const cells: ScreenCell[] = cutIntoTiles(image).map(t => {
    if (config.matcher === MatchType.slow) {
      return bestMatch(t, charSet, backgroundColor)
    } else {
      return bestFastMatch(t, charSet, backgroundColor)
    }
  })
  return { backgroundColor, cells }
}

// get the overall background color from one file, by just getting the first
// (quantized) pixel
async function getBackgroundColor (filename: string, config: Config): Promise<number> {
  console.log(`Getting background color from first pixel of ${filename}`)
  const image: SharpImage = await loadFile(filename, config)
  return quantize(image)[0]
}
/*
(async function () {
  const inputName: string = process.argv[2]
  const outputName = `${inputName}.petmate`
  const filenames: string[] = await toFilenames(inputName, supportedExtensions)
  const charSet: CharSet = await readChars(relativePath('./characters.901225-01.bin'))
  // array of screens, one screen is a { screenCodes, colors, backgroundColor }
  // TODO: read config from file
  const config = defaultConfig
  const backgroundColor = await getBackgroundColor(filenames[0], config)

  const screens: Screen[] = await Promise.all(filenames.map(async f => await convertFile(f, charSet, backgroundColor, config)))
  const petmate: Petmate = toPetmate(screens)
  //await writeFile(outputName, JSON.stringify(petmate))
  console.log(outputName)
  // await writeFile('default.config.json', JSON.stringify(config))
})()
*/