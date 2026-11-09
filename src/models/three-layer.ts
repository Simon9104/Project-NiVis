/**
 * One MapLibre custom layer (renderingMode 3d) with a shared Three.js renderer that draws every power plant,
 * the drag ghost, construction scaffolding, smoke/steam and outage blinking.
 * Based on the official MapLibre example "Add a 3D model with three.js".
 *
 * Scene frame: X = east (m), Y = up (m), Z = south (m) around ORIGIN; one model unit = unitMeters(zoom).
 */
import * as THREE from 'three';
import * as maplibregl from 'maplibre-gl';
import type { Plant } from '../sim/sim';
import type { PlantType } from '../sim/constants';
import { elevation } from '../rules/dem';
import { EXAGGERATION } from '../map/map';
import { animatePuffs, buildModel, makeAlarm, makeGhost, makePuffs, setConstruction, setGhostOk, type ModelData, type Puff } from './models';

const ORIGIN_LL: [number, number] = [19.5, 48.7];
/** metres per model unit at zoom ≥ 11 */
export const BASE_UNIT_M = 165;
/** models are "game sized": constant screen size below zoom 11, closer to real size when zoomed in */
export const unitMeters = (zoom: number) => BASE_UNIT_M * Math.min(40, Math.max(0.5, Math.pow(2, 11 - zoom)));

interface Visual { plant: Plant; root: THREE.Group; puffs: Puff[]; alarm: THREE.Mesh; key: string; elev: number; elevAge: number; building: boolean }

export class PlantLayer implements maplibregl.CustomLayerInterface {
  id = 'plants-3d';
  type = 'custom' as const;
  renderingMode = '3d' as const;
  private map!: maplibregl.Map;
  private renderer!: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.Camera();
  private world = new THREE.Group();
  private origin = maplibregl.MercatorCoordinate.fromLngLat(ORIGIN_LL, 0);
  private s = this.origin.meterInMercatorCoordinateUnits();
  private visuals = new Map<string, Visual>();
  private ghosts: Partial<Record<PlantType, THREE.Group>> = {};
  private ghost: { type: PlantType; lngLat: [number, number]; dir?: [number, number] } | null = null;
  private last = performance.now();
  private blink = 0;
  /** game state the layer needs each frame */
  getPlants: () => Plant[] = () => [];
  isRunning: () => boolean = () => false;

  onAdd(map: maplibregl.Map, gl: WebGLRenderingContext | WebGL2RenderingContext) {
    this.map = map;
    this.renderer = new THREE.WebGLRenderer({ canvas: map.getCanvas(), context: gl as WebGL2RenderingContext, antialias: true });
    this.renderer.autoClear = false;
    this.scene.add(this.world);
    this.scene.add(new THREE.HemisphereLight('#D6E8FF', '#55633A', 1.4));
    const sun = new THREE.DirectionalLight('#FFF0DA', 2.2); sun.position.set(-0.55, 1, 0.35); this.scene.add(sun);
    this.scene.add(new THREE.AmbientLight('#FFFFFF', 0.35));
  }
  onRemove() { this.renderer?.dispose(); }

  private toWorld(ll: [number, number], elev: number) {
    const m = maplibregl.MercatorCoordinate.fromLngLat(ll, 0);
    return new THREE.Vector3((m.x - this.origin.x) / this.s, elev, (m.y - this.origin.y) / this.s);
  }
  private groundElev(ll: [number, number]) {
    const e = this.map.queryTerrainElevation(ll);
    return e ?? elevation(ll[0], ll[1]) * EXAGGERATION;
  }
  private place(root: THREE.Object3D, type: PlantType, ll: [number, number], dir: [number, number] | undefined, elev: number) {
    root.position.copy(this.toWorld(ll, elev + (type === 'hydro' ? 2 : 0)));
    root.rotation.y = type === 'hydro' && dir ? Math.atan2(dir[1], dir[0]) : 0;
  }

  /** create / remove / move plant visuals to match the game */
  sync() {
    const plants = this.getPlants();
    const seen = new Set<string>();
    for (const p of plants) {
      seen.add(p.id);
      let v = this.visuals.get(p.id);
      const key = p.lngLat.join(',') + (p.dir ? p.dir.join(',') : '');
      if (!v) {
        const root = buildModel(p.type);
        const alarm = makeAlarm((root.userData as ModelData).r); root.add(alarm);
        const puffs = makePuffs(root);
        v = { plant: p, root, puffs, alarm, key: '', elev: 0, elevAge: 1e9, building: false };
        this.visuals.set(p.id, v); this.world.add(root);
      }
      if (v.key !== key) { v.key = key; v.elev = this.groundElev(p.lngLat); v.elevAge = 0; this.place(v.root, p.type, p.lngLat, p.dir, v.elev); }
    }
    for (const [id, v] of this.visuals) if (!seen.has(id)) { this.world.remove(v.root); this.visuals.delete(id); }
    this.map?.triggerRepaint();
  }
  setHidden(id: string | null) { for (const [pid, v] of this.visuals) v.root.visible = pid !== id; this.map?.triggerRepaint(); }

  setGhost(g: { type: PlantType; lngLat: [number, number]; dir?: [number, number]; ok: boolean } | null) {
    for (const gh of Object.values(this.ghosts)) if (gh) gh.visible = false;
    this.ghost = g;
    if (g) {
      let gh = this.ghosts[g.type];
      if (!gh) { gh = makeGhost(g.type); this.ghosts[g.type] = gh; this.world.add(gh); }
      setGhostOk(g.ok);
      this.place(gh, g.type, g.lngLat, g.dir, this.groundElev(g.lngLat));
      gh.visible = true;
    }
    this.map?.triggerRepaint();
  }

  /** model footprint radius on screen (px) – used for picking */
  pickRadiusPx(p: Plant) {
    const v = this.visuals.get(p.id); const r = v ? (v.root.userData as ModelData).r : 4;
    const z = this.map.getZoom(); const mpp = 78271.517 * Math.cos(p.lngLat[1] * Math.PI / 180) / Math.pow(2, z);
    return Math.max(14, r * unitMeters(z) / mpp * 0.8);
  }

  render(_gl: WebGLRenderingContext | WebGL2RenderingContext, args: any) {
    const now = performance.now(); const dt = Math.min(0.05, (now - this.last) / 1000); this.last = now;
    const running = this.isRunning();
    const zoom = this.map.getZoom(); const u = unitMeters(zoom);
    this.blink += dt;
    const blinkOn = Math.floor(this.blink * 2.5) % 2 === 0;
    let animating = running || !!this.ghost;
    for (const v of this.visuals.values()) {
      const p = v.plant;
      // terrain tiles arrive asynchronously → refresh the ground height for a while
      if (v.elevAge < 240) { v.elevAge++; if (v.elevAge % 20 === 0) { const e = this.groundElev(p.lngLat); if (Math.abs(e - v.elev) > 0.5) { v.elev = e; this.place(v.root, p.type, p.lngLat, p.dir, e); } } animating = true; }
      const building = p.build > 0;
      if (building !== v.building) { v.building = building; setConstruction(v.root, building); }
      const prog = building ? 0.35 + 0.65 * (1 - p.build / Math.max(1, p.buildTotal)) : 1;
      v.root.scale.set(u, u * prog, u);
      const ud = v.root.userData as ModelData;
      if (p.type === 'wind' && ud.rotors.length) {
        const cf = p.mw ? (p.cur || 0) / p.mw : 0; const sp = building ? 0 : running ? 0.3 + 3.5 * cf : 0.25 * cf;
        ud.rotors.forEach((r) => { r.rotation.x += dt * sp; });
      }
      animatePuffs(v.puffs, dt, !building && (p.cur || 0) > 1);
      const off = !building && p.units.some((x) => x.out > 0);
      v.alarm.visible = off && blinkOn;
      if (off) animating = true;
    }
    for (const gh of Object.values(this.ghosts)) {
      if (!gh || !gh.visible) continue;
      gh.scale.setScalar(u);
      (gh.userData as ModelData).rotors.forEach((r) => { r.rotation.x += dt * 1.6; });
    }
    const m = new THREE.Matrix4().fromArray(args.defaultProjectionData.mainMatrix);
    const s = this.s;
    const l = new THREE.Matrix4().set(s, 0, 0, this.origin.x, 0, 0, s, this.origin.y, 0, s, 0, 0, 0, 0, 0, 1);
    this.camera.projectionMatrix = m.multiply(l);
    this.renderer.resetState();
    this.renderer.render(this.scene, this.camera);
    if (animating) this.map.triggerRepaint();
  }
}
