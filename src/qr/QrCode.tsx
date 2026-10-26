import createQr from 'qrcode-generator';
import { View } from 'react-native';

const QUIET_ZONE = 4;

// The library's default encoder keeps only the low byte of each character, which garbles Bangla and emoji.
// eslint-disable-next-line import/no-named-as-default-member -- the library reads this property at encode time
createQr.stringToBytes = (s: string) => Array.from(new TextEncoder().encode(s));

type Cell = { x: number; y: number; s: number; r: number; dark: boolean };
export type QrMatrix = { size: number; cells: Cell[] };

// The three 7x7 corner squares scanners lock on to.
function inFinder(row: number, column: number, size: number) {
  return (row < 7 && column < 7) || (row < 7 && column >= size - 7) || (row >= size - 7 && column < 7);
}

// A rounded rectangle as path data; only the web PNG export needs it, since the on-screen code is
// painted with plain views instead.
function roundedRect(x: number, y: number, size: number, radius: number) {
  const r = Math.min(radius, size / 2);
  return `M${x + r} ${y}h${size - 2 * r}a${r} ${r} 0 0 1 ${r} ${r}v${size - 2 * r}a${r} ${r} 0 0 1 -${r} ${r}h-${size - 2 * r}a${r} ${r} 0 0 1 -${r} -${r}v-${size - 2 * r}a${r} ${r} 0 0 1 ${r} -${r}z`;
}

// Returns null when the content is too long to fit in any QR code version.
export function encodeQr(payload: string): QrMatrix | null {
  const qr = createQr(0, 'M');
  try {
    qr.addData(payload, 'Byte');
    qr.make();
  } catch {
    return null;
  }

  const size = qr.getModuleCount();
  const cells: Cell[] = [];
  // Rounded modules keep the friendly look; full squares scan more reliably than dots.
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++)
      if (qr.isDark(y, x) && !inFinder(y, x, size)) cells.push({ x: x + 0.05, y: y + 0.05, s: 0.9, r: 0.3, dark: true });

  const corners = [
    [0, 0],
    [size - 7, 0],
    [0, size - 7],
  ] as const;
  for (const [x, y] of corners) {
    // The ring is painted as three stacked squares, so no even-odd cut-out is needed.
    cells.push({ x, y, s: 7, r: 2.2, dark: true });
    cells.push({ x: x + 1, y: y + 1, s: 5, r: 1.4, dark: false });
    cells.push({ x: x + 2, y: y + 2, s: 3, r: 1, dark: true });
  }
  return { size, cells };
}

// Web only: paints the matrix straight onto a canvas at a whole-pixel scale so the PNG stays sharp.
export function qrToPngDataUrl(matrix: QrMatrix, minSize = 1024): string {
  const total = matrix.size + QUIET_ZONE * 2;
  const scale = Math.ceil(minSize / total);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = total * scale;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.scale(scale, scale);
  ctx.translate(QUIET_ZONE, QUIET_ZONE);
  for (const cell of matrix.cells) {
    ctx.fillStyle = cell.dark ? '#000000' : '#FFFFFF';
    ctx.fill(new Path2D(roundedRect(cell.x, cell.y, cell.s, cell.r)));
  }
  return canvas.toDataURL('image/png');
}

// Plain views rather than react-native-svg: on Android in Expo Go the SVG root takes its box but
// never paints its children, which left the code blank white.
export function QrCode({ matrix, size }: { matrix: QrMatrix; size: number }) {
  const total = matrix.size + QUIET_ZONE * 2;
  const scale = size / total;
  return (
    <View style={{ width: size, height: size, backgroundColor: '#FFFFFF' }}>
      {matrix.cells.map((cell, i) => (
        <View
          key={i}
          style={{
            position: 'absolute',
            left: (cell.x + QUIET_ZONE) * scale,
            top: (cell.y + QUIET_ZONE) * scale,
            width: cell.s * scale,
            height: cell.s * scale,
            borderRadius: cell.r * scale,
            backgroundColor: cell.dark ? '#000000' : '#FFFFFF',
          }}
        />
      ))}
    </View>
  );
}
