
import { fs } from '../electronImports';
import * as c1541 from '../x1541';
import { framebufFromJsonD64 } from '../../redux/workspace';
import { DEFAULT_BACKGROUND_COLOR, DEFAULT_BORDER_COLOR } from '../../redux/editor';
import { Pixel } from '../../redux/types';

import path from 'path';

export function loadD64Framebuf(filename: string) {
  try {



    const d64 = fs.readFileSync(filename)
    const dirEntries = c1541.readDirectory(d64);
    return framebufFromJsonD64({
      width: 16,
      height: dirEntries.length,
      backgroundColor: DEFAULT_BACKGROUND_COLOR,
      borderColor: DEFAULT_BORDER_COLOR,
      name: filename.startsWith('/') ? filename.split(".")[0].split('/')[filename.split(".")[0].split('/').length-1] : filename.split(".")[0].split('\\')[filename.split(".")[0].split('\\').length-1],
      framebuf: dirEntries.map((de) => {
        const pixels: Pixel[] = [];
        de.screencodeName.forEach(code => {
          pixels.push({ code, color: DEFAULT_BORDER_COLOR });
        });
        return pixels;
      })
    })
  } catch(e) {
    alert(`Failed to load file '${filename}'!`)
    console.error(e)
    return undefined;
  }
}
