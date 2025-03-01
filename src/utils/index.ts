import { loadMarqCFramebuf, loadD64Framebuf, loadSeq, loadCbase } from './importers'
import {
  savePNG,
  saveMarqC,
  saveExecutablePRG,
  saveExecutablePlayer,
  saveAsm,
  saveBASIC,
  saveGIF,
  saveJSON,
  saveSEQ,
  savePET,
  saveD64,
  saveCbase,
  savePlayer,
  saveUltimatePRG,
} from './exporters'

import {
  drawLine
} from './line'

import { colorPalettes, vic20ColorPalettes, petColorPalettes } from './palette'

import { electron, fs, path, buffer, app } from './electronImports'
import {
  FileFormat, Rgb, Font, Coord2, Framebuf, Settings,
  FramebufWithFont,
  RootState,
  WsCustomFontsV2,
  FileFormatCbase,
  FileFormatPlayerV1
} from '../redux/types';

import * as ReduxRoot from '../redux/root';
import * as selectors from '../redux/selectors';
import * as customFonts from '../redux/customFonts'

const { ipcRenderer } = electron

// TODO import VICE VPL files

const defaultExportCommon = {
  selectedFramebufIndex: 0
}

// TODO ts use FileFormat type
export const formats: { [index: string]: FileFormat } = {
  pngFile: {
    name: 'pngFile',
    ext: 'png',
    description: 'PNG Image (.png)',
    commonExportParams: defaultExportCommon,
    exportOptions: {
      borders: false,
      alphaPixel: false,
      scale: 1
    }
  },
  seqFile: {
    name: 'seqFile',
    ext: 'seq',
    description: 'SEQ PETSCII File (.seq)',
    commonExportParams: defaultExportCommon,
    exportOptions: {
      insCR: false,
      insClear: true,
      stripBlanks: false,
      insCharset: false,
    }
  },
  cbaseFile: {
    name: 'cbaseFile',
    ext: 'prg',
    description: 'CBASE PRG File (.prg)',
    commonExportParams: defaultExportCommon,

  },
  cFile: {
    name: 'cFile',
    ext: 'c',
    description: 'C Language File (.c)',
    commonExportParams: defaultExportCommon,
  },
  d64File: {
    name: 'd64File',
    ext: 'd64',
    description: 'D64 Floppy Disk (.d64)',
    commonExportParams: defaultExportCommon,
    exportOptions: {
      header: "DISKNAME",
      id: "2A"
    }
  },
  ultFile: {
    name: 'ultFile',
    ext: 'prg',
    description: 'Commodore Ultimate PRG Binary (.prg)',
    commonExportParams: defaultExportCommon,
  },
  prgFile: {
    name: 'prgFile',
    ext: 'prg',
    description: 'Commodore PRG Binary (.prg)',
    commonExportParams: defaultExportCommon,
  },
  asmFile: {
    name: 'asmFile',
    description: 'ASM Assembly source files (.asm)',
    ext: 'asm',
    commonExportParams: defaultExportCommon,
    exportOptions: {
      currentScreenOnly: true,
      standalone: false,
      hex: false,
      assembler: 'kickass'
    }
  },
  basFile: {
    name: 'basFile',
    description: 'Commodore Basic Text (.bas)',
    ext: 'bas',
    commonExportParams: defaultExportCommon,
    exportOptions: {
      currentScreenOnly: true,
      standalone: true
    }
  },
  gifFile: {
    name: 'gifFile',
    description: 'GIF Image (.gif)',
    ext: 'gif',
    commonExportParams: defaultExportCommon,
    exportOptions: {
      borders: false,
      animMode: 'single',
      loopMode: 'loop',
      delayMS: '250'
    }
  },
  jsonFile: {
    name: 'jsonFile',
    description: 'Petmate JSON File (.json)',
    ext: 'json',
    commonExportParams: defaultExportCommon,
    exportOptions: {
      currentScreenOnly: true
    }
  },
  petFile: {
    name: 'petFile',
    description: 'PET PETSCII Image File (.pet)',
    ext: 'pet',
    commonExportParams: defaultExportCommon,
  },

  prgPlayer: {
    name: 'prgPlayer',
    description: 'Petmate Player v1 (.prg)',
    ext: 'prg',
    commonExportParams: defaultExportCommon,
    exportOptions: {
      currentScreenOnly: true,
      music: true,
      songFile: '',
      songNumber: 1,
      playerDebug: true,
      playerType: 'Single Frame',
      playerAnimationDirection: 'Forward',
      playerAnimationLoop: true,
      playerSpeed: 1,
      playerScrollType: 'Linear',
      computer: 'c64',
    }

  },


}

export function rgbToCssRgb(o: Rgb) {
  return `rgb(${o.r}, ${o.g}, ${o.b}`
}

export function colorIndexToCssRgb(palette: Rgb[], idx: number) {
  return rgbToCssRgb(palette[idx])
}

export function luminance(color: Rgb): number {
  const r = color.r / 255
  const g = color.g / 255
  const b = color.b / 255
  return (r + r + b + g + g + g) / 6
}

export const charOrderUpper = [32, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 46, 44, 59, 33, 63, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 34, 35, 36, 37, 38, 39, 112, 110, 108, 123, 85, 73, 79, 80, 113, 114, 40, 41, 60, 62, 78, 77, 109, 125, 124, 126, 74, 75, 76, 122, 107, 115, 27, 29, 31, 30, 95, 105, 100, 111, 121, 98, 120, 119, 99, 116, 101, 117, 97, 118, 103, 106, 91, 43, 82, 70, 64, 45, 67, 68, 69, 84, 71, 66, 93, 72, 89, 47, 86, 42, 61, 58, 28, 0, 127, 104, 92, 102, 81, 87, 65, 83, 88, 90, 94, 96, 160, 129, 130, 131, 132, 133, 134, 135, 136, 137, 138, 139, 140, 141, 142, 143, 144, 145, 146, 147, 148, 149, 150, 151, 152, 153, 154, 174, 172, 187, 161, 191, 176, 177, 178, 179, 180, 181, 182, 183, 184, 185, 162, 163, 164, 165, 166, 167, 240, 238, 236, 251, 213, 201, 207, 208, 241, 242, 168, 169, 188, 190, 206, 205, 237, 253, 252, 254, 202, 203, 204, 250, 235, 243, 155, 157, 159, 158, 223, 233, 228, 239, 249, 226, 248, 247, 227, 244, 229, 245, 225, 246, 231, 234, 219, 171, 210, 198, 192, 173, 195, 196, 197, 212, 199, 194, 221, 200, 217, 175, 214, 170, 189, 186, 156, 128, 255, 232, 220, 230, 209, 215, 193, 211, 216, 218, 222, 224, 256, 257, 258, 259, 260, 261, 262, 263, 264, 265, 266, 267, 268, 269, 270, 271]
export const charOrderLower = [32, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 46, 44, 59, 33, 63, 96, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79, 80, 81, 82, 83, 84, 85, 86, 87, 88, 89, 90, 34, 35, 36, 37, 38, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 43, 45, 42, 61, 39, 0, 112, 110, 108, 123, 113, 114, 40, 41, 95, 105, 92, 127, 60, 62, 28, 47, 109, 125, 124, 126, 107, 115, 27, 29, 94, 102, 104, 58, 30, 31, 91, 122, 100, 111, 121, 98, 99, 119, 120, 101, 116, 117, 97, 103, 106, 118, 64, 93, 160, 129, 130, 131, 132, 133, 134, 135, 136, 137, 138, 139, 140, 141, 142, 143, 144, 145, 146, 147, 148, 149, 150, 151, 152, 153, 154, 174, 172, 187, 161, 191, 224, 193, 194, 195, 196, 197, 198, 199, 200, 201, 202, 203, 204, 205, 206, 207, 208, 209, 210, 211, 212, 213, 214, 215, 216, 217, 218, 162, 163, 164, 165, 166, 176, 177, 178, 179, 180, 181, 182, 183, 184, 185, 171, 173, 170, 189, 167, 128, 240, 238, 236, 251, 241, 242, 168, 169, 223, 233, 220, 255, 188, 190, 156, 175, 237, 253, 252, 254, 235, 243, 155, 157, 222, 230, 232, 186, 158, 159, 219, 250, 228, 239, 249, 226, 227, 247, 248, 229, 244, 245, 225, 231, 234, 246, 192, 221, 256, 257, 258, 259, 260, 261, 262, 263, 264, 265, 266, 267, 268, 269, 270, 271]
export const dirartOrder = [32, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 46, 44, 59, 33, 63, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 34, 35, 36, 37, 38, 39, 112, 110, 108, 123, 85, 73, 79, 80, 113, 114, 40, 41, 60, 62, 78, 77, 109, 125, 124, 126, 74, 75, 76, 122, 107, 115, 27, 29, 31, 30, 95, 105, 100, 111, 121, 98, 120, 119, 99, 116, 101, 117, 97, 118, 103, 106, 91, 43, 82, 70, 64, 45, 67, 68, 69, 84, 71, 66, 93, 72, 89, 47, 86, 42, 61, 58, 28, 0, 127, 104, 92, 102, 81, 87, 65, 83, 88, 90, 94, 96, 160, 129, 130, 131, 132, 133, 134, 135, 136, 137, 138, 139, 140, 141, 142, 143, 144, 145, 146, 147, 148, 149, 150, 151, 152, 153, 154, 174, 172, 187, 161, 191, 176, 177, 178, 179, 180, 181, 182, 183, 184, 185, 162, 163, 164, 165, 166, 167, 240, 238, 236, 251, 213, 201, 207, 208, 241, 242, 168, 169, 188, 190, 206, 205, 237, 253, 252, 254, 202, 203, 204, 250, 235, 243, 155, 157, 159, 158, 223, 233, 228, 239, 249, 226, 248, 247, 227, 244, 229, 245, 225, 246, 231, 234, 219, 171, 210, 198, 192, 173, 195, 196, 197, 212, 199, 194, 221, 200, 217, 175, 214, 170, 189, 186, 156, 128, 255, 232, 220, 230, 209, 215, 193, 211, 216, 218, 222, 224, 256, 257, 258, 259, 260, 261, 262, 263, 264, 265, 266, 267, 268, 269, 270, 271]


export const charScreencodeFromRowCol = (font: Font, { row, col }: Coord2) => {
  if (font === null) {
    return 0xa0
  }
  if (row < 0 || row >= 17 ||
    col < 0 || col >= 16) {
    return null
  }
  const idx = row * 16 + col
  return font.charOrder[idx]
}

export const rowColFromScreencode = (font: Font, code: number) => {
  const charOrder = font.charOrder
  for (let i = 0; i < charOrder.length; i++) {
    if (charOrder[i] === code) {
      return {
        row: Math.floor(i >> 4),
        col: Math.floor(i & 15)
      }
    }
  }
  throw new Error('rowColFromScreencode - the impossible happened');
}

//const FILE_VERSION = 1
const framebufFields = (framebuf: Framebuf) => {
  return {
    width: framebuf.width,
    height: framebuf.height,
    backgroundColor: framebuf.backgroundColor,
    borderColor: framebuf.borderColor,
    borderOn: framebuf.borderOn,
    charset: framebuf.charset,
    name: framebuf.name,
    framebuf: framebuf.framebuf,
    zoom: framebuf.zoom
  }
}

const saveFramebufs = (fmt: FileFormat, filename: string, framebufs: FramebufWithFont[], fonts: customFonts.CustomFonts, palette: Rgb[],ultimateAddress:string) => {

  const { selectedFramebufIndex } = fmt.commonExportParams;
  const selectedFramebuf = framebufs[selectedFramebufIndex];

  var updatedPalette = palette;

  if(selectedFramebuf.charset.startsWith("vic20"))
  {

  }
  else if(selectedFramebuf.charset.startsWith("pet"))
  {


  }


  if (fmt.ext === 'png') {

    return savePNG(filename, selectedFramebuf, palette, fmt);
  } else if (fmt.ext === 'seq') {
    return saveSEQ(filename, selectedFramebuf, fmt);
  } else if (fmt.ext === 'gif') {
    return saveGIF(filename, framebufs, palette, fmt);
  } else if (fmt.ext === 'c') {
    return saveMarqC(filename, framebufs, fmt);
  } else if (fmt.ext === 'asm') {
    return saveAsm(filename, framebufs, fmt);
  } else if (fmt.ext === 'prg' && fmt.name === 'ultFile') {
    return saveUltimatePRG(filename, selectedFramebuf, fmt, ultimateAddress);
  } else if (fmt.ext === 'prg' && fmt.name === 'prgFile') {
    return saveExecutablePRG(filename, selectedFramebuf, fmt);
  } else if (fmt.ext === 'bas') {
    return saveBASIC(filename, framebufs, fmt);
  } else if (fmt.ext === 'json') {
    return saveJSON(filename, framebufs, fonts, fmt);
  } else if (fmt.ext === 'pet') {
    return savePET(filename, framebufs, fmt);
  } else if (fmt.ext === 'd64') {
    return saveD64(filename, selectedFramebuf, fonts, fmt);
  } else if (fmt.ext === 'prg' && fmt.name === 'cbaseFile') {
    return saveCbase(filename, framebufs, fmt as FileFormatCbase);
  } else if (fmt.ext === 'prg' && fmt.name === 'prgPlayer') {
    return savePlayer(filename, framebufs, fmt);
  }
  throw new Error("shouldn't happen");
}

type GetFramebufByIdFunc = (fbidx: number) => Framebuf;

// Serialize CustomFonts to a known structure for JSON serialization.
// Could pass in just the original object, but this extra indirection will
// protect from accidentally changing the file format in case the internal
// custom fonts structure changes.
function customFontsToJson(cf: customFonts.CustomFonts): WsCustomFontsV2 {
  const res: { [id: string]: any } = {};
  Object.entries(cf).forEach(([id, { name, font }]) => {
    let f: { bits: number[], charOrder: number[] } = font;
    let n: string = name;
    res[id] = {
      name: n,
      font: f
    };
  });
  return res;
}

const WORKSPACE_VERSION = 2;

export function saveWorkspace(
  filename: string,
  screens: number[],
  getFramebufById: GetFramebufByIdFunc,
  customFonts: customFonts.CustomFonts,
  updateLastSavedSnapshot: () => void
) {
  const content = JSON.stringify({
    version: WORKSPACE_VERSION,
    // Renumber screen indices to 0,1,2,..,N and drop unused framebufs
    screens: screens.map((_t, idx) => idx),
    framebufs: screens.map(fbid => {
      return {
        ...framebufFields(getFramebufById(fbid))
      }
    }),
    customFonts: customFontsToJson(customFonts)
  })



  try {
    fs.writeFileSync(filename, content, 'utf-8');
   electron.remote.app.addRecentDocument(filename);

    updateLastSavedSnapshot();



  }
  catch (e) {
    alert(`Failed to save file '${filename}'!`)
  }
}

export const loadFramebuf = (filename: string, importFile: (fbs: Framebuf[]) => void) => {


  console.log("loadFramebuf")

  const ext = path.extname(filename).toLowerCase()



  if (ext === '.c') {
    return loadMarqCFramebuf(filename, importFile)
  } else if (ext === '.d64') {

    const fb = loadD64Framebuf(filename);
    if (fb !== undefined) {
      return importFile([fb]);
    }
  } else if (ext === '.seq') {
    const fb = loadSeq(filename);
    if (fb !== undefined) {
      return importFile([fb]);
    }
  } else if (ext === '.prg') {

    console.log("loading cbase:", filename)




    const fb = loadCbase(filename);
    if (fb !== undefined) {
      return importFile(fb);
    }
  } else {
    console.error('this should not happen');
  }
}

export const sortRegion = (region: { min: Coord2, max: Coord2 }) => {
  const { min, max } = region;
  const minx = Math.min(min.col, max.col)
  const miny = Math.min(min.row, max.row)
  const maxx = Math.max(min.col, max.col)
  const maxy = Math.max(min.row, max.row)
  return {
    min: { row: miny, col: minx },
    max: { row: maxy, col: maxx },
  }
}

/**
 * Returns an array with arrays of the given size.
 *
 * @param myArray {Array} array to split
 * @param chunk_size {Integer} Size of every group
 */
export function chunkArray<T>(myArray: T[], chunk_size: number) {
  var index = 0;
  var arrayLength = myArray.length;
  var tempArray = [];

  for (index = 0; index < arrayLength; index += chunk_size) {
    const myChunk = myArray.slice(index, index + chunk_size);
    // Do something if you want with the group
    tempArray.push(myChunk);
  }

  return tempArray;
}


export const loadAppFile = (filename: string) => {
  const appPath = electron.remote.app.getAppPath()
  return fs.readFileSync(path.resolve(appPath, filename));
}
export const loadFontFilePlus = (fontFileName: string, addonFileName: string) => {
  const appPath = electron.remote.app.getAppPath()
  return Array.from(new Uint8Array(Buffer.concat([Buffer.from(fs.readFileSync(path.resolve(appPath, fontFileName))), Buffer.from(fs.readFileSync(path.resolve(appPath, addonFileName)))])));
}

export const executablePrgTemplate = loadAppFile('assets/template.prg')
export const dirartData = loadFontFilePlus('assets/dirart.bin', 'assets/bar-dirart.bin')

export const c64DataUpper = loadFontFilePlus('assets/c64-charset-upper.bin', 'assets/bar-minimal.bin')
export const c64DataLower = loadFontFilePlus('assets/c64-charset-lower.bin', 'assets/bar-minimal.bin')
export const cbaseDataUpper = loadFontFilePlus('assets/cbase-charset-upper.bin', 'assets/bar-cbase.bin')
export const cbaseDataLower = loadFontFilePlus('assets/cbase-charset-lower.bin', 'assets/bar-cbase.bin')
export const petDataGFX = loadFontFilePlus('assets/pet-charset-upper.bin', 'assets/bar-minimal.bin')
export const petDataBiz = loadFontFilePlus('assets/pet-charset-lower.bin', 'assets/bar-minimal.bin')
export const c128DataUpper = loadFontFilePlus('assets/c128-charset-upper.bin', 'assets/bar-minimal.bin')
export const c128DataLower = loadFontFilePlus('assets/c128-charset-lower.bin', 'assets/bar-minimal.bin')
export const c16DataUpper = loadFontFilePlus('assets/c16-charset-upper.bin', 'assets/bar-minimal.bin')
export const c16DataLower = loadFontFilePlus('assets/c16-charset-lower.bin', 'assets/bar-minimal.bin')
export const vic20DataUpper = loadFontFilePlus('assets/vic20-charset-upper.bin', 'assets/bar-minimal.bin')
export const vic20DataLower = loadFontFilePlus('assets/vic20-charset-lower.bin', 'assets/bar-minimal.bin')


export function setWorkspaceFilenameWithTitle(setWorkspaceFilename: (fname: string) => void, filename: string) {
  setWorkspaceFilename(filename)
  electron.ipcRenderer.send('set-title', `Petmate 9 (0.9.6b) - ${filename}`)
}

type StoreDispatch = any;
export function loadWorkspaceNoDialog(
  dispatch: StoreDispatch,
  filename: string
) {
  dispatch(ReduxRoot.actions.openWorkspace(filename));
}

export function loadFileNoDialog(
  dispatch: StoreDispatch,
  filename: string,
  type: FileFormat,
) {
  dispatch(ReduxRoot.actions.openImportFile(type, filename));
}



export function dialogLoadWorkspace(
  dispatch: StoreDispatch
) {
  const { dialog } = electron.remote;
  const window = electron.remote.getCurrentWindow();
  const filters = [
    { name: 'Petmate workspace', extensions: ['petmate'] },
  ]
  const filename = dialog.showOpenDialogSync(window, { properties: ['openFile'], filters })
  if (filename === undefined) {
    return
  }
  if (filename.length === 1) {
    loadWorkspaceNoDialog(dispatch, filename[0]);
  } else {
    console.error('wtf?!')
  }
}

export function dialogSaveAsWorkspace(
  screens: number[],
  getFramebufByIndex: (fbidx: number) => Framebuf,
  customFonts: customFonts.CustomFonts,
  setWorkspaceFilename: (fname: string) => void,
  updateLastSavedSnapshot: () => void
) {
  const { dialog } = electron.remote;
  const window = electron.remote.getCurrentWindow();
  const filters = [
    { name: 'Petmate workspace file', extensions: ['petmate'] },
  ];
  const filename = dialog.showSaveDialogSync(window, { properties: ['openFile'], filters });
  if (filename === undefined) {
    return;
  }
  saveWorkspace(filename, screens, getFramebufByIndex, customFonts, updateLastSavedSnapshot);
  setWorkspaceFilenameWithTitle(setWorkspaceFilename, filename);
}

export function dialogExportFile(fmt: FileFormat, framebufs: FramebufWithFont[], customFonts: customFonts.CustomFonts, palette: Rgb[],ultimateAddress: string) {
  const { dialog } = electron.remote
  const window = electron.remote.getCurrentWindow();
  const filters = [
    { name: fmt.name, extensions: [fmt.ext] }
  ]

  console.log( electron.remote.app.getPath("temp"))

  var filename = "";

  if(fmt.name === 'ultFile')
  {
    filename =  electron.remote.app.getPath("temp")+"ult.prg"



  }else
  {
  filename = dialog.showSaveDialogSync(window, { properties: ['openFile'], filters })
  }
  if (filename === undefined) {
    return
  }
  console.log(fmt)
  saveFramebufs(fmt, filename, framebufs, customFonts, palette, ultimateAddress)
}

// Pop up a file select dialog for a certain file type and call the
// loadFile callback with the file contents.
export function dialogReadFile(type: FileFormat, loadFile: (data: Buffer) => void) {
  const { dialog } = electron.remote
  const window = electron.remote.getCurrentWindow();
  const filters = [
    { name: type.name, extensions: [type.ext] }
  ]
  const filename = dialog.showOpenDialogSync(window, { properties: ['openFile'], filters })
  if (filename === undefined) {
    return
  }
  if (filename.length === 1) {

    const buf = fs.readFileSync(filename[0]);
    loadFile(buf);
  } else {
    console.error('wtf?!')
  }
}

export function dialogPickSidFile(): string {
  const { dialog } = electron.remote
  const window = electron.remote.getCurrentWindow();
  const filters = [
    { name: 'Music Files', extensions: ['sid', 'bin', 'mus'] }
  ]
  const filename = dialog.showOpenDialogSync(window, { properties: ['openFile'], filters })
  if (filename === undefined) {
    return '';
  }
  if (filename.length === 1) {
    return filename;

  } else {
    console.error('wtf?!')
    return '';
  }
}


export function dragReadFile(filename: string, loadFile: (data: Buffer) => void) {
  const buf = fs.readFileSync(filename[0]);
  loadFile(buf);

}

// TODO could use dialogReadFile to implement this, just need to change the
// importFile API to accept file contents.
export function dialogImportFile(type: FileFormat, importFile: (fbs: Framebuf[]) => void) {



  const { dialog } = electron.remote
  const window = electron.remote.getCurrentWindow();
  console.log("dialogImportFile")
  const filters = [
    { name: type.name, extensions: [type.ext] }
  ]
  const filename = dialog.showOpenDialogSync(window, { properties: ['openFile'], filters })
  if (filename === undefined) {
    return
  }

  console.log('before load of:',filename)






  if (filename.length === 1) {
    console.log("dialogImportFile:loadFramebuf")
    loadFramebuf(filename[0], importFile)
  } else {
    console.error('wtf?!')
  }
}

export function xImportFile(filename: string, type: FileFormat, importFile: (fbs: Framebuf[]) => void) {

  loadFramebuf(filename, importFile)
}

export function loadSettings(dispatchSettingsLoad: (json: Settings) => void) {
  let settingsFile = path.join(electron.remote.app.getPath('userData'), 'Settings')
  if (fs.existsSync(settingsFile)) {
    const c = fs.readFileSync(settingsFile, 'utf-8')
    const j = JSON.parse(c)
    dispatchSettingsLoad(j)
  }
}

// Ask for confirmation to proceed if the workspace contains unsaved changes
//
// Returns: true if it's ok to continue, false otherwise.
export function promptProceedWithUnsavedChanges(state: RootState, msg: { title: string, detail: string }) {
  if (selectors.anyUnsavedChanges(state)) {
    const { dialog } = electron.remote;
    return dialog.showMessageBoxSync({
      type: 'question',
      buttons: [msg.title, 'Cancel'],
      cancelId: 1,
      message: 'Workspace contains unsaved changes.',
      detail: msg.detail
    }) === 0;
  }
  return true;
}

// Ask for confirmation to proceed if the workspace contains unsaved changes
//
// Returns: true if it's ok to continue, false otherwise.
export function promptProceedWithUnsavedChangesInFramebuf(state: RootState, fbIndex: number, msg: { title: string, detail: string }) {
  if (selectors.anyUnsavedChangesInFramebuf(state, fbIndex)) {
    const { dialog } = electron.remote;
    return dialog.showMessageBoxSync({
      type: 'question',
      buttons: [msg.title, 'Cancel'],
      cancelId: 1,
      message: 'Screen contains unsaved changes.',
      detail: msg.detail
    }) === 0;
  }
  return true;
}

export { drawLine, colorPalettes, vic20ColorPalettes, petColorPalettes }
