
declare type FileType = 'del' | 'seq' | 'prg' | 'usr' | 'rel';
 export interface DirectoryEntry {
    type: FileType;
    petsciiName: Uint8Array;
    screencodeName: Uint8Array;
    d64FileOffset: number;
    d64FileNameOffset: number;
}

export var trackInfo = [
    { track: 0, numSectors: 0, sectorsIn: 0, d64Offset: 0x00000 },
    { track: 1, numSectors: 21, sectorsIn: 0, d64Offset: 0x00000 },
    { track: 2, numSectors: 21, sectorsIn: 21, d64Offset: 0x01500 },
    { track: 3, numSectors: 21, sectorsIn: 42, d64Offset: 0x02A00 },
    { track: 4, numSectors: 21, sectorsIn: 63, d64Offset: 0x03F00 },
    { track: 5, numSectors: 21, sectorsIn: 84, d64Offset: 0x05400 },
    { track: 6, numSectors: 21, sectorsIn: 105, d64Offset: 0x06900 },
    { track: 7, numSectors: 21, sectorsIn: 126, d64Offset: 0x07E00 },
    { track: 8, numSectors: 21, sectorsIn: 147, d64Offset: 0x09300 },
    { track: 9, numSectors: 21, sectorsIn: 168, d64Offset: 0x0A800 },
    { track: 10, numSectors: 21, sectorsIn: 189, d64Offset: 0x0BD00 },
    { track: 11, numSectors: 21, sectorsIn: 210, d64Offset: 0x0D200 },
    { track: 12, numSectors: 21, sectorsIn: 231, d64Offset: 0x0E700 },
    { track: 13, numSectors: 21, sectorsIn: 252, d64Offset: 0x0FC00 },
    { track: 14, numSectors: 21, sectorsIn: 273, d64Offset: 0x11100 },
    { track: 15, numSectors: 21, sectorsIn: 294, d64Offset: 0x12600 },
    { track: 16, numSectors: 21, sectorsIn: 315, d64Offset: 0x13B00 },
    { track: 17, numSectors: 21, sectorsIn: 336, d64Offset: 0x15000 },
    { track: 18, numSectors: 19, sectorsIn: 357, d64Offset: 0x16500 },
    { track: 19, numSectors: 19, sectorsIn: 376, d64Offset: 0x17800 },
    { track: 20, numSectors: 19, sectorsIn: 395, d64Offset: 0x18B00 },
    { track: 21, numSectors: 19, sectorsIn: 414, d64Offset: 0x19E00 },
    { track: 22, numSectors: 19, sectorsIn: 433, d64Offset: 0x1B100 },
    { track: 23, numSectors: 19, sectorsIn: 452, d64Offset: 0x1C400 },
    { track: 24, numSectors: 19, sectorsIn: 471, d64Offset: 0x1D700 },
    { track: 25, numSectors: 18, sectorsIn: 490, d64Offset: 0x1EA00 },
    { track: 26, numSectors: 18, sectorsIn: 508, d64Offset: 0x1FC00 },
    { track: 27, numSectors: 18, sectorsIn: 526, d64Offset: 0x20E00 },
    { track: 28, numSectors: 18, sectorsIn: 544, d64Offset: 0x22000 },
    { track: 29, numSectors: 18, sectorsIn: 562, d64Offset: 0x23200 },
    { track: 30, numSectors: 18, sectorsIn: 580, d64Offset: 0x24400 },
    { track: 31, numSectors: 17, sectorsIn: 598, d64Offset: 0x25600 },
    { track: 32, numSectors: 17, sectorsIn: 615, d64Offset: 0x26700 },
    { track: 33, numSectors: 17, sectorsIn: 632, d64Offset: 0x27800 },
    { track: 34, numSectors: 17, sectorsIn: 649, d64Offset: 0x28900 },
    { track: 35, numSectors: 17, sectorsIn: 666, d64Offset: 0x29A00 },
    { track: 36, numSectors: 17, sectorsIn: 683, d64Offset: 0x2AB00 },
    { track: 37, numSectors: 17, sectorsIn: 700, d64Offset: 0x2BC00 },
    { track: 38, numSectors: 17, sectorsIn: 717, d64Offset: 0x2CD00 },
    { track: 39, numSectors: 17, sectorsIn: 734, d64Offset: 0x2DE00 },
    { track: 40, numSectors: 17, sectorsIn: 751, d64Offset: 0x2EF00 }
];

export function reshape2d(flat:any, width:any, height:any): any [][] {
	var arr2d = [];
	for (var y = 0; y < height; y++) {
			var row = [];
			for (var x = 0; x < width; x++) {
					row.push(flat[x + width * y]);
			}
			arr2d.push(row);
	}
	return arr2d;
}


export function getOffset(track:number, sector:number) {
    return trackInfo[track].d64Offset + sector * 256;
}
export function petsciiToScreen(p:number) {
    if (p >= 0 && p < 32) {
        return p + 128;
    }
    else if (p >= 32 && p < 64) {
        return p;
    }
    else if (p >= 64 && p < 96) {
        return p - 64;
    }
    else if (p >= 96 && p < 128) {
        return p - 32;
    }
    else if (p >= 128 && p < 160) {
        return p + 64;
    }
    else if (p >= 160 && p < 192) {
        return p - 64;
    }
    else if (p >= 192 && p < 224) {
        return p - 128;
    }
    else if (p >= 224 && p < 255) {
        return p - 128;
    }
    else if (p == 255) {
        return 94;
    }
    else {
        throw new Error('impossible - bug above');
    }
}

export function petsciiToScreenArray(petscii:Uint8Array) {
    var dst = new Uint8Array(petscii.length);
    for (var i = 0; i < petscii.length; i++) {
        dst[i] = petsciiToScreen(petscii[i]);
    }
    return dst;
}
export function readDirectory(d64Binary:Buffer) {
    var dirEntries = [];
    var deTrack = 18;
    var deSector = 1;
    while (deTrack != 0) {
        var deOffset = getOffset(deTrack, deSector);
        var offs = deOffset;
        for (var i = 0; i < 8; i++, offs += 32) {
            var fileType:FileType  = 'del';
            var ty = d64Binary[offs + 2];
            if (ty == 0) {
                continue;
            }
            switch (ty & 7) {
                case 0:
                    fileType = 'del';
                    break;
                case 1:
                    fileType = 'seq';
                    break;
                case 2:
                    fileType = 'prg';
                    break;
                case 3:
                    fileType = 'usr';
                    break;
                case 4:
                    fileType = 'rel';
                    break;
                default:
                    throw new Error('Unknown directory entry file type');
            }
            var petsciiName:any = d64Binary.slice(offs + 0x05, offs + 0x15);
            dirEntries.push({
                type: fileType,
                petsciiName: petsciiName,
                screencodeName: petsciiToScreenArray(petsciiName),
                d64FileOffset: offs,
                d64FileNameOffset: offs + 0x05,
            });
        }
        deTrack = d64Binary[deOffset + 0];
        deSector = d64Binary[deOffset + 1];
        if (deTrack == 0) {
            break;
        }
    }
    return dirEntries;
}

export function deleteDirectoryEntry(d64Binary:Buffer, d64FileOffset:number) {
    var blankFile = new Uint8Array(0x20);
    blankFile.fill(0x00);
    d64Binary.set(blankFile, d64FileOffset);
}

export function writeDirectoryHeader(d64Binary:Buffer, header:any, id:any) {
    //"  header title  ","XX ,["Disk ID", "X", "DOS VER"]
    //"0123456789ABCDEF","XX","ID","X","DS"
    var blankHeader = new Uint8Array(16);
    var blankHeaderID = new Uint8Array(5);
    var headerNameFileOffset = 0x16590; // $AA
    var headerIDFileOffset = 0x165a2; // $AA
    blankHeader.fill(0xA0);
    blankHeader.set(header.slice(0, header.length), 0);
    blankHeaderID.fill(0xA0);
    blankHeaderID.set(id.slice(0, id.length), 5 - id.length);
    d64Binary.set(blankHeader, headerNameFileOffset);
    d64Binary.set(blankHeaderID, headerIDFileOffset);
}

