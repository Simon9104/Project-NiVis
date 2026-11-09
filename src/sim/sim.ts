// Daily energy simulation – a faithful port of the Component simulation methods in reference/Main.dc.html
// (newGame, startYear, scheduleOutages, stepDay, startEvent, endYear, removePlant …).
// Pure logic: no DOM, no map. The map/UI layer reads `plants`, `sim` and `report`.
import { ITEM_BY, MDAYS, MONTH_PRICE, DEM_SHAPE, PRICE_SHAPE, SLOT_LABELS, STARTER, type GenKey, type PlantType } from './constants';
import { EVENT_DEFS, type EventDef } from './events';
import { buildReport, type Report } from './report';

export interface Unit { cap: number; out: number; why: string; plan?: number; planLen?: number }
export interface Plant {
  id: string; type: PlantType; name: string; lngLat: [number, number];
  /** downstream direction for hydro dams (unit vector east/north) */
  dir?: [number, number];
  units: Unit[]; mw: number; build: number; buildTotal: number; ytd: number; cur: number; loc: number; locked: boolean;
  avail?: number; soc?: number; chgToday?: number; disToday?: number; cfScale?: number;
}
type Gen = Record<GenKey, number>;
export interface Slot { dem: number; price: number; out: Gen; chg: number; dis: number; imp: number; exp: number; uns: number; curt: number }
export interface YearAcc {
  gen: Gen; months: { gen: Gen; demand: number; imp: number; dis: number; emis: number; days: number }[];
  slots: { out: Gen; dem: number; imp: number; dis: number; chg: number; price: number }[];
  dis: number; chg: number; demand: number; imp: number; exp: number; unserved: number; curt: number; sales: number; bonus: number; fuel: number;
  co2cost: number; om: number; impCost: number; loan: number; tax: number; interest: number; capex: number; arr: number; dep: number; refunds: number;
  emis: number; priceSum: number; cleanSum: number; blackoutDays: number; popStart: number; moneyStart: number; days: number; events: string[];
}
export interface Today {
  T: number; cloud: number; w: number; flow: number; price: number; demand: number; gen: number; out: Gen; imp: number; exp: number; unserved: number;
  curt: number; dis: number; chg: number; clean: number; mult: number; intensity: number; net: number; storm: boolean; emisT: number; slot: Slot[];
}
export interface SimState {
  year: number; yearIdx: number; day: number; acc: number; money: number; pop: number; perCap: number;
  Tanom: number; cloud: number; lw: number; fa: number; gas: number; co2: number; gasT: number; co2T: number;
  cleanAvg: number; co2Avg: number; todayArr: number; todayDep: number; price: number; prevPrice: number;
  events: { id: string; name: string; left: number; bg: string }[]; history: number[]; today: Today | null; y: YearAcc;
  yearDone?: boolean; reports?: { year: number; total: number; ekon: number; eko: number; spol: number; ludia: number; opProfit: number; intensity: number; clean: number; popCh: number; grade: string }[];
}

export interface GameHooks {
  /** short message for the player (toast) */
  toast?: (text: string, ms?: number) => void;
  /** distance (km) from a plant to the nearest river – used by the flood event */
  riverDistKm?: (p: Plant) => number;
  /** called when a plant's construction finishes */
  onBuilt?: (p: Plant) => void;
  /** called when the year ends (report is ready) */
  onYearEnd?: (r: Report) => void;
}

const z6 = (): Gen => ({ nuclear: 0, hydro: 0, wind: 0, solar: 0, coal: 0, gas: 0 });
const KEYS: GenKey[] = ['nuclear', 'hydro', 'wind', 'solar', 'coal', 'gas'];

export function dateOf(d: number) { let m = 0, dd = d; while (m < 11 && dd >= MDAYS[m]) { dd -= MDAYS[m]; m++; } return { m, dd: dd + 1 }; }
export function bonusMult(c: number) { return c >= 0.95 ? 1.2 : c >= 0.9 ? 1.15 : c >= 0.8 ? 1.1 : c >= 0.65 ? 1.05 : c >= 0.5 ? 1.0 : 0.95; }

export class Game {
  plants: Plant[] = [];
  /** plants that are simulated but not shown (kept for parity with the reference) */
  hidden: Plant[] = [];
  sim!: SimState;
  report: Report | null = null;
  rng: () => number;
  hooks: GameHooks;

  constructor(opts: { rng?: () => number; hooks?: GameHooks } = {}) {
    this.rng = opts.rng || Math.random;
    this.hooks = opts.hooks || {};
  }

  private toast(text: string, ms?: number) { this.hooks.toast?.(text, ms); }
  gauss() { let u = 0, v = 0; while (u === 0) u = this.rng(); while (v === 0) v = this.rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
  hasEv(id: string) { return this.sim.events.some((e) => e.id === id); }

  /** creates a plant record (does not add it) */
  makePlant(type: PlantType, lngLat: [number, number], o: { units?: number[]; build?: number; locked?: boolean; name?: string; loc?: number; dir?: [number, number] } = {}): Plant {
    const it = ITEM_BY[type];
    const caps = o.units || [it.mw];
    return {
      id: Math.random().toString(36).slice(2), type, lngLat, dir: o.dir, locked: !!o.locked, name: o.name || it.name,
      units: caps.map((cap) => ({ cap, out: 0, why: '' })), mw: caps.reduce((s, v) => s + v, 0),
      build: o.build || 0, buildTotal: o.build || 0, ytd: 0, cur: 0, loc: o.loc ?? 1
    };
  }
  /** adds a plant (like Component.addPlant: outages are scheduled when a game is running) */
  addPlant(type: PlantType, lngLat: [number, number], o: Parameters<Game['makePlant']>[2] = {}): Plant {
    const p = this.makePlant(type, lngLat, o);
    this.plants.push(p);
    if (this.sim) this.scheduleOutages(p);
    return p;
  }
  removePlant(p: Plant) { const i = this.plants.indexOf(p); if (i >= 0) this.plants.splice(i, 1); }
  addStarter() {
    // the player starts with a single real plant: Jaslovské Bohunice V2 nuclear power station (2 x 505 MW); everything else is imported
    return this.addPlant('nuclear', STARTER.lngLat, { locked: true, name: STARTER.name, units: STARTER.units });
  }

  newGame() {
    if (!this.plants.length) this.addStarter();
    this.sim = {
      year: 2027, yearIdx: 0, day: 0, acc: 0,
      money: 3.0e9, pop: 5420000, perCap: 4.72,
      Tanom: 0, cloud: 0.7, lw: 0, fa: 0, gas: 36, co2: 77, gasT: 36, co2T: 77,
      cleanAvg: 0.8, co2Avg: 130, todayArr: 0, todayDep: 0, price: 104, prevPrice: 104, events: [], history: [],
      today: null, y: null as unknown as YearAcc
    };
    this.report = null;
    this.startYear();
    this.stepDay(true);
  }
  startYear() {
    const s = this.sim;
    s.y = {
      gen: z6(), months: MDAYS.map(() => ({ gen: z6(), demand: 0, imp: 0, dis: 0, emis: 0, days: 0 })),
      slots: SLOT_LABELS.map(() => ({ out: z6(), dem: 0, imp: 0, dis: 0, chg: 0, price: 0 })),
      dis: 0, chg: 0, demand: 0, imp: 0, exp: 0, unserved: 0, curt: 0, sales: 0, bonus: 0, fuel: 0, co2cost: 0, om: 0, impCost: 0, loan: 0, tax: 0,
      interest: 0, capex: 0, arr: 0, dep: 0, refunds: 0, emis: 0, priceSum: 0, cleanSum: 0, blackoutDays: 0, popStart: s.pop, moneyStart: s.money, days: 0, events: []
    };
    this.plants.forEach((p) => { p.ytd = 0; this.scheduleOutages(p); });
  }
  /** continue with the next year after the year report (onModalAction → 'year') */
  nextYear() {
    const s = this.sim; s.year++; s.yearIdx++; s.day = 0; s.yearDone = false; this.report = null; this.startYear();
  }
  /** start a completely new game (resetGame) */
  reset() {
    this.plants.slice().forEach((p) => this.removePlant(p));
    this.newGame();
  }
  scheduleOutages(p: Plant) {
    // planned refuelling / maintenance window for each unit (nuclear ~30 days, coal ~25 days, others short)
    const r = this.rng;
    p.units.forEach((u) => {
      if (p.type === 'nuclear') { u.plan = 60 + Math.floor(r() * 230); u.planLen = 26 + Math.floor(r() * 10); }
      else if (p.type === 'coal') { u.plan = 120 + Math.floor(r() * 150); u.planLen = 21 + Math.floor(r() * 10); }
      else { u.plan = 150 + Math.floor(r() * 120); u.planLen = 3 + Math.floor(r() * 4); }
    });
  }

  stepDay(preview: boolean) {
    const s = this.sim; const d = s.day; const { m } = dateOf(d); const TAU = Math.PI * 2; const rnd = this.rng;
    // ---- events ----
    if (!preview) {
      s.events.forEach((e) => { e.left--; }); s.events = s.events.filter((e) => e.left > 0);
      if (s.events.length < 2 && s.y.events.length < 6) {
        for (const ev of EVENT_DEFS) {
          if (this.hasEv(ev.id) || s.y.events.indexOf(ev.name) >= 0) continue; if (ev.months && ev.months.indexOf(m) < 0) continue;
          if (rnd() < ev.p) { this.startEvent(ev); break; }
        }
      }
    }
    // ---- weather ----
    s.Tanom = 0.85 * s.Tanom + this.gauss() * 1.6;
    let T = 9 - 11 * Math.cos(TAU * (d - 20) / 365) + s.Tanom;
    if (this.hasEv('heat')) T = Math.max(T, 33 + rnd() * 3);
    if (this.hasEv('cold')) T = Math.min(T, -12 - rnd() * 5);
    const cloudMean = 0.6 + 0.15 * Math.cos(TAU * (d - 10) / 365);
    s.cloud = Math.min(1, Math.max(0.05, 0.8 * s.cloud + 0.2 * cloudMean + this.gauss() * 0.12));
    s.lw = 0.75 * s.lw + this.gauss() * 0.32;
    let w = (1 + 0.18 * Math.cos(TAU * (d - 15) / 365)) * Math.exp(s.lw);
    s.fa = 0.9 * s.fa + this.gauss() * 0.08;
    let flow = (1 + 0.45 * Math.cos(TAU * (d - 105) / 365)) * Math.exp(s.fa);
    let cloud = s.cloud;
    if (this.hasEv('drought')) flow *= 0.45;
    if (this.hasEv('flood')) flow = Math.max(flow, 2.3);
    if (this.hasEv('dunkel')) { w *= 0.2; cloud = Math.max(cloud, 0.95); }
    if (this.hasEv('storm')) w = Math.max(w, 3.2);
    if (this.hasEv('glut')) { w = Math.max(w, 1.6); cloud = Math.min(cloud, 0.2); }
    const storm = w > 2.9;
    const solarCF = (0.19 + 0.13 * Math.cos(TAU * (d - 172) / 365)) * (1 - 0.72 * cloud) * (this.hasEv('heat') ? 0.93 : 1);
    const windCF = storm ? 0 : Math.min(0.85, 0.16 * w * w);
    const hydroCF = Math.min(0.95, 0.35 * flow);
    const thermalDerate = (this.hasEv('drought') ? 0.88 : 1) * (this.hasEv('heat') ? 0.9 : 1);
    // ---- fuel & carbon markets ----
    s.gasT = this.hasEv('gas') ? 85 : 36; s.co2T = this.hasEv('ets') ? 107 : 77;
    s.gas = Math.max(15, s.gas + 0.05 * (s.gasT - s.gas) + this.gauss() * 1.0);
    s.co2 = Math.max(30, s.co2 + 0.04 * (s.co2T - s.co2) + this.gauss() * 1.2);
    // ---- daily exchange price (EUR/MWh): 2025 Slovak monthly average x fuel index x weather x events ----
    const fuelRef = 36 / 0.52 + 0.37 * 77; const fuelNow = s.gas / 0.52 + 0.37 * s.co2;
    let price = 0.94 * MONTH_PRICE[m] * (0.45 + 0.55 * fuelNow / fuelRef);
    price *= 1 - 0.18 * Math.min(1.5, Math.max(-1, w - 1)) - 0.1 * (0.6 - cloud);
    price *= 1 + 0.012 * Math.max(0, -s.Tanom) + 0.01 * Math.max(0, T - 28);
    if (this.hasEv('dunkel')) price *= 1.35; if (this.hasEv('cold')) price *= 1.25; if (this.hasEv('glut')) price *= 0.55;
    price *= Math.exp(this.gauss() * 0.08);
    price = Math.max(0, Math.min(650, price));
    // ---- daily demand (MW): population x consumption per person / 8760 h, winter higher ----
    let demand = s.pop * s.perCap / 8760 * (1 + 0.12 * Math.cos(TAU * (d - 15) / 365)) * (1 + 0.006 * Math.max(0, -s.Tanom) + 0.006 * Math.max(0, T - 27));
    if (this.hasEv('heat')) demand *= 1.06; if (this.hasEv('cold')) demand *= 1.12;
    // ---- the day is split into 6 blocks of 4 hours: night, morning, noon, afternoon, evening peak, late evening ----
    const NS = 6, HB = 4;
    const summer = 0.5 + 0.5 * Math.cos(TAU * (d - 172) / 365);
    const sw = [0, 0.05 + 0.35 * summer, 1, 0.9, 0.05 + 0.3 * summer, 0]; const swm = sw.reduce((a, b) => a + b, 0) / NS;
    const solShape = sw.map((v) => v / swm);
    const WIND_SHAPE = [1.06, 1.0, 0.94, 0.94, 1.0, 1.06];
    const dem = DEM_SHAPE.map((f) => demand * f);
    const pr = PRICE_SHAPE.map((f, k) => Math.max(0, price * f * (1 - 0.12 * summer * Math.max(0, solShape[k] - 1))));
    // ---- plants: availability, outages, construction ----
    const all = this.plants.concat(this.hidden);
    const slot: Slot[] = []; for (let k = 0; k < NS; k++) slot.push({ dem: dem[k], price: pr[k], out: z6(), chg: 0, dis: 0, imp: 0, exp: 0, uns: 0, curt: 0 });
    const disp: Plant[] = [], stores: Plant[] = [];
    for (const p of all) {
      if (p.build > 0) {
        if (!preview) { p.build--; if (p.build === 0) { this.hooks.onBuilt?.(p); this.toast('Dokončená stavba: ' + p.name + ' (' + p.mw + ' MW)'); } }
        p.cur = 0; p.chgToday = 0; p.disToday = 0; continue;
      }
      let avail = 0;
      for (const u of p.units) {
        if (!preview) {
          if (u.out > 0) { u.out--; if (u.out === 0) u.why = ''; }
          if (u.plan !== undefined && d === u.plan && u.out === 0) { u.out = u.planLen!; u.why = p.type === 'nuclear' ? 'výmena paliva a revízia' : p.type === 'coal' ? 'ročná odstávka' : 'údržba'; }
          const pf = p.type === 'nuclear' ? 1 / 700 : p.type === 'coal' ? 1 / 300 : 1 / 2000;
          if (u.out === 0 && rnd() < pf) { u.out = p.type === 'nuclear' ? 3 + Math.floor(rnd() * 12) : 2 + Math.floor(rnd() * 7); u.why = p.type === 'nuclear' ? 'porucha reaktora' : 'porucha'; if (p.type === 'nuclear' || p.type === 'coal') this.toast('Porucha: ' + p.name + ' – blok odstavený na ' + u.out + ' dní'); }
        }
        if (u.out === 0) avail += u.cap;
      }
      p.avail = avail;
      if (p.type === 'coal') { disp.push(p); continue; }
      if (p.type === 'battery' || p.type === 'pumped') { stores.push(p); continue; }
      let sum = 0;
      for (let k = 0; k < NS; k++) {
        let mw = 0;
        if (p.type === 'solar') mw = avail * solarCF * (p.loc || 1) * solShape[k];
        else if (p.type === 'wind') mw = avail * Math.min(0.9, windCF * (p.loc || 1) * WIND_SHAPE[k]);
        else if (p.type === 'hydro') mw = avail * hydroCF * (p.cfScale || 1);
        else if (p.type === 'nuclear') mw = avail * 0.97 * thermalDerate;
        slot[k].out[p.type as GenKey] += mw; sum += mw;
      }
      p.cur = sum / NS;
    }
    // ---- storage: charge in the two cheapest blocks, discharge in the two most expensive (buy low, sell high) ----
    const order = pr.map((_v, k) => k).sort((a, b) => pr[a] - pr[b]);
    const cheap = [order[0], order[1]], dear = [order[NS - 1], order[NS - 2]];
    for (const p of stores) {
      const it = ITEM_BY[p.type]; const P = p.avail!; const E = p.mw * it.hours!; p.soc = Math.min(E, p.soc || 0);
      let chgT = 0, disT = 0;
      if (P > 0 && pr[dear[1]] * it.eta! > pr[cheap[1]] * 1.05) {
        for (let k = 0; k < NS; k++) {
          if (cheap.indexOf(k) >= 0) { const c = Math.min(P * HB, (E - p.soc) / it.eta!); if (c > 0) { p.soc += c * it.eta!; slot[k].chg += c / HB; chgT += c; } }
          else if (dear.indexOf(k) >= 0) { const x = Math.min(P * HB, p.soc); if (x > 0) { p.soc -= x; slot[k].dis += x / HB; disT += x; } }
        }
      }
      p.chgToday = chgT; p.disToday = disT; p.cur = disT / 24;
    }
    // ---- per block: coal & gas follow the merit order (run when the price covers fuel + CO2), then import / export ----
    const mcCoal = 30 + 0.95 * s.co2;
    disp.forEach((p) => { p.cur = 0; });
    for (let k = 0; k < NS; k++) {
      const sl = slot[k];
      const must = sl.out.nuclear + sl.out.hydro + sl.out.wind + sl.out.solar;
      let residual = sl.dem + sl.chg - sl.dis - must;
      for (const p of disp) {
        const cap = p.avail! * 0.92 * thermalDerate;
        const mw = sl.price >= mcCoal ? cap : Math.min(cap, Math.max(0, residual));
        sl.out.coal += mw; residual -= mw; p.cur += mw / NS;
      }
      if (residual > 0) { sl.imp = Math.min(3500, residual); sl.uns = Math.max(0, residual - sl.imp); }
      else { sl.exp = Math.min(2500, -residual); sl.curt = -residual - sl.exp; }
    }
    // ---- daily totals (MWh) and money ----
    const out = z6();
    let E_dem = 0, E_imp = 0, E_exp = 0, E_uns = 0, E_curt = 0, E_dis = 0, E_chg = 0, sales = 0, expRev = 0, impCost = 0, fuel = 0, co2cost = 0, emisKg = 0;
    for (const sl of slot) {
      KEYS.forEach((kk) => { out[kk] += sl.out[kk] * HB; });
      E_dem += sl.dem * HB; E_imp += sl.imp * HB; E_exp += sl.exp * HB; E_uns += sl.uns * HB; E_curt += sl.curt * HB; E_dis += sl.dis * HB; E_chg += sl.chg * HB;
      sales += (sl.dem - sl.uns) * HB * sl.price; expRev += sl.exp * HB * sl.price * 0.95; impCost += sl.imp * HB * sl.price * 1.15;
      fuel += (sl.out.nuclear * 10 + sl.out.coal * 30 + sl.out.gas * (s.gas / 0.52 + 4)) * HB;
      co2cost += (sl.out.coal * 0.95 + sl.out.gas * 0.37) * HB * s.co2;
      emisKg += (sl.out.nuclear * 12 + sl.out.hydro * 24 + sl.out.wind * 11 + sl.out.solar * 48 + sl.out.coal * 820 + sl.out.gas * 490 + sl.imp * 400) * HB;
    }
    const genE = KEYS.reduce((a, kk) => a + out[kk], 0);
    const cleanE = out.nuclear + out.hydro + out.wind + out.solar;
    const clean = (cleanE - Math.min(E_curt, cleanE) + E_imp * 0.4) / Math.max(1, genE - E_curt + E_imp);
    s.cleanAvg = preview ? clean : 0.92 * s.cleanAvg + 0.08 * clean;
    const mult = bonusMult(s.cleanAvg);
    const bonus = (sales + expRev) * (mult - 1);
    let om = 0; all.forEach((p) => { om += p.mw * ITEM_BY[p.type].om / 365; });
    const loan = 0;
    const opNet = sales + expRev + bonus - impCost - fuel - co2cost - om - loan;
    const tax = Math.max(0, opNet) * 0.24; // 24 % corporate tax on positive profit
    const interest = s.money < 0 ? -s.money * 0.045 / 365 : 0;
    const net = opNet - tax - interest;
    const emisT = emisKg / 1000;
    const intensity = emisKg / Math.max(1, E_dem - E_uns);
    const avgPrice = pr.reduce((a, b) => a + b, 0) / NS;
    s.prevPrice = s.price; s.price = avgPrice;
    if (!preview) {
      s.money += net;
      const yy = s.y; KEYS.forEach((kk) => { yy.gen[kk] += out[kk]; });
      yy.demand += E_dem; yy.imp += E_imp; yy.exp += E_exp; yy.unserved += E_uns; yy.curt += E_curt; yy.dis += E_dis; yy.chg += E_chg;
      yy.sales += sales + expRev; yy.bonus += bonus; yy.fuel += fuel; yy.co2cost += co2cost; yy.om += om; yy.impCost += impCost; yy.loan += loan; yy.tax += tax; yy.interest += interest; yy.emis += emisT;
      yy.priceSum += avgPrice; yy.cleanSum += clean; yy.days++; if (E_uns > 24) yy.blackoutDays++;
      const mo = yy.months[m]; KEYS.forEach((kk) => { mo.gen[kk] += out[kk]; }); mo.demand += E_dem; mo.imp += E_imp; mo.dis += E_dis; mo.emis += emisT; mo.days++;
      slot.forEach((sl, k) => { const a = yy.slots[k]; a.dem += sl.dem; a.imp += sl.imp; a.dis += sl.dis; a.chg += sl.chg; a.price += sl.price; KEYS.forEach((kk) => { a.out[kk] += sl.out[kk]; }); });
      this.plants.forEach((p) => { p.ytd += (p.cur || 0) * 24; });
      // population: people move in and out depending on air quality (CO2 intensity), price and blackouts.
      // co2Avg = smoothed g CO2 per kWh; below 200 g people arrive, above it they leave
      s.co2Avg = 0.95 * s.co2Avg + 0.05 * intensity;
      const air = Math.max(-0.015, Math.min(0.008, 0.008 * (200 - s.co2Avg) / 200));
      const inRate = 0.005 + Math.max(0, air) + (avgPrice < 80 ? 0.002 : 0);
      const outRate = 0.005 + 0.0012 + Math.max(0, -air) + (avgPrice > 170 ? 0.003 : 0) + (E_uns > 24 ? 0.09 : 0);
      const arr = s.pop * inRate / 365, dep = s.pop * outRate / 365;
      s.pop += arr - dep; yy.arr += arr; yy.dep += dep; s.todayArr = arr; s.todayDep = dep;
      s.perCap *= 1 + 0.012 / 365;
      s.history.push(avgPrice); if (s.history.length > 30) s.history.shift();
    }
    const outMW = z6(); KEYS.forEach((kk) => { outMW[kk] = out[kk] / 24; });
    s.today = { T, cloud, w, flow, price: avgPrice, demand, gen: genE / 24, out: outMW, imp: E_imp / 24, exp: E_exp / 24, unserved: E_uns / 24, curt: E_curt / 24, dis: E_dis / 24, chg: E_chg / 24, clean, mult, intensity, net, storm, emisT, slot };
    if (!preview) {
      s.day++;
      if (s.day >= 365) this.endYear();
    }
  }

  startEvent(ev: EventDef) {
    const s = this.sim; const r = this.rng; const len = ev.len[0] + Math.floor(r() * (ev.len[1] - ev.len[0] + 1));
    s.events.push({ id: ev.id, name: ev.name, left: len, bg: ev.bg });
    if (s.y) s.y.events.push(ev.name);
    this.toast(ev.name + ': ' + ev.text, 6000);
    const pick = (types: PlantType[]) => this.plants.filter((p) => types.indexOf(p.type) >= 0 && p.build === 0);
    if (ev.id === 'storm') pick(['wind']).forEach((p) => { if (r() < 0.35) p.units.forEach((u) => { u.out = Math.max(u.out, 4 + Math.floor(r() * 8)); u.why = 'poškodená víchricou'; }); });
    if (ev.id === 'hail') pick(['solar']).forEach((p) => { if (r() < 0.4) p.units.forEach((u) => { u.out = Math.max(u.out, 5 + Math.floor(r() * 8)); u.why = 'poškodená krupobitím'; }); });
    if (ev.id === 'flood') this.plants.forEach((p) => { if (p.build > 0 || p.type === 'hydro') return; if ((this.hooks.riverDistKm ? this.hooks.riverDistKm(p) : 1e9) < 3 && r() < 0.3) p.units.forEach((u) => { u.out = Math.max(u.out, 3 + Math.floor(r() * 5)); u.why = 'odstavená pre povodeň'; }); });
  }

  endYear() {
    this.sim.yearDone = true;
    this.report = buildReport(this);
    this.hooks.onYearEnd?.(this.report);
  }

  /** money returned when a plant is demolished (dragged back to the dock) */
  refundFor(p: Plant) { const it = ITEM_BY[p.type]; return p.build > 0 ? it.price * 0.8 : it.price * it.refund; }
  demolish(p: Plant): number {
    const back = this.refundFor(p);
    this.removePlant(p); this.sim.money += back; if (this.sim.y) this.sim.y.refunds += back;
    return back;
  }
  /** pays for a new plant and starts construction */
  buy(type: PlantType, lngLat: [number, number], o: { dir?: [number, number]; loc?: number } = {}): Plant {
    const it = ITEM_BY[type];
    this.sim.money -= it.price; this.sim.y.capex += it.price;
    return this.addPlant(type, lngLat, { build: it.build, dir: o.dir, loc: o.loc });
  }
  /** moves a plant (cost already decided by the rules) */
  move(p: Plant, lngLat: [number, number], cost: number, o: { dir?: [number, number]; loc?: number } = {}) {
    this.sim.money -= cost; this.sim.y.capex += cost;
    p.lngLat = lngLat; p.dir = o.dir; if (o.loc !== undefined) p.loc = o.loc;
    if (p.build === 0 && cost > 0) p.units.forEach((u) => { u.out = Math.max(u.out, 14); u.why = 'presun'; });
  }
}
