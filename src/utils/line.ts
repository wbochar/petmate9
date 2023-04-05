
type SetPixelFunc = (x:number, y:number) => void;

export function drawLine(setPixel: SetPixelFunc, x0: number, y0: number, x1: number, y1: number) {
   var dx = Math.abs(x1-x0)
   var dy = Math.abs(y1-y0)
   var sx = (x0 < x1) ? 1 : -1
   var sy = (y0 < y1) ? 1 : -1
   var err = dx-dy

   while(true){
     setPixel(x0, y0)

     if ((x0 === x1) && (y0 === y1)) break
     var e2 = 2*err
     if (e2 >-dy) { err -= dy; x0  += sx; }
     if (e2 < dx) { err += dx; y0  += sy; }
   }
}
