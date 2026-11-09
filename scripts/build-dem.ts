/**
 * Builds public/dem-sk.bin – a height grid of Slovakia decoded from AWS Terrain Tiles (Terrarium, z=10).
 *   npm run build-dem
 * Terrarium: h = R*256 + G + B/256 − 32768 (metres). The grid is what the building rules sample
 * (pumped storage height/relief, wind factor, solar factor), so it never depends on which map tiles
 * happen to be loaded on screen. Format: Int16 little-endian, row 0 = north, see DEM_GRID in src/rules/dem.ts.
 */
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import { DEM_GRID } from '../src/rules/dem';

const ROOT = path.resolve(import.meta.dirname, '..');
const CACHE = path.join(ROOT, '.cache/dem');
const Z = 10, N = 2 ** Z;
fs.mkdirSync(CACHE, { recursive: true });

const tileX = (lon: number) => (lon + 180) / 360 * N;
const tileY = (lat: number) => { const r = lat * Math.PI / 180; return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * N; };

const tiles = new Map<string, PNG>();
async function tile(x: number, y: number): Promise<PNG> {
  const key = x + '_' + y;
  if (tiles.has(key)) return tiles.get(key)!;
  const f = path.join(CACHE, `${Z}_${key}.png`);
  if (!fs.existsSync(f)) {
    for (let attempt = 0; ; attempt++) {
      try {
        const r = await fetch(`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${Z}/${x}/${y}.png`);
        if (!r.ok) throw new Error('HTTP ' + r.status);
        fs.writeFileSync(f, Buffer.from(await r.arrayBuffer())); break;
      } catch (e) { if (attempt > 3) throw e; await new Promise((res) => setTimeout(res, 2000 * (attempt + 1))); }
    }
  }
  const png = PNG.sync.read(fs.readFileSync(f));
  tiles.set(key, png);
  return png;
}
async function height(lon: number, lat: number): Promise<number> {
  const fx = tileX(lon), fy = tileY(lat);
  const tx = Math.floor(fx), ty = Math.floor(fy);
  const png = await tile(tx, ty);
  const px = Math.min(255, Math.floor((fx - tx) * 256)), py = Math.min(255, Math.floor((fy - ty) * 256));
  const i = (py * 256 + px) * 4; const d = png.data;
  return d[i] * 256 + d[i + 1] + d[i + 2] / 256 - 32768;
}

async function main() {
  const { lon0, lat0, dLon, dLat, W, H } = DEM_GRID;
  // prefetch all tiles in parallel batches
  const xs: number[] = [], ys: number[] = [];
  for (let x = Math.floor(tileX(lon0)); x <= Math.floor(tileX(lon0 + dLon * (W - 1))); x++) xs.push(x);
  for (let y = Math.floor(tileY(lat0)); y <= Math.floor(tileY(lat0 - dLat * (H - 1))); y++) ys.push(y);
  const all = xs.flatMap((x) => ys.map((y) => [x, y]));
  console.log('[build-dem]', all.length, 'tiles z' + Z);
  for (let i = 0; i < all.length; i += 12) await Promise.all(all.slice(i, i + 12).map(([x, y]) => tile(x, y)));
  const out = new Int16Array(W * H);
  let mx = -1e9, mn = 1e9;
  for (let r = 0; r < H; r++) {
    const lat = lat0 - r * dLat;
    for (let c = 0; c < W; c++) {
      // average of 4 sub-samples → smoother grid
      let s = 0;
      for (const [a, b] of [[-0.25, -0.25], [0.25, -0.25], [-0.25, 0.25], [0.25, 0.25]]) s += await height(lon0 + (c + a) * dLon, lat + b * dLat);
      const h = Math.round(s / 4); out[r * W + c] = h; if (h > mx) mx = h; if (h < mn) mn = h;
    }
  }
  fs.writeFileSync(path.join(ROOT, 'public/dem-sk.bin'), Buffer.from(out.buffer));
  console.log('[build-dem] public/dem-sk.bin', W + '×' + H, 'min', mn, 'max', mx, (out.byteLength / 1024).toFixed(0) + ' kB');
}
main().catch((e) => { console.error(e); process.exit(1); });
