/**
 * Downloads the OpenFreeMap "liberty" style and adapts it for Nivis → public/style.json
 *   npm run build-style
 * - Slovak names first: coalesce(name:sk, name)
 * - rivers strong blue (#2B7BB9), wider by zoom, italic river labels along the line
 * - water #8EC3E6
 * - fewer POIs / labels, 3D buildings from z14
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const SRC = process.env.STYLE_URL || 'https://tiles.openfreemap.org/styles/liberty';

const NAME = ['coalesce', ['get', 'name:sk'], ['get', 'name'], ['get', 'name:latin']];
const RIVER = '#2B7BB9', WATER = '#8EC3E6';

function replaceNames(v: any): any {
  if (Array.isArray(v)) {
    if (v[0] === 'get' && typeof v[1] === 'string' && /^name(:latin|_en|_int|:en)?$/.test(v[1])) return NAME;
    if (v[0] === 'coalesce' && v.some((x) => Array.isArray(x) && x[0] === 'get' && String(x[1]).startsWith('name'))) return NAME;
    return v.map(replaceNames);
  }
  if (typeof v === 'string' && /^\{name(:latin|_en|_int|:en)?\}$/.test(v)) return NAME;
  if (v && typeof v === 'object') { const o: any = {}; for (const k of Object.keys(v)) o[k] = replaceNames(v[k]); return o; }
  return v;
}

async function main() {
  const style = await (await fetch(SRC)).json();
  const DROP = new Set(['poi_r20', 'poi_r7', 'poi_r1', 'poi_transit', 'highway-name-path', 'highway-name-minor', 'road_one_way_arrow', 'road_one_way_arrow_opposite',
    'highway-shield-us-interstate', 'road_shield_us', 'label_other', 'airport', 'aeroway_taxiway', 'park_outline']);
  style.name = 'Nivis (OpenFreeMap Liberty)';
  style.sources.openmaptiles.attribution = '<a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> · <a href="https://www.openmaptiles.org/" target="_blank" rel="noopener">© OpenMapTiles</a> · <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap contributors</a>';
  if (style.sources.ne2_shaded) style.sources.ne2_shaded.attribution = '';
  style.layers = style.layers.filter((l: any) => !DROP.has(l.id)).map((l: any) => {
    if (l.layout && l.layout['text-field']) l.layout['text-field'] = replaceNames(l.layout['text-field']);
    switch (l.id) {
      case 'water':
        l.paint['fill-color'] = WATER; break;
      case 'waterway_river':
        l.paint['line-color'] = RIVER;
        l.paint['line-width'] = ['interpolate', ['exponential', 1.3], ['zoom'], 6, 1.4, 9, 2.4, 12, 4, 16, 10];
        l.minzoom = 0; break;
      case 'waterway_other':
        l.paint['line-color'] = RIVER;
        l.paint['line-width'] = ['interpolate', ['exponential', 1.3], ['zoom'], 9, 0.6, 13, 1.6, 16, 3];
        l.paint['line-opacity'] = 0.85; break;
      case 'waterway_tunnel':
        l.paint['line-color'] = RIVER; break;
      case 'waterway_line_label':
      case 'water_name_line_label':
        l.layout['text-font'] = ['Noto Sans Italic'];
        l.layout['symbol-placement'] = 'line';
        l.layout['text-size'] = ['interpolate', ['linear'], ['zoom'], 9, 11, 14, 14];
        l.layout['text-letter-spacing'] = 0.12;
        l.paint['text-color'] = '#0E4F86';
        l.paint['text-halo-color'] = 'rgba(255,255,255,0.9)';
        l.paint['text-halo-width'] = 1.6; break;
      case 'water_name_point_label':
        l.layout['text-font'] = ['Noto Sans Italic'];
        l.paint['text-color'] = '#0E4F86'; break;
      case 'label_village':
        l.minzoom = 11; break;
      case 'label_town':
        l.minzoom = 8; break;
      case 'building-3d':
        l.minzoom = 14; break;
      case 'boundary_2':
        l.paint['line-color'] = 'rgba(120,120,140,0.6)'; break;
    }
    return l;
  });
  fs.writeFileSync(path.join(ROOT, 'public/style.json'), JSON.stringify(style));
  console.log('public/style.json:', style.layers.length, 'layers');
}
main().catch((e) => { console.error(e); process.exit(1); });
