// Base map switch: OpenStreetMap vector map ↔ satellite imagery (+ OSM 3D buildings, labels, game layers on top)
import type { Map as MLMap } from 'maplibre-gl';

export type Basemap = 'map' | 'sat';
const MAPTILER_KEY = import.meta.env.VITE_MAPTILER_KEY as string | undefined;

/** satellite raster: MapTiler Satellite with a key from .env (sharp), otherwise EOX Sentinel-2 cloudless (no key, 10 m) */
export function satelliteSource(): any {
  if (MAPTILER_KEY) {
    return {
      type: 'raster', tileSize: 256, maxzoom: 20,
      tiles: ['https://api.maptiler.com/tiles/satellite-v2/{z}/{x}/{y}.jpg?key=' + MAPTILER_KEY],
      attribution: '<a href="https://www.maptiler.com/copyright/" target="_blank" rel="noopener">© MapTiler</a> Satelit'
    };
  }
  return {
    type: 'raster', tileSize: 256, maxzoom: 14,
    tiles: ['https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2025_3857/default/g/{z}/{y}/{x}.jpg'],
    attribution: 'Satelit: <a href="https://s2maps.eu" target="_blank" rel="noopener">Sentinel-2 cloudless – s2maps.eu</a> by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2025, CC BY-NC-SA 4.0)'
  };
}

export function addSatelliteLayer(map: MLMap) {
  map.addSource('satellite', satelliteSource());
  // above every base-map fill and road, below hillshade, buildings, game layers and labels
  map.addLayer({
    id: 'satellite', type: 'raster', source: 'satellite', layout: { visibility: 'none' },
    paint: { 'raster-saturation': 0.05, 'raster-contrast': 0.05, 'raster-brightness-min': 0.07, 'raster-fade-duration': 200 }
  }, map.getLayer('hillshade') ? 'hillshade' : undefined);
}

// paint values that differ in satellite mode: [layer, property, satellite value]
const SAT_PAINT: [string, string, any][] = [
  ['hillshade', 'hillshade-exaggeration', ['interpolate', ['linear'], ['zoom'], 6, 0.45, 12, 0.2]],
  ['game-rivers', 'line-opacity', 0.95],
  ['game-rivers-casing', 'line-opacity', 0.22],
  ['game-rivers', 'line-width', ['interpolate', ['linear'], ['zoom'], 6, ['+', 0.5, ['*', ['get', 'w'], 1.2]], 10, ['+', 1.4, ['*', ['get', 'w'], 2.6]], 15, ['+', 3, ['*', ['get', 'w'], 6]]]],
  ['game-rivers', 'line-color', '#4FA6E8'],
  ['game-lakes', 'fill-opacity', ['interpolate', ['linear'], ['zoom'], 6, 0.75, 11, 0.25]],
  ['parks-fill', 'fill-opacity', 0.1],
  ['parks-line', 'line-color', '#8BE08F'],
  ['mask', 'fill-opacity', 0.5],
  ['game-river-labels', 'text-color', '#FFFFFF'],
  ['game-river-labels', 'text-halo-color', 'rgba(14,62,104,0.9)'],
  ['parks-label', 'text-color', '#FFFFFF'],
  ['parks-label', 'text-halo-color', 'rgba(20,70,25,0.9)']
];
const HIDE_IN_SAT = ['building'];
const saved = new Map<string, any>();

export function setBasemap(map: MLMap, mode: Basemap) {
  if (!map.getLayer('satellite')) return;
  const sat = mode === 'sat';
  map.setLayoutProperty('satellite', 'visibility', sat ? 'visible' : 'none');
  for (const id of HIDE_IN_SAT) if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', sat ? 'none' : 'visible');
  for (const [id, prop, value] of SAT_PAINT) {
    if (!map.getLayer(id)) continue;
    const key = id + '|' + prop;
    if (!saved.has(key)) saved.set(key, map.getPaintProperty(id, prop as any));
    map.setPaintProperty(id, prop as any, sat ? value : saved.get(key));
  }
}

const STORE_KEY = 'nivis-basemap';
export function loadBasemapChoice(): Basemap { try { return localStorage.getItem(STORE_KEY) === 'sat' ? 'sat' : 'map'; } catch { return 'map'; } }
export function saveBasemapChoice(m: Basemap) { try { localStorage.setItem(STORE_KEY, m); } catch { /* private mode */ } }
