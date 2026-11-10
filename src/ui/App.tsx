// Main game component: owns the simulation, the map and the interaction (port of Component's
// startNew / onCanvasDown / beginMove / onPointerMove / onPointerUp / frame / onModalAction).
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Map as MLMap } from 'maplibre-gl';
import { createMap } from '../map/map';
import { homeCamera, isPortrait, viewAll, zoomBy } from '../map/camera';
import { addOverlayLayers, setPlantFeatures } from '../map/layers';
import { loadBasemapChoice, saveBasemapChoice, setBasemap, type Basemap } from '../map/basemap';
import { PlantLayer } from '../models/three-layer';
import { Game, type Plant } from '../sim/sim';
import { hudData, plantInfo, type Hud as HudData, type PlantInfo, type Report } from '../sim/report';
import { ITEM_BY, INTRO_STEPS, YEAR_SECONDS, fmtMoney, type PlantType } from '../sim/constants';
import { evaluate, nearestRiver, type Evaluation, type LngLat } from '../rules/evaluate';
import { loadDem } from '../rules/dem';
import { Hud } from './Hud';
import { Dock } from './Dock';
import { InfoCard } from './InfoCard';
import { Legend } from './Legend';
import { Intro } from './Intro';
import { YearReport } from './YearReport';
import { Music } from './music';

interface Tip { x: number; y: number; title: string; sub: string; bg: string }
interface Drag { type: PlantType; mode: 'new' | 'press' | 'move'; plant?: Plant; sx?: number; sy?: number; ev?: Evaluation | null }
type ModalKind = 'intro' | 'year' | null;

export function App() {
  const rootRef = useRef<HTMLDivElement>(null);
  const mapEl = useRef<HTMLDivElement>(null);
  const dockRef = useRef<HTMLElement>(null);
  const hudRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const layerRef = useRef<PlantLayer | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const selRef = useRef<Plant | null>(null);
  const toastTimer = useRef<number>(0);

  const [loading, setLoading] = useState(true);
  const [loadText, setLoadText] = useState('Načítavam mapu Slovenska…');
  const [hud, setHud] = useState<HudData | null>(null);
  const [running, setRunning] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [modal, setModal] = useState<ModalKind>('intro');
  const [introStep, setIntroStep] = useState(0);
  const [report, setReport] = useState<Report | null>(null);
  const [quizPicks, setQuizPicks] = useState<Record<number, number>>({});
  const [toast, setToast] = useState<string | null>(null);
  const [tip, setTip] = useState<Tip | null>(null);
  const [moving, setMoving] = useState(false);
  const [legendOpen, setLegendOpen] = useState(false);
  const [sel, setSel] = useState<PlantInfo | null>(null);
  const musicRef = useRef<Music | null>(null);
  if (!musicRef.current) musicRef.current = new Music();
  const [, setMusicTick] = useState(0);
  useEffect(() => { const m = musicRef.current!; m.onChange = () => setMusicTick((t) => t + 1); m.init(); (window as any).__music = m; }, []);
  const [basemap, setBasemapState] = useState<Basemap>(loadBasemapChoice);
  const switchBasemap = (m: Basemap) => { setBasemapState(m); saveBasemapChoice(m); if (mapRef.current) setBasemap(mapRef.current, m); };

  // state mirrored into refs for the animation loop / window listeners
  const st = useRef({ running, speed, modal });
  st.current = { running, speed, modal };

  const showToast = (text: string, ms?: number) => { clearTimeout(toastTimer.current); setToast(text); toastTimer.current = window.setTimeout(() => setToast(null), ms || 3200); };

  const gameRef = useRef<Game | null>(null);
  if (!gameRef.current) {
    gameRef.current = new Game({
      hooks: {
        toast: (t, ms) => showToast(t, ms),
        riverDistKm: (p) => nearestRiver(p.lngLat).d,
        onYearEnd: (r) => { setRunning(false); setReport(r); setQuizPicks({}); setModal('year'); }
      }
    });
  }
  const game = gameRef.current;

  const refresh = () => {
    setHud(hudData(game));
    if (selRef.current) { if (game.plants.includes(selRef.current)) setSel(plantInfo(game, selRef.current)); else { selRef.current = null; setSel(null); } }
  };
  const syncPlants = () => { layerRef.current?.sync(); if (mapRef.current) setPlantFeatures(mapRef.current, game.plants); };

  /** free part of the screen (outside HUD and dock) for "celé Slovensko" */
  const viewPadding = () => {
    const W = window.innerWidth, H = window.innerHeight;
    const dock = dockRef.current?.getBoundingClientRect(); const hudR = hudRef.current?.querySelector('.nv-hud')?.getBoundingClientRect();
    if (isPortrait()) return { top: Math.min(H * 0.45, (hudR?.bottom ?? 0) + 6), bottom: dock ? H - dock.top + 6 : 20, left: 8, right: 8 };
    return { top: Math.min(H * 0.45, (hudR?.bottom ?? 0) * 0.8), bottom: 30, left: 16, right: dock ? W - dock.left + 12 : 20 };
  };

  // ---------- map + layers ----------
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [map] = await Promise.all([createMap(mapEl.current!), loadDem(import.meta.env.BASE_URL + 'dem-sk.bin')]);
        if (!alive) return;
        mapRef.current = map; (window as any).__map = map; (window as any).__game = game;
        addOverlayLayers(map);
        const layer = new PlantLayer();
        layer.getPlants = () => game.plants;
        layer.isRunning = () => st.current.running && !st.current.modal;
        map.addLayer(layer, 'plants-label');
        layerRef.current = layer;
        setBasemap(map, loadBasemapChoice());
        game.newGame();
        syncPlants(); refresh();
        setLoading(false);
        // fit Slovakia once the HUD and dock are laid out
        setTimeout(() => map.jumpTo(homeCamera(map, viewPadding())), 60);
        (window as any).__ready = true;
      } catch (err) {
        console.error('Nivis init failed', err);
        setLoadText('Nepodarilo sa načítať mapové podklady. Skontroluj pripojenie na internet.');
      }
    })();
    return () => { alive = false; };
  }, []);

  // ---------- game loop: one year = YEAR_SECONDS real seconds at 1× ----------
  useEffect(() => {
    let raf = 0, last = performance.now(), acc = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      const s = st.current;
      if (!game.sim || !s.running || s.modal || game.sim.yearDone || dragRef.current) return;
      const dayLen = YEAR_SECONDS / 365;
      acc += dt * (s.speed || 1);
      let n = 0, built = false;
      while (acc >= dayLen && n < 6 && !game.sim.yearDone) {
        acc -= dayLen;
        const before = game.plants.filter((p) => p.build > 0).length;
        game.stepDay(false); n++;
        if (game.plants.filter((p) => p.build > 0).length !== before) built = true;
      }
      if (n) { refresh(); if (built) syncPlants(); mapRef.current?.triggerRepaint(); }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  // ---------- interaction ----------
  const local = (x: number, y: number) => { const r = rootRef.current!.getBoundingClientRect(); return { x: x - r.left, y: y - r.top }; };
  const overDock = (x: number, y: number) => { const r = dockRef.current?.getBoundingClientRect(); return !!r && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom; };
  const groundAt = (x: number, y: number): LngLat | null => {
    const map = mapRef.current; if (!map) return null;
    const r = map.getContainer().getBoundingClientRect();
    if (x < r.left || y < r.top || x > r.right || y > r.bottom) return null;
    const ll = map.unproject([x - r.left, y - r.top]);
    return ll ? [ll.lng, ll.lat] : null;
  };

  const startNew = (type: PlantType, e: PointerEvent) => {
    if (!mapRef.current || st.current.modal) return;
    e.preventDefault();
    dragRef.current = { type, mode: 'new' };
    onMove(e);
  };

  const onMove = (e: PointerEvent) => {
    const dg = dragRef.current; const layer = layerRef.current; if (!dg || !layer) return;
    if (dg.mode === 'press') {
      if (Math.hypot(e.clientX - dg.sx!, e.clientY - dg.sy!) < 6) return;
      if (dg.plant!.locked) { const L0 = local(e.clientX, e.clientY); setTip({ x: L0.x, y: L0.y - 20, title: dg.plant!.name, sub: 'Skutočnú elektráreň nemožno presunúť', bg: 'rgba(30,43,51,0.94)' }); return; }
      dg.mode = 'move'; layer.setHidden(dg.plant!.id); setMoving(true);
    }
    const L = local(e.clientX, e.clientY);
    if (overDock(e.clientX, e.clientY)) {
      layer.setGhost(null); dg.ev = null;
      setTip(dg.mode === 'move' ? { x: L.x, y: L.y - 14, title: 'Zbúrať stavbu', sub: 'Vrátime ' + fmtMoney(game.refundFor(dg.plant!)), bg: '#A33A22' } : null);
      return;
    }
    const ll = groundAt(e.clientX, e.clientY);
    if (!ll) { layer.setGhost(null); dg.ev = null; setTip(null); return; }
    const ev = evaluate(dg.type, ll, dg.mode === 'move' ? dg.plant! : null, { plants: game.plants, money: game.sim ? game.sim.money : null });
    dg.ev = ev;
    layer.setGhost({ type: dg.type, lngLat: ev.ok ? ev.lngLat : ll, dir: ev.ok ? ev.dir : undefined, ok: ev.ok });
    const name = ITEM_BY[dg.type].name;
    setTip({ x: L.x, y: L.y - 26, title: ev.ok ? name : 'Tu sa nedá stavať', sub: ev.ok ? ev.sub : ev.why, bg: ev.ok ? 'rgba(20,90,50,0.94)' : 'rgba(163,58,34,0.94)' });
  };

  const onUp = (e: PointerEvent) => {
    const dg = dragRef.current; const layer = layerRef.current; if (!dg || !layer) return;
    dragRef.current = null;
    if (dg.mode === 'press') { selRef.current = dg.plant!; setTip(null); setSel(plantInfo(game, dg.plant!)); return; }
    layer.setGhost(null);
    const it = ITEM_BY[dg.type];
    const dock = overDock(e.clientX, e.clientY);
    const s = game.sim;
    if (dg.mode === 'move') {
      const pl = dg.plant!;
      if (dock) {
        const back = game.demolish(pl);
        if (selRef.current === pl) { selRef.current = null; setSel(null); }
        setTip(null); setMoving(false); layer.setHidden(null); syncPlants();
        showToast('Zbúrané · vrátených ' + fmtMoney(back)); refresh(); return;
      }
      if (dg.ev && dg.ev.ok) {
        game.move(pl, dg.ev.lngLat, dg.ev.cost, { dir: dg.ev.dir, loc: dg.ev.loc });
        showToast(pl.name + ' presunutá' + (dg.ev.cost ? ' za ' + fmtMoney(dg.ev.cost) : ''));
      }
      layer.setHidden(null); setTip(null); setMoving(false); syncPlants(); refresh(); return;
    }
    setTip(null);
    if (dock || !dg.ev) return;
    if (!dg.ev.ok) { showToast(dg.ev.why); return; }
    game.buy(dg.type, dg.ev.lngLat, { dir: dg.ev.dir, loc: dg.ev.loc });
    void s;
    showToast('Výstavba začala: ' + it.name + (dg.ev.river ? ' na rieke ' + dg.ev.river : '') + ' · hotová o ' + it.build + ' dní');
    syncPlants(); refresh();
  };

  /** press on a plant (capture phase, before MapLibre starts panning) */
  const onMapDown = (e: PointerEvent) => {
    const map = mapRef.current; if (!map || e.button !== 0 || dragRef.current || st.current.modal) return;
    const r = map.getContainer().getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    if (x < 0 || y < 0 || x > r.width || y > r.height) return;
    if (!(e.target as HTMLElement).closest?.('.maplibregl-canvas-container')) return;
    const hits = map.queryRenderedFeatures([[x - 4, y - 4], [x + 4, y + 4]], { layers: ['plants-pick'] });
    if (!hits.length) return;
    // nearest hit
    let best: Plant | null = null, bd = 1e9;
    for (const h of hits) { const p = game.plants.find((q) => q.id === h.properties.id); if (!p) continue; const pt = map.project(p.lngLat); const d = Math.hypot(pt.x - x, pt.y - y); if (d < bd) { bd = d; best = p; } }
    if (!best) return;
    e.stopPropagation(); e.preventDefault();
    dragRef.current = { type: best.type, mode: 'press', plant: best, sx: e.clientX, sy: e.clientY };
  };

  useEffect(() => {
    const root = rootRef.current!;
    const mv = (e: PointerEvent) => onMove(e);
    const up = (e: PointerEvent) => onUp(e);
    const down = (e: PointerEvent) => onMapDown(e);
    const stopTouch = (e: TouchEvent) => { if (dragRef.current) e.stopPropagation(); };
    const stopMouse = (e: MouseEvent) => { if (dragRef.current && dragRef.current.mode !== 'new') e.stopPropagation(); };
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    root.addEventListener('pointerdown', down, true);
    root.addEventListener('touchstart', stopTouch, true);
    root.addEventListener('mousedown', stopMouse, true);
    return () => {
      window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up);
      root.removeEventListener('pointerdown', down, true); root.removeEventListener('touchstart', stopTouch, true); root.removeEventListener('mousedown', stopMouse, true);
    };
  }, []);

  // ---------- modal actions (onModalAction) ----------
  const modalAction = () => {
    if (modal === 'intro') { if (introStep < INTRO_STEPS.length - 1) setIntroStep(introStep + 1); else { setModal(null); setRunning(true); setIntroStep(0); } return; }
    if (modal === 'year' && report) {
      if (report.final) {
        game.reset(); selRef.current = null; setSel(null); syncPlants();
        setReport(null); setModal(null); setRunning(true); refresh(); return;
      }
      game.nextYear(); setReport(null); setModal(null); setRunning(true); refresh();
    }
  };

  const togglePlay = () => { if (!game.sim || modal) return; setRunning(!running); };
  const money = hud ? hud.money : 0;
  const map = mapRef.current;

  return (
    <div ref={rootRef} class="nv-root nv-auto">
      <div ref={mapEl} class="nv-map" aria-label="Interaktívna 3D mapa Slovenska" />
      <div ref={hudRef}>
        <Hud h={hud} running={running} speed={speed} toast={toast} onTogglePlay={togglePlay} onSpeed={setSpeed} />
      </div>
      <div class="nv-tools">
        <button class="nv-toolbtn" aria-label="Legenda mapy" aria-expanded={legendOpen} onClick={() => setLegendOpen(!legendOpen)}><svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h16M4 12h16M4 18h10"></path></svg></button>
        <button class="nv-toolbtn" data-testid="basemap" title={basemap === 'sat' ? 'Bežná mapa' : 'Satelitná mapa'} style={basemap === 'sat' ? 'background: #1E2B33; color: #FFFFFF' : ''} aria-label={basemap === 'sat' ? 'Zobraziť bežnú mapu' : 'Zobraziť satelitnú mapu'} aria-pressed={basemap === 'sat'} onClick={() => switchBasemap(basemap === 'sat' ? 'map' : 'sat')}>
          <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3 9 5-9 5-9-5 9-5Z"></path><path d="m3 13 9 5 9-5"></path></svg>
        </button>
        <button class="nv-toolbtn" aria-label="Priblížiť" onClick={() => map && zoomBy(map, 0.7)}><svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"></path></svg></button>
        <button class="nv-toolbtn" aria-label="Oddialiť" onClick={() => map && zoomBy(map, -0.7)}><svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M5 12h14"></path></svg></button>
        <button class="nv-toolbtn" aria-label="Zobraziť celé Slovensko" onClick={() => map && viewAll(map, viewPadding())}><svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7l6-3 6 3 6-3v13l-6 3-6-3-6 3z"></path><path d="M9 4v13M15 7v13"></path></svg></button>
      </div>
      {legendOpen && <Legend />}
      {sel ? <InfoCard info={sel} onClose={() => { selRef.current = null; setSel(null); }} />
        : <div class="nv-hint" style="background: rgba(30,43,51,0.72); color: #FFFFFF; border-radius: 999px; padding: 6px 12px; font-size: 11px; font-weight: 700; pointer-events: none">{isPortrait() ? 'Ťahaj = posun · 2 prsty = otáčanie · ťukni na elektráreň = detail' : 'Ťahaj = posun · pravé tlačidlo = otáčanie · klik na elektráreň = detail'}</div>}
      {tip && (
        <div class="nv-tip" data-testid="tip" style={`left: ${tip.x}px; top: ${tip.y}px; background: ${tip.bg}`}>
          <span style="font-size: 13px; font-weight: 800">{tip.title}</span>
          <span style="font-size: 11px; font-weight: 700; opacity: 0.92">{tip.sub}</span>
        </div>
      )}
      <Dock money={money} moving={moving} dockRef={dockRef} onStart={startNew} music={musicRef.current!.available ? { on: musicRef.current!.enabled, toggle: () => musicRef.current!.toggle() } : null} />
      {!loading && modal === 'intro' && <Intro step={introStep} onNext={modalAction} onBack={() => setIntroStep(Math.max(0, introStep - 1))} onSkip={() => { setModal(null); setRunning(true); setIntroStep(0); }} />}
      {!loading && modal === 'year' && report && <YearReport rep={report} picks={quizPicks} onPick={(q, o) => setQuizPicks({ ...quizPicks, [q]: o })} onAction={modalAction} />}
      {loading && (
        <div style="position: absolute; left: 0; top: 0; right: 0; bottom: 0; background: #A9CBE3; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; z-index: 30">
          <span style="font-family: 'Fredoka', sans-serif; font-weight: 600; font-size: 34px; color: #1E2B33">Nivis</span>
          <span style="font-size: 14px; font-weight: 700; color: #33444D; text-align: center; padding: 0 20px">{loadText}</span>
        </div>
      )}
    </div>
  );
}
