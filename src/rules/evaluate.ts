/**
 * Building rules – port of Component.evaluate (+ nearestRiver, inLake, inside, windFactor, solarFactor)
 * from reference/Main.dc.html, working on real lon/lat and real kilometres.
 * Data comes from static GeoJSON (src/data, built by scripts/fetch-osm.ts), never from rendered tiles.
 * New rules (BRIEF.md): pumped storage needs ≥ 200 m relief within 3 km; wind and coal not in national parks.
 */
import borderData from '../data/sk-border.json';
import riversData from '../data/rivers.json';
import lakesData from '../data/lakes.json';
import citiesData from '../data/cities.json';
import parksData from '../data/protected.json';
import { CREDIT, ITEM_BY, fmtMoney, fmtNum, type PlantType } from '../sim/constants';
import type { Plant } from '../sim/sim';
import { demReady, elevation } from './dem';

export type LngLat = [number, number];
const KM_LAT = 111.13;
const kmLon = (lat: number) => 111.32 * Math.cos(lat * Math.PI / 180);

// ---------- prepared geometry ----------
interface Line { name: string; w: number; pts: LngLat[]; bb: [number, number, number, number]; down?: 1 | -1 }
interface Poly { name: string; rings: LngLat[][]; bb: [number, number, number, number] }
const bbox = (pts: LngLat[]): [number, number, number, number] => {
  let a = 1e9, b = 1e9, c = -1e9, d = -1e9;
  for (const p of pts) { if (p[0] < a) a = p[0]; if (p[1] < b) b = p[1]; if (p[0] > c) c = p[0]; if (p[1] > d) d = p[1]; }
  return [a, b, c, d];
};
const RIVERS: Line[] = [];
for (const f of (riversData as any).features) {
  for (const l of f.geometry.coordinates as LngLat[][]) if (l.length > 1) RIVERS.push({ name: f.properties.name, w: f.properties.w, pts: l, bb: bbox(l) });
}
function polysOf(f: any, name: string): Poly[] {
  const g = f.geometry; const list: LngLat[][][] = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
  return list.map((rings) => ({ name, rings, bb: bbox(rings[0]) }));
}
const LAKES: Poly[] = (lakesData as any).features.flatMap((f: any) => polysOf(f, f.properties.name || ''));
const PARK_LABEL: Record<string, string> = {
  'Tatranský národný park': 'TANAP', 'Národný park Nízke Tatry': 'Nízke Tatry', 'Pieninský národný park': 'Pieniny'
};
const PARKS: Poly[] = (parksData as any).features.flatMap((f: any) => polysOf(f, PARK_LABEL[f.properties.name] || f.properties.name.replace(/^Národný park /, '')));
const BORDER: LngLat[] = (borderData as any).geometry.coordinates[0];
const BORDER_BB = bbox(BORDER);
export interface City { name: string; lngLat: LngLat; pop: number; R: number }
export const CITIES: City[] = (citiesData as any).features.map((f: any) => ({ name: f.properties.name, lngLat: f.geometry.coordinates, pop: f.properties.pop, R: f.properties.R }));

// ---------- geometry helpers ----------
function inRing(ring: LngLat[], x: number, y: number) {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) c = !c;
  }
  return c;
}
const inPoly = (p: Poly, x: number, y: number) => x >= p.bb[0] && x <= p.bb[2] && y >= p.bb[1] && y <= p.bb[3] && inRing(p.rings[0], x, y) && !p.rings.slice(1).some((h) => inRing(h, x, y));
export const inside = (ll: LngLat) => ll[0] >= BORDER_BB[0] && ll[0] <= BORDER_BB[2] && ll[1] >= BORDER_BB[1] && ll[1] <= BORDER_BB[3] && inRing(BORDER, ll[0], ll[1]);

/** distance in km between two lon/lat points (local equirectangular – <0.5 % error within Slovakia) */
export function distKm(a: LngLat, b: LngLat) { const kx = kmLon((a[1] + b[1]) / 2); return Math.hypot((a[0] - b[0]) * kx, (a[1] - b[1]) * KM_LAT); }

/** closest point on a segment, in km around the query point */
function segDist(p: LngLat, a: LngLat, b: LngLat, kx: number) {
  const ax = (a[0] - p[0]) * kx, ay = (a[1] - p[1]) * KM_LAT, bx = (b[0] - p[0]) * kx, by = (b[1] - p[1]) * KM_LAT;
  const dx = bx - ax, dy = by - ay; const l2 = dx * dx + dy * dy;
  let t = l2 ? (-ax * dx - ay * dy) / l2 : 0; t = t < 0 ? 0 : t > 1 ? 1 : t;
  const qx = ax + dx * t, qy = ay + dy * t;
  return { d: Math.hypot(qx, qy), q: [p[0] + qx / kx, p[1] + qy / KM_LAT] as LngLat, dir: [dx, dy] as [number, number] };
}

export interface RiverHit { d: number; name: string; q: LngLat; dir: [number, number] }
/** OSM ways point downstream, but merged relation parts may be reversed → decide by the terrain (start higher than end) */
function downstreamSign(r: Line): 1 | -1 {
  if (r.down) return r.down;
  if (!demReady()) return 1;
  const a = r.pts[0], b = r.pts[r.pts.length - 1];
  const ha = elevation(a[0], a[1]), hb = elevation(b[0], b[1]);
  r.down = ha - hb < -2 ? -1 : 1;
  return r.down;
}
/** nearest river (km from the bank: centre-line distance minus a small half width) */
export function nearestRiver(ll: LngLat): RiverHit {
  const kx = kmLon(ll[1]); const padLon = 8 / kx, padLat = 8 / KM_LAT;
  let best: RiverHit = { d: 1e9, name: '', q: ll, dir: [1, 0] };
  for (const r of RIVERS) {
    if (ll[0] < r.bb[0] - padLon || ll[0] > r.bb[2] + padLon || ll[1] < r.bb[1] - padLat || ll[1] > r.bb[3] + padLat) continue;
    const half = r.w * 0.15;
    for (let i = 0; i < r.pts.length - 1; i++) {
      const s = segDist(ll, r.pts[i], r.pts[i + 1], kx);
      const d = s.d - half;
      if (d < best.d) { const sg = downstreamSign(r); best = { d, name: r.name, q: s.q, dir: [s.dir[0] * sg, s.dir[1] * sg] }; }
    }
  }
  return best;
}
/** lake containing the point (or closer than pad km to its shore) */
export function inLake(ll: LngLat, pad: number): Poly | null {
  const kx = kmLon(ll[1]); const pLon = pad / kx, pLat = pad / KM_LAT;
  for (const L of LAKES) {
    if (ll[0] < L.bb[0] - pLon || ll[0] > L.bb[2] + pLon || ll[1] < L.bb[1] - pLat || ll[1] > L.bb[3] + pLat) continue;
    if (inPoly(L, ll[0], ll[1])) return L;
    if (pad > 0) { const ring = L.rings[0]; for (let i = 0; i < ring.length - 1; i++) if (segDist(ll, ring[i], ring[i + 1], kx).d < pad) return L; }
  }
  return null;
}
export function nationalPark(ll: LngLat): string | null { for (const p of PARKS) if (inPoly(p, ll[0], ll[1])) return p.name; return null; }

/** points on a circle of radius km around ll */
function ring(ll: LngLat, km: number, n: number): LngLat[] {
  const kx = kmLon(ll[1]); const out: LngLat[] = [];
  for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; out.push([ll[0] + Math.cos(a) * km / kx, ll[1] + Math.sin(a) * km / KM_LAT]); }
  return out;
}
/** height difference (max − min) within radius km, 16 samples on the circle + 8 on half radius + centre */
export function relief(ll: LngLat, km = 3): number {
  const hs = [elevation(ll[0], ll[1]), ...ring(ll, km, 16).map((p) => elevation(p[0], p[1])), ...ring(ll, km / 2, 8).map((p) => elevation(p[0], p[1]))];
  return Math.max(...hs) - Math.min(...hs);
}

/** wind quality 0.7–1.3: higher = windier; exposed spots (above the surroundings) get a bonus */
export function windFactor(ll: LngLat): number {
  const h = elevation(ll[0], ll[1]);
  const around = ring(ll, 2.5, 12).map((p) => elevation(p[0], p[1]));
  const mean = around.reduce((a, b) => a + b, 0) / around.length;
  const open = Math.max(-0.1, Math.min(0.15, (h - mean) / 400));
  const v = 0.75 + 0.5 * Math.max(0, Math.min(1, (h - 150) / 900)) + open;
  return Math.min(1.3, Math.max(0.7, v));
}
/** solar quality 0.75–1.15: the south is sunnier (same as the original), slightly less in high mountains */
export function solarFactor(ll: LngLat): number {
  const h = elevation(ll[0], ll[1]);
  const south = Math.min(1, Math.max(0, (49.607 - ll[1]) / 1.874));
  return Math.min(1.15, Math.max(0.75, 0.88 + south * 0.24 - Math.max(0, h / 1000 - 1.2) * 0.25));
}
export function locFactor(type: PlantType, ll: LngLat) { return type === 'wind' ? windFactor(ll) : type === 'solar' ? solarFactor(ll) : 1; }

export const MIN_PLANT_DIST_KM = 3.5;

export type Evaluation =
  | { ok: false; why: string }
  | { ok: true; lngLat: LngLat; dir?: [number, number]; sub: string; river: string; cost: number; loc: number };

export interface EvalContext { plants: Plant[]; money: number | null }

export function evaluate(type: PlantType, ll: LngLat, ignore: Plant | null, ctx: EvalContext): Evaluation {
  const it = ITEM_BY[type];
  let p: LngLat = ll, dir: [number, number] | undefined, river = '';
  if (!inside(ll)) return { ok: false, why: 'Stavať môžeš len na Slovensku' };
  const rv = nearestRiver(ll);
  if (type === 'hydro') {
    if (rv.d > 3.5) return { ok: false, why: 'Vodná elektráreň musí stáť na rieke' };
    p = rv.q; river = rv.name;
    const l = Math.hypot(rv.dir[0], rv.dir[1]) || 1; dir = [rv.dir[0] / l, rv.dir[1] / l];
    if (!inside(p)) return { ok: false, why: 'Táto časť rieky je za hranicou' };
  } else if (rv.d < 1.2) return { ok: false, why: 'Tu tečie ' + (rv.name ? 'rieka ' + rv.name : 'rieka') + ' – vyber suché miesto' };
  if (type === 'nuclear') { if (rv.d > 6) return { ok: false, why: 'Jadrová elektráreň potrebuje rieku na chladenie (do 6 km)' }; river = rv.name; }
  if (type === 'pumped') {
    if (elevation(p[0], p[1]) < 550) return { ok: false, why: 'Prečerpávacia VE potrebuje kopce (nad 550 m)' };
    if (rv.d > 6) return { ok: false, why: 'Prečerpávacia VE potrebuje rieku do 6 km' };
    if (relief(p, 3) < 200) return { ok: false, why: 'Prečerpávacia VE potrebuje väčší výškový rozdiel' };
    river = rv.name;
  }
  if (type === 'wind' || type === 'coal') { const np = nationalPark(p); if (np) return { ok: false, why: 'Tu je národný park ' + np + ' – stavať sa tu nesmie' }; }
  const lk = inLake(p, type === 'hydro' ? 0 : 1.5);
  if (lk) return { ok: false, why: 'Tu je ' + (lk.name || 'jazero') };
  for (const ct of CITIES) { if (distKm(p, ct.lngLat) < (type === 'battery' ? ct.R * 0.4 + 0.5 : ct.R * 0.75 + 2)) return { ok: false, why: 'Príliš blízko mesta ' + ct.name }; }
  for (const q of ctx.plants) { if (q === ignore) continue; if (distKm(p, q.lngLat) < MIN_PLANT_DIST_KM) return { ok: false, why: 'Príliš blízko inej elektrárne' }; }
  const cost = ignore ? (ignore.build > 0 ? 0 : Math.round(it.price * 0.1)) : it.price;
  if (ctx.money !== null && ctx.money - cost < -CREDIT) return { ok: false, why: 'Prekročil by si úverový limit 12 mld. € (' + fmtMoney(cost) + ')' };
  const loc = locFactor(type, p);
  let sub = it.mw + ' MW';
  if (type === 'wind') { const f = loc; sub += ' · vietor ' + (f < 0.85 ? 'slabší' : f < 1.05 ? 'priemerný' : 'silný') + ' (≈' + Math.round(24 * f) + ' %)'; }
  if (type === 'solar') { const f = loc; sub += ' · slnko ' + (f < 0.95 ? 'slabšie' : f < 1.05 ? 'priemerné' : 'výborné') + ' (≈' + Math.round(11 * f) + ' %)'; }
  if (type === 'hydro') sub += ' · na rieke ' + (river || '');
  if (type === 'nuclear') sub += ' · chladenie z rieky ' + (river || '');
  if (type === 'coal') sub += ' · 820 g CO₂/kWh';
  if (type === 'battery') sub = it.mw + ' MW / ' + it.mw * it.hours! + ' MWh · nabíja cez deň, vybíja večer';
  if (type === 'pumped') sub = it.mw + ' MW / ' + fmtNum(it.mw * it.hours!) + ' MWh · voda z rieky ' + (river || '');
  sub += ' · ' + (ignore ? (cost ? 'presun ' + fmtMoney(cost) : 'presun zadarmo') : fmtMoney(cost));
  return { ok: true, lngLat: p, dir, sub, river, cost, loc };
}
