/**
 * Builds the static GeoJSON used by the building rules (src/data/*.json) from OpenStreetMap.
 *
 *   npm run fetch-osm            # Overpass first, Nominatim per feature as fallback
 *   npm run fetch-osm -- --fallback   # only reference/nivis-sk.json (no network)
 *
 * The rules must not depend on what is rendered on screen, so everything they need is baked here:
 *   sk-border.json  Slovakia (admin_level=2) outline
 *   rivers.json     waterway=river (+ canals), merged by name, simplified to ~50 m
 *   lakes.json      natural=water reservoirs/lakes > 0.5 km²
 *   cities.json     place=city|town with population → built-up radius R
 *   protected.json  boundary=national_park
 *
 * Sources that fail fall back to reference/nivis-sk.json (border, rivers, lakes) or to the
 * built-in lists below (cities with population). Responses are cached in .cache/osm.
 */
import fs from 'node:fs';
import path from 'node:path';
import * as turf from '@turf/turf';
import type { Feature, FeatureCollection, LineString, MultiLineString, MultiPolygon, Polygon, Position } from 'geojson';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'src/data');
const CACHE = path.join(ROOT, '.cache/osm');
const REF = JSON.parse(fs.readFileSync(path.join(ROOT, 'reference/nivis-sk.json'), 'utf8'));
const UA = 'nivis-maplibre-build/1.0 (educational game, Gymnazium Srobarova Kosice)';
const ONLY_FALLBACK = process.argv.includes('--fallback');
const CLIP: [number, number, number, number] = [16.2, 47.3, 23.1, 50.0];
fs.mkdirSync(CACHE, { recursive: true });
fs.mkdirSync(OUT, { recursive: true });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const log = (...a: unknown[]) => console.log('[fetch-osm]', ...a);
const round = (c: Position): Position => [Math.round(c[0] * 1e5) / 1e5, Math.round(c[1] * 1e5) / 1e5];

async function cached<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const f = path.join(CACHE, key.replace(/[^a-z0-9_-]+/gi, '_') + '.json');
  if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, 'utf8'));
  const v = await fn();
  fs.writeFileSync(f, JSON.stringify(v));
  return v;
}

async function getJson(url: string, init?: RequestInit, timeoutMs = 60000): Promise<any> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { ...init, signal: ctl.signal, headers: { 'User-Agent': UA, ...(init?.headers || {}) } });
    if (!r.ok) throw new Error(url + ' → HTTP ' + r.status);
    return await r.json();
  } finally { clearTimeout(t); }
}

// ---------------- Overpass (preferred) ----------------
async function overpass(q: string): Promise<any> {
  return getJson('https://overpass-api.de/api/interpreter', { method: 'POST', body: 'data=' + encodeURIComponent('[out:json][timeout:180];' + q), headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }, 200000);
}
async function overpassReachable(): Promise<boolean> {
  try { const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 15000); const r = await fetch('https://overpass-api.de/api/status', { headers: { 'User-Agent': UA }, signal: ctl.signal }); clearTimeout(t); return r.ok; } catch { return false; }
}

// ---------------- Nominatim (per feature) ----------------
let lastNominatim = 0;
async function nominatim(q: string, extra = ''): Promise<any[]> {
  return cached('nom_' + q + extra, async () => {
    const url = 'https://nominatim.openstreetmap.org/search?format=jsonv2&polygon_geojson=1&polygon_threshold=0.0004&extratags=1&namedetails=1&limit=8&q=' + encodeURIComponent(q) + extra;
    for (let attempt = 0; ; attempt++) {
      const wait = 1600 - (Date.now() - lastNominatim); if (wait > 0) await sleep(wait);
      lastNominatim = Date.now();
      try { return await getJson(url); } catch (e) {
        if (attempt >= 4 || !/HTTP 429|HTTP 5\d\d|abort|fetch failed/i.test(String((e as Error).message))) throw e;
        log('retry', q, 'in', 10 * (attempt + 1), 's'); await sleep(10000 * (attempt + 1));
      }
    }
  });
}

// ---------------- geometry helpers ----------------
function linesOf(g: any): Position[][] {
  if (!g) return [];
  if (g.type === 'LineString') return [g.coordinates];
  if (g.type === 'MultiLineString') return g.coordinates;
  if (g.type === 'Polygon') return [g.coordinates[0]];
  if (g.type === 'MultiPolygon') return g.coordinates.map((p: Position[][]) => p[0]);
  return [];
}
function clipLines(lines: Position[][]): Position[][] {
  const out: Position[][] = [];
  for (const l of lines) {
    if (l.length < 2) continue;
    const c = turf.bboxClip(turf.lineString(l), CLIP).geometry as LineString | MultiLineString;
    const parts = c.type === 'LineString' ? [c.coordinates] : c.coordinates;
    parts.forEach((p) => { if (p.length >= 2) out.push(p); });
  }
  return out;
}
function simplifyLines(lines: Position[][], tol = 0.0005): Position[][] {
  return lines.map((l) => (turf.simplify(turf.lineString(l), { tolerance: tol, highQuality: false }).geometry.coordinates).map(round)).filter((l) => l.length >= 2);
}
function polyOf(g: any): Polygon | MultiPolygon | null {
  if (!g) return null;
  if (g.type === 'Polygon' || g.type === 'MultiPolygon') return g;
  return null;
}
function simplifyPoly(g: Polygon | MultiPolygon, tol: number): Polygon | MultiPolygon {
  const s = turf.simplify(turf.feature(g), { tolerance: tol, highQuality: true }).geometry as Polygon | MultiPolygon;
  const r = (rings: Position[][]) => rings.map((ring) => ring.map(round));
  return s.type === 'Polygon' ? { type: 'Polygon', coordinates: r(s.coordinates) } : { type: 'MultiPolygon', coordinates: s.coordinates.map(r) };
}
const inSK = (lon: number, lat: number) => lon > 16.6 && lon < 22.7 && lat > 47.6 && lat < 49.7;
const fc = (features: Feature<any, any>[]) => ({ type: 'FeatureCollection', features } as FeatureCollection);
const write = (name: string, data: unknown) => { fs.writeFileSync(path.join(OUT, name), JSON.stringify(data)); log('wrote', name, (fs.statSync(path.join(OUT, name)).size / 1024).toFixed(0) + ' kB'); };

// ---------------- feature lists ----------------
const RIVERS: [string, number][] = [
  // name, display width class (km in the old game: used for line width / label size)
  ['Dunaj', 1.5], ['Váh', 0.75], ['Hron', 0.6], ['Hornád', 0.5], ['Ipeľ', 0.5], ['Morava', 0.6], ['Nitra', 0.5], ['Tisa', 0.9],
  ['Ondava', 0.38], ['Laborec', 0.38], ['Bodrog', 0.45], ['Poprad', 0.38], ['Orava', 0.38], ['Topľa', 0.38], ['Slaná', 0.42],
  ['Latorica', 0.5], ['Dunajec', 0.5], ['Kysuca', 0.38], ['Rimava', 0.38], ['Čierny Váh', 0.3], ['Biely Váh', 0.3], ['Turiec', 0.34],
  ['Torysa', 0.34], ['Uh', 0.34], ['Cirocha', 0.3], ['Žitava', 0.3], ['Malý Dunaj', 0.4], ['Myjava', 0.3], ['Rajčianka', 0.3],
  ['Bebrava', 0.3], ['Hnilec', 0.3], ['Bodva', 0.3], ['Krupinica', 0.3], ['Slatina', 0.3], ['Teplica', 0.28], ['Revúca', 0.28],
  ['Belá', 0.28], ['Udava', 0.28], ['Olka', 0.28], ['Chocholnica', 0.26], ['Rudava', 0.26], ['Dudváh', 0.3], ['Blava', 0.26],
  ['Čierna voda', 0.3], ['Klátovské rameno', 0.26], ['Štiavnica', 0.26], ['Litava', 0.26], ['Výrovka', 0.26], ['Svinka', 0.26]
];
const RIVER_QUERY: Record<string, string> = { Uh: 'Uh rieka', Bodva: 'Bodva' };
// big rivers whose Slovak name search only returns single ways: use the OSM waterway relation directly
const RIVER_OSM: Record<string, string> = { Dunaj: 'R89652' };
const CANALS = ['Gabčíkovo prívodný kanál', 'Odpadový kanál Gabčíkovo'];
const LAKES = ['Vodné dielo Kráľová', 'Vodná nádrž Starina', 'Vodné dielo Žilina', 'Liptovská Mara', 'Oravská priehrada', 'Zemplínska šírava', 'Hrušovská zdrž', 'Sĺňava', 'Veľká Domaša', 'Ružín', 'Starina',
  'Vodná nádrž Kráľová', 'Nosická priehrada', 'Vodná nádrž Žilina', 'Vodná nádrž Bešeňová', 'Vodná nádrž Čierny Váh', 'Palcmanská Maša',
  'Vodná nádrž Hričov', 'Vodná nádrž Velké Kozmálovce', 'Ružiná', 'Vodná nádrž Liptovská Mara', 'Vodná nádrž Krpeľany', 'Vodná nádrž Tvrdošín',
  'Vinianske jazero', 'Vodná nádrž Teplý Vrch', 'Vodná nádrž Málinec', 'Vodná nádrž Bukovec', 'Vodná nádrž Veľké Kozmálovce', 'Vodná nádrž Klenovec', 'Vodná nádrž Hriňová'];
const PARKS = ['Tatranský národný park', 'Národný park Nízke Tatry', 'Pieninský národný park', 'Národný park Malá Fatra', 'Národný park Muránska planina',
  'Národný park Slovenský raj', 'Národný park Poloniny', 'Národný park Veľká Fatra', 'Národný park Slovenský kras'];
const PARK_ALT: Record<string, string> = { 'Národný park Slovenský kras': 'Slovenský kras' };
const PARK_SHORT: Record<string, string> = { 'Tatranský národný park': 'TANAP', 'Národný park Nízke Tatry': 'NAPANT', 'Pieninský národný park': 'PIENAP' };
// population (2021 census, rounded) – used when OSM has no population tag
const CITIES: [string, number][] = [
  ['Bratislava', 475000], ['Košice', 229000], ['Prešov', 85000], ['Žilina', 81000], ['Nitra', 78000], ['Banská Bystrica', 76000], ['Trnava', 63000],
  ['Trenčín', 54000], ['Martin', 52000], ['Poprad', 50000], ['Prievidza', 45000], ['Zvolen', 41000], ['Považská Bystrica', 39000], ['Michalovce', 38000],
  ['Nové Zámky', 37000], ['Spišská Nová Ves', 35000], ['Komárno', 33000], ['Levice', 32000], ['Humenné', 31000], ['Bardejov', 31000],
  ['Liptovský Mikuláš', 30000], ['Lučenec', 26000], ['Piešťany', 27000], ['Ružomberok', 26000], ['Topoľčany', 25000], ['Trebišov', 23000],
  ['Čadca', 23000], ['Dubnica nad Váhom', 23000], ['Rimavská Sobota', 22000], ['Partizánske', 22000], ['Pezinok', 23000], ['Vranov nad Topľou', 22000],
  ['Šaľa', 22000], ['Dunajská Streda', 23000], ['Hlohovec', 21000], ['Brezno', 20000], ['Senica', 20000], ['Nové Mesto nad Váhom', 19000],
  ['Snina', 19000], ['Senec', 21000], ['Rožňava', 19000], ['Dolný Kubín', 18000], ['Žiar nad Hronom', 18000], ['Bánovce nad Bebravou', 18000],
  ['Púchov', 17000], ['Malacky', 18000], ['Handlová', 16000], ['Kežmarok', 16000], ['Sereď', 16000], ['Stará Ľubovňa', 16000], ['Galanta', 15000],
  ['Kysucké Nové Mesto', 15000], ['Levoča', 14000], ['Skalica', 14000], ['Detva', 14000], ['Sabinov', 12000], ['Banská Štiavnica', 10000], ['Stupava', 13000],
  ['Svidník', 10000], ['Veľký Krtíš', 12000], ['Šamorín', 14000], ['Štúrovo', 10000], ['Hnúšťa', 7000], ['Revúca', 12000], ['Krupina', 7000],
  ['Tvrdošín', 9000], ['Námestovo', 8000], ['Žarnovica', 6000], ['Moldava nad Bodvou', 11000], ['Kráľovský Chlmec', 7000], ['Medzilaborce', 6000]
];

// ---------------- builders ----------------
async function buildBorder(useOverpass: boolean): Promise<Polygon> {
  try {
    let g: any = null;
    if (useOverpass) {
      const d = await cached('ovp_border', () => overpass('relation["boundary"="administrative"]["admin_level"="2"]["ISO3166-1"="SK"];out geom;'));
      const outer = d.elements[0].members.filter((m: any) => m.role === 'outer' && m.geometry).map((m: any) => m.geometry.map((p: any) => [p.lon, p.lat]));
      const poly = turf.polygonize(turf.featureCollection(outer.map((l: Position[]) => turf.lineString(l))) as any);
      g = poly.features.sort((a, b) => turf.area(b) - turf.area(a))[0].geometry;
    } else {
      const r = await nominatim('Slovensko', '&featureType=country&polygon_threshold=0.002');
      g = polyOf(r.find((x) => x.type === 'administrative' || x.addresstype === 'country')?.geojson);
    }
    if (!g) throw new Error('no border');
    let p: Polygon = g.type === 'MultiPolygon' ? { type: 'Polygon', coordinates: g.coordinates.sort((a: any, b: any) => turf.area(turf.polygon(b)) - turf.area(turf.polygon(a)))[0] } : g;
    p = simplifyPoly(p, 0.002) as Polygon;
    log('border from OSM:', p.coordinates[0].length, 'points');
    return p;
  } catch (e) {
    log('border fallback (nivis-sk.json):', (e as Error).message);
    const ring = REF.border.slice(); if (ring[0][0] !== ring[ring.length - 1][0]) ring.push(ring[0]);
    return { type: 'Polygon', coordinates: [ring] };
  }
}

async function buildRivers(useOverpass: boolean) {
  const byName = new Map<string, { w: number; lines: Position[][]; src: string }>();
  RIVERS.forEach(([n, w]) => byName.set(n, { w, lines: [], src: '' }));
  if (useOverpass) {
    try {
      const d = await cached('ovp_rivers', () => overpass('area["ISO3166-1"="SK"][admin_level=2]->.sk;(way["waterway"~"^(river|canal)$"]["name"](area.sk););out geom;'));
      for (const el of d.elements) {
        const n = el.tags['name:sk'] || el.tags.name; const w = el.tags.waterway === 'canal' ? 0.3 : 0.3;
        if (!byName.has(n)) byName.set(n, { w, lines: [], src: '' });
        byName.get(n)!.lines.push(el.geometry.map((p: any) => [p.lon, p.lat])); byName.get(n)!.src = 'overpass';
      }
    } catch (e) { log('overpass rivers failed:', (e as Error).message); }
  }
  for (const [n, rec] of byName) {
    if (rec.lines.length) continue;
    try {
      if (RIVER_OSM[n]) {
        const r = await cached('lookup_' + RIVER_OSM[n], async () => { const wait = 1600 - (Date.now() - lastNominatim); if (wait > 0) await sleep(wait); lastNominatim = Date.now(); return getJson('https://nominatim.openstreetmap.org/lookup?format=json&polygon_geojson=1&polygon_threshold=0.0004&osm_ids=' + RIVER_OSM[n]); });
        if (r[0]?.geojson) { rec.lines = linesOf(r[0].geojson); rec.src = 'nominatim'; continue; }
      }
      const res = await nominatim(RIVER_QUERY[n] || n + ', Slovensko');
      const names = (x: any) => [x.name, x.namedetails?.name, x.namedetails?.['name:sk']].filter(Boolean).flatMap((v: string) => [v, ...v.split(' / ')]);
      const hits = res.filter((x) => x.category === 'waterway' && (x.type === 'river' || x.type === 'canal') && names(x).includes(n));
      const best = hits.filter((x) => x.osm_type === 'relation')[0] || hits[0];
      if (best) { rec.lines = linesOf(best.geojson); rec.src = 'nominatim'; }
    } catch (e) { log('river', n, 'failed:', (e as Error).message); }
  }
  for (const n of CANALS) {
    try {
      const res = await nominatim(n);
      const hit = res.find((x) => x.category === 'waterway' && x.type === 'canal');
      if (hit && linesOf(hit.geojson).flat().length > 5) byName.set(hit.name || n, { w: 0.45, lines: linesOf(hit.geojson), src: 'nominatim' });
    } catch { /* optional */ }
  }
  // fallback / supplement: rivers from the reference data that OSM did not deliver
  for (const r of REF.rivers) {
    if (!r.n) continue;
    const rec = byName.get(r.n);
    if (rec && rec.lines.length) continue;
    byName.set(r.n, { w: r.w, lines: r.l, src: 'nivis-sk.json' });
  }
  const features: Feature<MultiLineString>[] = [];
  for (const [n, rec] of byName) {
    const lines = simplifyLines(clipLines(rec.lines));
    if (!lines.length) continue;
    const anyInSK = lines.some((l) => l.some((c) => inSK(c[0], c[1])));
    if (!anyInSK && !['Dunaj', 'Tisa', 'Morava'].includes(n)) continue;
    features.push({ type: 'Feature', properties: { name: n, w: rec.w, src: rec.src }, geometry: { type: 'MultiLineString', coordinates: lines } });
  }
  log('rivers:', features.length, features.map((f) => f.properties!.name + '(' + f.properties!.src.slice(0, 3) + ')').join(' '));
  return fc(features);
}

async function buildLakes() {
  const features: Feature<Polygon | MultiPolygon>[] = [];
  const seen = new Set<number>();
  for (const n of LAKES) {
    try {
      const res = await nominatim(n + ', Slovensko');
      const hit = res.find((x) => (x.category === 'natural' && x.type === 'water') || (x.category === 'landuse' && x.type === 'reservoir') || x.category === 'water');
      const g = hit && polyOf(hit.geojson);
      if (!g || seen.has(hit.osm_id)) continue;
      seen.add(hit.osm_id);
      const km2 = turf.area(g) / 1e6;
      if (km2 < 0.5) continue;
      const name = hit.namedetails?.['name:sk'] || hit.name || n;
      features.push({ type: 'Feature', properties: { name, km2: Math.round(km2 * 10) / 10 }, geometry: simplifyPoly(g, 0.0003) });
    } catch (e) { log('lake', n, 'failed:', (e as Error).message); }
  }
  if (features.length < 4) {
    log('lakes fallback (nivis-sk.json)');
    for (const l of REF.lakes) { const ring = l.p.concat([l.p[0]]); if (features.some((f) => f.properties!.name === l.n && l.n)) continue; features.push({ type: 'Feature', properties: { name: l.n || '', km2: 0 }, geometry: { type: 'Polygon', coordinates: [ring] } }); }
  }
  log('lakes:', features.map((f) => f.properties!.name + ' ' + f.properties!.km2 + 'km²').join(', '));
  return fc(features);
}

async function buildCities() {
  const features: Feature[] = [];
  for (const [n, popFallback] of CITIES) {
    let lon = 0, lat = 0, pop = popFallback;
    try {
      const res = await nominatim(n, '&countrycodes=sk&featureType=city');
      const hit = res.find((x) => x.category === 'place' || x.category === 'boundary') || res[0];
      if (hit) { lon = +hit.lon; lat = +hit.lat; const p = parseInt(String(hit.extratags?.population || '').replace(/\s/g, ''), 10); if (p > 1000) pop = p; }
    } catch (e) { log('city', n, 'failed:', (e as Error).message); }
    if (!lon) continue;
    const R = 0.9 + Math.sqrt(pop / 1000) * 0.18; // built-up radius in km
    features.push({ type: 'Feature', properties: { name: n, pop, R: Math.round(R * 100) / 100 }, geometry: { type: 'Point', coordinates: round([lon, lat]) } });
  }
  log('cities:', features.length);
  return fc(features);
}

async function buildParks() {
  const features: Feature[] = [];
  for (const n of PARKS) {
    try {
      const res = await nominatim(n, '&polygon_threshold=0.0008');
      let hit = res.find((x) => (x.type === 'national_park' || x.type === 'protected_area') && polyOf(x.geojson));
      // NP Slovenský kras has no searchable park boundary in OSM → the karst plateau (geomorphological unit) approximates it
      if (!hit && PARK_ALT[n]) hit = (await nominatim(PARK_ALT[n], '&polygon_threshold=0.0008')).find((x) => polyOf(x.geojson));
      const g = hit && polyOf(hit.geojson);
      if (!g) { log('park', n, 'not found'); continue; }
      features.push({ type: 'Feature', properties: { name: n, short: PARK_SHORT[n] || '' }, geometry: simplifyPoly(g, 0.0008) });
    } catch (e) { log('park', n, 'failed:', (e as Error).message); }
  }
  log('parks:', features.length);
  return fc(features);
}

async function main() {
  const ovp = !ONLY_FALLBACK && await overpassReachable();
  log(ONLY_FALLBACK ? 'fallback only' : ovp ? 'Overpass reachable' : 'Overpass not reachable → Nominatim + fallback');
  if (ONLY_FALLBACK) {
    const ring = REF.border.concat([REF.border[0]]);
    write('sk-border.json', { type: 'Feature', properties: { src: 'nivis-sk.json' }, geometry: { type: 'Polygon', coordinates: [ring] } });
    write('rivers.json', fc(REF.rivers.filter((r: any) => r.n).map((r: any) => ({ type: 'Feature', properties: { name: r.n, w: r.w, src: 'nivis-sk.json' }, geometry: { type: 'MultiLineString', coordinates: r.l } }))));
    write('lakes.json', fc(REF.lakes.map((l: any) => ({ type: 'Feature', properties: { name: l.n, km2: 0 }, geometry: { type: 'Polygon', coordinates: [l.p.concat([l.p[0]])] } }))));
    return;
  }
  const border = await buildBorder(ovp);
  write('sk-border.json', { type: 'Feature', properties: {}, geometry: border });
  write('rivers.json', await buildRivers(ovp));
  write('lakes.json', await buildLakes());
  write('cities.json', await buildCities());
  write('protected.json', await buildParks());
  write('neighbours.json', fc(REF.nb.map((l: Position[]) => ({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: l } }))));
}

main().catch((e) => { console.error(e); process.exit(1); });
