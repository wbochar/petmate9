
import { fs,electron,path } from '../electronImports'
import { FramebufWithFont, FileFormatJson, Pixel, FileFormatD64 } from  '../../redux/types';
import { CustomFonts } from  '../../redux/customFonts';
import * as c1541 from 'c1541';


function flatten2d(arr: Pixel[][], field: 'code' | 'color'): number[] {
  const res: any[] = [];
  for (let y = 0; y < arr.length; y++) {
    const row = arr[y];
    for (let x = 0; x < row.length; x++) {
      res.push(row[x][field]);
    }
  }
  return res;
}
function reshape2d(flat:any, width:any, height:any) {
  var arr2d:any[] = [];
  for (var y:number = 0; y < height; y++) {
      var row:any[] = [];
      for (var x:number = 0; x < width; x++) {
          row.push(flat[x + width * y]);
      }
      arr2d.push(row);
  }
  return arr2d;
}
function convertFb(fb: FramebufWithFont) {
  return {
    width: fb.width,
    height: fb.height,
    backgroundColor: fb.backgroundColor,
    borderColor: fb.borderColor,
    borderOn: fb.borderOn,
    charset: fb.charset ? fb.charset : 'dirart',
    name: fb.name ? fb.name : undefined,
    screencodes: flatten2d(fb.framebuf, 'code'),
    colors: flatten2d(fb.framebuf, 'color')
  }
}
export const loadAppFile = (filename: string) => {
  const appPath = electron.remote.app.getAppPath()
  return fs.readFileSync(path.resolve(appPath, filename));
}
export function saveD64(filename: string, selectedFramebuf: FramebufWithFont, customFonts: CustomFonts, fmt: FileFormatD64): void {
  try {

    //TODO:
    // Check that input framebuffer is the right w x h
    // frame buffer has dirart as its type
    // check for bad petscii
    // get the correctly select framebuffer
    // foreach buffer
    // disk header (name of frame?)

    // $16590-9f "1234567890abcdef" -- header title
    // $160a2-a6 "12345" -- full header id/os
    // $160a2-a3 "ID" , a4="a0", a5-a6="2A"
    // $16600+ Directory Files
    // 166600-1661f : file file "12 04 80 12 00" default start for first File


    console.log("Trying to Export d64",selectedFramebuf);

//    var d64bin : Buffer = fs.readFileSync('assets/blankfull.d64');


    var d64bin : Buffer = loadAppFile('assets/blankfull.d64')
    var dirEntries : c1541.DirectoryEntry[] = c1541.readDirectory(d64bin);


    var screenToPetscii = new Uint8Array(256);
    for (var i:number = 0; i < 256; i++) {
        screenToPetscii[c1541.petsciiToScreen(i)] = i;
    }

    var fb:any = convertFb(selectedFramebuf);
    var w:number = fb.width;
    var h:number = fb.height;
    let screencodes:any = reshape2d(fb.screencodes, w, h);

    var name = selectedFramebuf.name || "PETMATE 9 D64"

    let newDirnames : any = screencodes;
    let numLines:number = newDirnames.length;
    let destOffset:number = 0;


    if(selectedFramebuf.charset!='dirart')
    {
      alert("Not a dirart type, please adjust charset to dirart");
      return;
    }

    console.log("newDirnames",newDirnames,newDirnames.length);

    for (var i:number = 0; i < numLines; i++, destOffset++) {

      if (i >= newDirnames.length || destOffset >= dirEntries.length) {


        //break;
    }else{
      let d:any = newDirnames[i].map(function (p:any) : number { return screenToPetscii[p]; });
      console.log("d",[...d]);
      let pet: Uint8Array = new Uint8Array(16);
      pet.fill(0x20);
      pet.set(d.slice(0, 16), 0);
      d64bin.set(pet, dirEntries[destOffset].d64FileNameOffset);
      // TODO add option to fill the rest of the entries with just empty?
    }

    }
    for (var i:number = numLines+1; i < dirEntries.length+1; i++, destOffset++) {
    c1541.deleteDirectoryEntry(d64bin,dirEntries[destOffset].d64FileOffset)
    }

    // take fb.name and convert into d64's header and ID

    let header = Buffer.alloc(16);
    header.fill(0xA0)
    let headerId;

    let fbHeader = fmt.exportOptions.header
    let fbHeaderId = fmt.exportOptions.id

    if (fbHeaderId=="")
      fbHeaderId = "2A"

    header.write(fbHeader,'ascii');

    headerId = Buffer.alloc(fbHeaderId.length);
    headerId.write(fbHeaderId,'ascii');


/*

    if(name.includes(','))
    {
      // we have a title / id
      let fbHeader = name.split(',')[0].substring(0,16)
      let fbHeaderId = name.split(',')[1].substring(0,5)
      header.write(fbHeader,'ascii');

      headerId = Buffer.alloc(fbHeaderId.length);
      headerId.write(fbHeaderId,'ascii');


    }
    else
    {
      // we will just take the title (16 chars of it)

      let fbHeader = name.substring(0,16)
      header.write(fbHeader,'ascii');

      // Default HeaderId
      let headerIdStringDefault = "2A"
      headerId = Buffer.alloc(headerIdStringDefault.length);
      let headerIdString = headerIdStringDefault;
      headerId.write(headerIdString,'ascii');

    }
*/
    c1541.writeDirectoryHeader(d64bin, header, headerId);

    var outFile = filename;
    fs.writeFileSync(outFile, d64bin);
    console.log('Modified .d64 file written in.,.', outFile);








  } catch(e) {
    alert(`Failed to save file '${filename}'!`)
    console.error(e)
  }
}
