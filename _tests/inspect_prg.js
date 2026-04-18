const fs = require('fs');
const path = process.argv[2] || 'C:/C64/Projects/_Petmate/petmate9/_tests/exports/scroll_player.prg';
const b = fs.readFileSync(path);
const load = b[0] | (b[1] << 8);
console.log(`file: ${path}`);
console.log(`load=$${load.toString(16).toUpperCase().padStart(4,'0')}, size=${b.length-2} bytes, ends $${(load+b.length-3).toString(16).toUpperCase()}`);

function countNonZero(start, end) {
  let n = 0;
  for (let a = start; a <= end; a++) {
    const o = a - load + 2;
    if (o >= 0 && o < b.length && b[o] !== 0) n++;
  }
  return n;
}
function dump(start, end) {
  const lines = [];
  for (let a = start; a <= end; a += 16) {
    let line = '$' + a.toString(16).toUpperCase().padStart(4,'0') + ': ';
    for (let i = 0; i < 16 && a+i <= end; i++) {
      const o = a + i - load + 2;
      if (o >= 0 && o < b.length) line += b[o].toString(16).padStart(2,'0') + ' ';
      else line += '-- ';
    }
    lines.push(line);
  }
  console.log(lines.join('\n'));
}

console.log(`buf A area $0400..$07E7 non-zero: ${countNonZero(0x0400, 0x07E7)}`);
console.log(`buf B area $0C00..$0FE7 non-zero: ${countNonZero(0x0C00, 0x0FE7)}`);
console.log(`gap   $0BE0..$0C40 dump:`);
dump(0x0BE0, 0x0C40);
