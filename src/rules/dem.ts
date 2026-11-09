/**
 * Height sampler for the building rules. The grid (public/dem-sk.bin) is decoded at build time from
 * AWS Terrain Tiles (Terrarium z=10, scripts/build-dem.ts), so rules give the same answer regardless of
 * zoom, view or which map tiles are loaded. Heights are real metres (no terrain exaggeration).
 */
export const DEM_GRID = { lon0: 16.8, lat0: 49.66, dLon: 0.006, dLat: 0.004, W: 970, H: 496 };

let grid: Int16Array | null = null;

export function setDem(buf: ArrayBuffer | ArrayBufferView) {
  const ab = buf instanceof ArrayBuffer ? buf : (buf as ArrayBufferView).buffer.slice((buf as ArrayBufferView).byteOffset, (buf as ArrayBufferView).byteOffset + (buf as ArrayBufferView).byteLength);
  grid = new Int16Array(ab as ArrayBuffer);
  if (grid.length !== DEM_GRID.W * DEM_GRID.H) throw new Error('dem-sk.bin has an unexpected size');
}
export async function loadDem(url: string) { const r = await fetch(url); if (!r.ok) throw new Error('DEM ' + r.status); setDem(await r.arrayBuffer()); }
export const demReady = () => !!grid;

/** elevation in metres (bilinear), 0 outside the grid */
export function elevation(lon: number, lat: number): number {
  if (!grid) return 0;
  const { lon0, lat0, dLon, dLat, W, H } = DEM_GRID;
  const fx = (lon - lon0) / dLon, fy = (lat0 - lat) / dLat;
  if (fx < 0 || fy < 0 || fx >= W - 1 || fy >= H - 1) return 0;
  const ix = fx | 0, iy = fy | 0, ax = fx - ix, ay = fy - iy;
  const g = grid, i = iy * W + ix;
  return (g[i] * (1 - ax) + g[i + 1] * ax) * (1 - ay) + (g[i + W] * (1 - ax) + g[i + W + 1] * ax) * ay;
}
