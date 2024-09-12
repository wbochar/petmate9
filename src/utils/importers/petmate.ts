const cols = 40
const rows = 25

export interface ScreenCell {
  code: number
  color: number
}

// TODO: this is not petmate specific?
export interface Screen {
  backgroundColor: number
  cells: ScreenCell[]
}

export interface FrameBuf {
  width: number
  height: number
  backgroundColor: number
  borderColor: number
  charset: string
  name: string
  framebuf: ScreenCell[][]
  customFonts: object
}

export interface Petmate {
  version: number
  screens: number[]
  framebufs: FrameBuf[]
}

export function fromJSON (json: string): Petmate {
  const content: Petmate = JSON.parse(json)

  if (content.version !== 2) {
    throw new Error(`Unsupported Petmate version: ${content.version}`)
  }
  return content
}

function toFramebuf (screen: Screen, name: string): FrameBuf {
  const { backgroundColor, cells } = screen

  const framebuf: ScreenCell[][] = []
  for (let y = 0; y < rows; y++) {
    const row: ScreenCell[] = []
    for (let x = 0; x < cols; x++) {
      row.push(cells[y * cols + x])
    }
    framebuf.push(row)
  }
  return {
    width: cols,
    height: rows,
    backgroundColor,
    borderColor: 0,
    charset: 'upper',
    name,
    framebuf,
    customFonts: {}
  }
}

export function toPetmate (screens: Screen[]): Petmate {
  const framebufs: FrameBuf[] = screens.map((screen, i) => toFramebuf(screen, `screen_${i}`))
  const screenNumbers: number[] = Array.from(Array(screens.length).keys())
  return {
    version: 2,
    screens: screenNumbers,
    framebufs
  }
}

export function reverse (petmate: Petmate): void {
  petmate.framebufs = petmate.framebufs.reverse()
}

