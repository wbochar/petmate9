
interface FileFormatBase {
  name: string;
  description: string;
  ext: string;
  commonExportParams: {
    selectedFramebufIndex: number;
  };
  exportOptions?: {};
}

export interface FileFormatAsm extends FileFormatBase {
  name: 'asmFile';
  description: 'ASM Assembly source files (.asm)';
  ext: 'asm';
  exportOptions: {
    currentScreenOnly: boolean;
    standalone: boolean;
    hex: boolean;
    assembler: 'acme' | 'c64tass' | 'ca65' | 'c64jasm' | 'kickass';
  };
}
export interface FileFormatPlayerV1 extends FileFormatBase {
  name: 'prgPlayer';
  description: 'Petmate Player v1 (.prg)';
  ext: 'prg';
  exportOptions: {
    currentScreenOnly: boolean;
    music: boolean;
    songFile: string;
    songNumber: number;
    playerDebug: boolean;
    playerType: 'Single Frame'| 'Animation' | 'Long Scroll' | 'Wide Pan' | 'Omni' | 'Terminal' ;
    playerAnimationDirection: 'Forward' | 'Reverse' | 'Ping-Pong' ;
    playerAnimationLoop: boolean;
    playerSpeed: number;
    playerScrollType: 'Linear'| 'Sine' |'Custom';
    computer: 'c64' | 'pet4032' | 'c128' | 'c16' | 'vic20';


  };
}


export interface FileFormatGif extends FileFormatBase {
  name: 'gifFile';
  description: 'GIF Image (.gif)';
  ext: 'gif';
  exportOptions: {
    delayMS: string;
    animMode: 'single' | 'anim';
    loopMode: 'once' | 'loop' | 'pingpong';
    borders: boolean;
  };
}

export interface FileFormatPng extends FileFormatBase {
  name: 'pngFile';
  description: 'PNG Image (.png)';
  ext: 'png';
  exportOptions: {
    alphaPixel: boolean;
    borders: boolean;
    scale: number;
  };
}

export interface FileFormatC extends FileFormatBase {
  name:'cFile';
  description:'C Language File (.c)';
  ext: 'c';
}

export interface FileFormatSeq extends FileFormatBase {
  name:'seqFile';
  description:'SEQ PETSCII File (.seq)';
  ext: 'seq';
  exportOptions: {
    insCR: boolean;
    insClear: boolean;
    stripBlanks: boolean;
    insCharset: boolean;
  }
}

export interface FileFormatCbase extends FileFormatBase {
  name:'cbaseFile';
  description:'CBASE PRG File (.prg)';
  ext: 'prg';

}

export interface FileFormatD64 extends FileFormatBase {
  name:'d64File';
  description:'D64 Floppy Disk (.d64)';
  ext: 'd64';
  exportOptions: {
    header: string;
    id: string;
  };
}

export interface FileFormatPrg extends FileFormatBase {
  name:'prgFile';
  description:'Commodore PRG Binary (.prg)';
  ext: 'prg';
}
export interface FileFormatUltPrg extends FileFormatBase {
  name:'ultFile';
  description:'Commodore Ultimate PRG Binary (.prg)';
  ext: 'prg';
}

export interface FileFormatBas extends FileFormatBase {
  name:'basFile';
  description:'Commodore Basic Text (.bas)';
  ext: 'bas';
  exportOptions: {
    currentScreenOnly: boolean;
    standalone: boolean;
  };
}

export interface FileFormatJson extends FileFormatBase {
  name:'jsonFile';
  description:'Petmate JSON File (.json)';
  ext: 'json';
  exportOptions: {
    currentScreenOnly: boolean;
  };
}

export interface FileFormatPet extends FileFormatBase {
  name:'petFile';
  description:'PET PETSCII Image File (.pet)';
  ext: 'pet';
}

export type FileFormat =
    FileFormatAsm
  | FileFormatD64
  | FileFormatGif
  | FileFormatPng
  | FileFormatC
  | FileFormatPrg
  | FileFormatBas
  | FileFormatJson
  | FileFormatSeq
  | FileFormatPet
  | FileFormatCbase
  | FileFormatPlayerV1
  | FileFormatUltPrg
