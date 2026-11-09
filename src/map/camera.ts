import type { Map as MLMap, LngLatBoundsLike, PaddingOptions } from 'maplibre-gl';

export const HOME = { center: [19.5, 48.7] as [number, number], zoom: 6.8, pitch: 50, bearing: -10 };
export const BOUNDS: LngLatBoundsLike = [[16.3, 47.4], [23.0, 49.9]];
/** on a narrow portrait screen the visible area at zoom 5 is larger than BOUNDS – maxBounds would block zooming out */
export const BOUNDS_WIDE: LngLatBoundsLike = [[13.5, 45.6], [25.8, 51.6]];
const SK_BBOX: LngLatBoundsLike = [[16.84, 47.73], [22.57, 49.61]];

export const isPortrait = (w = window.innerWidth, h = window.innerHeight) => w < 700 || h > w;
/** a phone in portrait cannot fit Slovakia at zoom 6 → allow zooming out a bit further there */
export const minZoomFor = () => (isPortrait() ? 5 : 6);

/** camera that fits the whole of Slovakia into the free part of the screen (outside HUD and dock) */
export function homeCamera(map: MLMap, pad?: Partial<PaddingOptions>) {
  const padding = { top: 20, bottom: 20, left: 20, right: 20, ...(pad || {}) };
  const c = map.cameraForBounds(SK_BBOX, { padding, bearing: HOME.bearing });
  const zoom = Math.max(map.getMinZoom(), Math.min(HOME.zoom + 0.4, (c?.zoom ?? HOME.zoom) + 0.35)); // + pitch makes the far side smaller
  return { center: (c?.center as [number, number]) || HOME.center, zoom, pitch: HOME.pitch, bearing: HOME.bearing };
}

export function viewAll(map: MLMap, pad?: Partial<PaddingOptions>, duration = 900) {
  map.easeTo({ ...homeCamera(map, pad), duration });
}

export function zoomBy(map: MLMap, dz: number) {
  map.easeTo({ zoom: map.getZoom() + dz, duration: 300 });
}
