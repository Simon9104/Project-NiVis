import * as maplibregl from 'maplibre-gl';
type MLMap = maplibregl.Map;
type StyleSpecification = any;
import 'maplibre-gl/dist/maplibre-gl.css';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import border from '../data/sk-border.json';
import rivers from '../data/rivers.json';
import lakes from '../data/lakes.json';
import { HOME, BOUNDS, minZoomFor } from './camera';
import { addSatelliteLayer } from './basemap';

maplibregl.setWorkerUrl(workerUrl);

export const EXAGGERATION = 1.4;
const MAPTILER_KEY = import.meta.env.VITE_MAPTILER_KEY as string | undefined;

/** raster-dem source: AWS Terrain Tiles (Terrarium, no key) or MapTiler terrain-rgb-v2 with a key from .env */
export function demSource(): any {
  if (MAPTILER_KEY) {
    return { type: 'raster-dem', url: 'https://api.maptiler.com/tiles/terrain-rgb-v2/tiles.json?key=' + MAPTILER_KEY, tileSize: 256 };
  }
  return {
    type: 'raster-dem', encoding: 'terrarium', tileSize: 256, maxzoom: 15,
    tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
    attribution: 'Terén: <a href="https://github.com/tilezen/joerd/blob/master/docs/attribution.md" target="_blank" rel="noopener">Mapzen / AWS Terrain Tiles</a> (SRTM, EU-DEM …)'
  };
}

/** a polygon covering the world with Slovakia cut out – used to fade everything outside SR */
function outsideMask(): GeoJSON.Feature<GeoJSON.Polygon> {
  const ring = (border as any).geometry.coordinates[0] as number[][];
  const world = [[-179, -85], [179, -85], [179, 85], [-179, 85], [-179, -85]];
  return { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [world, ring.slice().reverse()] } };
}

export async function createMap(container: HTMLElement): Promise<MLMap> {
  const style: StyleSpecification = await (await fetch(import.meta.env.BASE_URL + 'style.json')).json();
  const map = new maplibregl.Map({
    container, style,
    center: HOME.center, zoom: HOME.zoom, pitch: HOME.pitch, bearing: HOME.bearing,
    minZoom: minZoomFor(), maxZoom: 16, maxPitch: 75,
    // keep the camera centre over Slovakia (like maxBounds), but let a pitched view see past the border –
    // the default maxBounds constrains the whole viewport, which fights the 50° pitch and narrow phones
    transformConstrain: (ll: maplibregl.LngLat, zoom: number) => {
      const [[w, s], [e, n]] = BOUNDS as [[number, number], [number, number]];
      const minZ = minZoomFor();
      return { center: new maplibregl.LngLat(Math.min(e, Math.max(w, ll.lng)), Math.min(n, Math.max(s, ll.lat))), zoom: Math.min(16, Math.max(minZ, zoom)) };
    },
    attributionControl: false,
    pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
    canvasContextAttributes: { antialias: true },
    dragRotate: true, touchPitch: true, pitchWithRotate: true
  } as maplibregl.MapOptions);
  map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-left');
  // start collapsed (the (i) button opens it) so it does not cover the game UI
  map.once('idle', () => container.querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show'));
  map.touchZoomRotate.enableRotation();
  map.keyboard.enable();

  await new Promise<void>((res) => map.once('load', () => res()));
  addGameLayers(map);
  return map;
}

function firstSymbolLayer(map: MLMap): string | undefined {
  return map.getStyle().layers.find((l) => l.type === 'symbol')?.id;
}

function addGameLayers(map: MLMap) {
  // ---- terrain, hillshade, sky ----
  map.addSource('dem', demSource());
  map.addSource('dem-hs', demSource());
  map.setTerrain({ source: 'dem', exaggeration: EXAGGERATION });
  const beforeLabels = firstSymbolLayer(map);
  map.addLayer({
    id: 'hillshade', type: 'hillshade', source: 'dem-hs',
    paint: { 'hillshade-exaggeration': ['interpolate', ['linear'], ['zoom'], 6, 0.85, 10, 0.6, 14, 0.4], 'hillshade-shadow-color': '#3D4A3A', 'hillshade-highlight-color': '#FFFFFF', 'hillshade-accent-color': '#5A6B4A' }
  }, map.getLayer('building') ? 'building' : beforeLabels);
  addSatelliteLayer(map);
  map.setSky({
    'sky-color': '#7FB3DD', 'horizon-color': '#D9E8F2', 'fog-color': '#E4EEF4',
    'sky-horizon-blend': 0.6, 'horizon-fog-blend': 0.6, 'fog-ground-blend': 0.35, 'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 6, 0.8, 12, 0.2]
  } as any);

  // ---- game water overlay: the rivers/lakes the building rules use, strong at low zoom ----
  map.addSource('game-rivers', { type: 'geojson', data: rivers as any });
  map.addSource('game-lakes', { type: 'geojson', data: lakes as any });
  const fadeOut = (a: number) => ['interpolate', ['linear'], ['zoom'], 6, a, 10, a, 12, 0] as any;
  map.addLayer({ id: 'game-lakes', type: 'fill', source: 'game-lakes', paint: { 'fill-color': '#8EC3E6', 'fill-opacity': fadeOut(1), 'fill-outline-color': '#2B7BB9' } }, beforeLabels);
  map.addLayer({
    id: 'game-rivers-casing', type: 'line', source: 'game-rivers', layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#D8EEFA', 'line-opacity': fadeOut(0.9), 'line-width': ['interpolate', ['linear'], ['zoom'], 6, ['+', 1.6, ['*', ['get', 'w'], 2.4]], 10, ['+', 3.5, ['*', ['get', 'w'], 5]]] }
  }, beforeLabels);
  map.addLayer({
    id: 'game-rivers', type: 'line', source: 'game-rivers', layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#2B7BB9', 'line-opacity': fadeOut(1), 'line-width': ['interpolate', ['linear'], ['zoom'], 6, ['+', 0.6, ['*', ['get', 'w'], 1.6]], 10, ['+', 1.8, ['*', ['get', 'w'], 3.6]]] }
  }, beforeLabels);

  // ---- outside Slovakia: faded + border ----
  map.addSource('mask', { type: 'geojson', data: outsideMask() });
  map.addSource('border', { type: 'geojson', data: border as any });
  map.addLayer({ id: 'mask', type: 'fill', source: 'mask', paint: { 'fill-color': '#EEF1F3', 'fill-opacity': 0.55 } }, beforeLabels);
  map.addLayer({ id: 'border-halo', type: 'line', source: 'border', paint: { 'line-color': '#FFFFFF', 'line-width': ['interpolate', ['linear'], ['zoom'], 6, 5, 12, 9], 'line-opacity': 0.85 } }, beforeLabels);
  map.addLayer({ id: 'border', type: 'line', source: 'border', paint: { 'line-color': '#6B7F8C', 'line-width': ['interpolate', ['linear'], ['zoom'], 6, 1.6, 12, 3], 'line-dasharray': [3, 1.5] } }, beforeLabels);

  // river names (Slovak, italic, along the river) for the game rivers at low zoom
  map.addLayer({
    id: 'game-river-labels', type: 'symbol', source: 'game-rivers', minzoom: 7, maxzoom: 11,
    filter: ['>=', ['get', 'w'], 0.28],
    layout: { 'symbol-placement': 'line', 'text-field': ['get', 'name'], 'text-font': ['Noto Sans Italic'], 'text-size': ['interpolate', ['linear'], ['zoom'], 7, ['+', 10, ['*', ['get', 'w'], 2.5]], 10, ['+', 12, ['*', ['get', 'w'], 3]]], 'text-letter-spacing': 0.1, 'symbol-spacing': 320, 'text-max-angle': 35 },
    paint: { 'text-color': '#0E4F86', 'text-halo-color': 'rgba(255,255,255,0.92)', 'text-halo-width': 1.6 }
  });
}
