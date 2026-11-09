// Game overlay layers: national parks, plant pick circles (invisible) and labels for the real plants.
import type { Map as MLMap, GeoJSONSource } from 'maplibre-gl';
import parks from '../data/protected.json';
import type { Plant } from '../sim/sim';
import { unitMeters } from '../models/three-layer';

/** model footprint radius in model units (ModelData.r) */
const R: Record<string, number> = { wind: 3.4, hydro: 3.4, nuclear: 5.2, battery: 3.2, pumped: 4.6, solar: 4.0, coal: 4.2 };

export function addOverlayLayers(map: MLMap) {
  const beforeLabels = map.getStyle().layers.find((l) => l.type === 'symbol')?.id;
  map.addSource('parks', { type: 'geojson', data: parks as any });
  map.addLayer({ id: 'parks-fill', type: 'fill', source: 'parks', paint: { 'fill-color': '#2E7D32', 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 6, 0.16, 12, 0.06] } }, beforeLabels);
  map.addLayer({ id: 'parks-line', type: 'line', source: 'parks', paint: { 'line-color': '#2E7D32', 'line-width': 1.4, 'line-dasharray': [2, 1.5], 'line-opacity': 0.8 } }, beforeLabels);
  map.addLayer({
    id: 'parks-label', type: 'symbol', source: 'parks', minzoom: 7.5, maxzoom: 12,
    layout: { 'text-field': ['get', 'name'], 'text-font': ['Noto Sans Italic'], 'text-size': 11, 'symbol-placement': 'point', 'text-max-width': 9 },
    paint: { 'text-color': '#1F5F24', 'text-halo-color': 'rgba(255,255,255,0.85)', 'text-halo-width': 1.4 }
  });

  map.addSource('plants', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  map.addLayer({ id: 'plants-pick', type: 'circle', source: 'plants', paint: { 'circle-radius': 20, 'circle-color': '#000000', 'circle-opacity': 0.001, 'circle-pitch-alignment': 'map' } });
  map.addLayer({
    id: 'plants-label', type: 'symbol', source: 'plants', filter: ['==', ['get', 'locked'], true],
    layout: { 'text-field': ['get', 'name'], 'text-font': ['Noto Sans Bold'], 'text-size': 12, 'text-offset': [0, -3.2], 'text-anchor': 'bottom', 'text-allow-overlap': true },
    paint: { 'text-color': '#FFE7A8', 'text-halo-color': 'rgba(60,40,10,0.85)', 'text-halo-width': 2 }
  });
  const updateRadius = () => {
    const z = map.getZoom(); const mpp = 78271.517 * Math.cos(48.7 * Math.PI / 180) / Math.pow(2, z);
    const k = unitMeters(z) / mpp * 0.8;
    map.setPaintProperty('plants-pick', 'circle-radius', ['max', 14, ['*', ['get', 'r'], k]]);
  };
  map.on('zoom', updateRadius); updateRadius();
}

export function setPlantFeatures(map: MLMap, plants: Plant[]) {
  const src = map.getSource('plants') as GeoJSONSource | undefined;
  src?.setData({
    type: 'FeatureCollection',
    features: plants.map((p) => ({ type: 'Feature', id: p.id, properties: { id: p.id, type: p.type, name: p.name, locked: p.locked, r: R[p.type] || 4 }, geometry: { type: 'Point', coordinates: p.lngLat } }))
  });
}
