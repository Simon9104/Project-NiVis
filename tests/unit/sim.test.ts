// Repeats reference/balance/simtest.js (strategies "none" and "green") on the TypeScript port and
// (1) compares it 1:1 with the original logic using the same seeded random numbers,
// (2) checks the control numbers from BRIEF.md (±3 points).
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { Game } from '../../src/sim/sim';
import { ITEM_BY, type PlantType } from '../../src/sim/constants';
import { hudData, plantInfo } from '../../src/sim/report';

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
type Strategy = 'none' | 'green';
interface YearResult { year: number; grade: string; total: number; scores: number[]; rows: Record<string, string>; missions: string[] }

const BUYS: Record<number, [PlantType, number, number?][]> = {
  0: [['solar', 30, 1.05], ['wind', 30, 1.15], ['hydro', 4], ['battery', 3]],
  1: [['solar', 20, 1.05], ['wind', 20, 1.15], ['pumped', 2]],
  2: [['solar', 15, 1.05], ['wind', 15, 1.15], ['battery', 4]]
};

/** the original game logic, driven exactly like reference/balance/simtest.js */
function runReference(strategy: Strategy, seed: number): YearResult[] {
  const src = fs.readFileSync(path.resolve(__dirname, '../../reference/balance/main-logic.js'), 'utf8');
  const g: any = globalThis;
  const savedRandom = Math.random; Math.random = mulberry32(seed);
  try {
    g.window = {};
    g.DCLogic = class { props: any; state: any; constructor(p: any) { this.props = p || {}; } setState(u: any) { if (typeof u === 'function') u = u(this.state); Object.assign(this.state, u); } };
    const C = (0, eval)(src + '\n;Component');
    const c = new C({}); c.toast = () => {}; c.riversXZ = []; c.three = { scene: { remove() {} } }; c.setConstruction = () => {}; c.state.loading = false;
    const mk = (type: string, units: number[], extra?: any) => Object.assign({ type, name: type, units: units.map((cap) => ({ cap, out: 0, why: '' })), mw: units.reduce((a, b) => a + b, 0), build: 0, buildTotal: 0, ytd: 0, loc: 1, root: { userData: { rotors: [] }, scale: {} }, sprites: [] }, extra || {});
    c.plants = []; c.addStarter = () => c.plants.push(mk('nuclear', [505, 505], { locked: true })); c.hidden = [];
    c.newGame();
    const buy = (type: string, n: number, loc?: number) => { const it = c.itemBy[type]; for (let i = 0; i < n; i++) { c.plants.push(mk(type, [it.mw], { build: it.build, buildTotal: it.build, loc: loc || 1 })); c.sim.money -= it.price; c.sim.y.capex += it.price; } };
    const out: YearResult[] = [];
    for (let yr = 0; yr < 4; yr++) {
      if (strategy === 'green') (BUYS[yr] || []).forEach(([t, n, l]) => buy(t, n, l));
      while (!c.sim.yearDone) c.stepDay(false);
      const r = c.state.report;
      out.push({ year: c.sim.year, grade: r.grade, total: r.total, scores: r.scores.map((s: any) => s.score), rows: Object.fromEntries(r.rows.map((x: any) => [x.k, x.v])), missions: r.missions.map((m: any) => m.icon + m.prog + m.money) });
      c.state.modal = 'year'; if (yr < 3) c.onModalAction();
    }
    return out;
  } finally { Math.random = savedRandom; }
}

/** the TypeScript port */
function runPort(strategy: Strategy, seed: number, game?: Game): YearResult[] {
  const g = game || new Game({ rng: mulberry32(seed) });
  g.newGame();
  const buy = (type: PlantType, n: number, loc?: number) => { const it = ITEM_BY[type]; for (let i = 0; i < n; i++) { g.plants.push(g.makePlant(type, [19, 48.7], { build: it.build, loc: loc || 1 })); g.sim.money -= it.price; g.sim.y.capex += it.price; } };
  const out: YearResult[] = [];
  for (let yr = 0; yr < 4; yr++) {
    if (strategy === 'green') (BUYS[yr] || []).forEach(([t, n, l]) => buy(t, n, l));
    let d = 0;
    while (!g.sim.yearDone) { g.stepDay(false); if (++d === 180) { expect(hudData(g)!.slots).toHaveLength(6); g.plants.forEach((p) => plantInfo(g, p)); } }
    const r = g.report!;
    out.push({ year: g.sim.year, grade: r.grade, total: r.total, scores: r.scores.map((s) => s.score), rows: Object.fromEntries(r.rows.map((x) => [x.k, x.v])), missions: r.missions.map((m) => m.icon + m.prog + m.money) });
    if (yr < 3) g.nextYear();
  }
  return out;
}

const num = (v: string) => parseFloat(v.replace(/\s/g, '').replace('−', '-').replace(',', '.'));

describe('simulation port = reference logic (same random numbers)', () => {
  for (const strategy of ['none', 'green'] as Strategy[]) {
    for (const seed of [1, 42, 2027]) {
      it(`${strategy}, seed ${seed}: identical yearly reports`, () => {
        const ref = runReference(strategy, seed);
        const port = runPort(strategy, seed);
        expect(port).toEqual(ref);
      });
    }
  }
});

describe('control numbers from BRIEF.md (±3 points, median over seeds)', () => {
  // the distribution is skewed (a rare double reactor outage causes blackouts), so the median is compared
  const SEEDS = Array.from({ length: 15 }, (_, i) => 101 + i * 37);
  const med = (v: number[]) => v.slice().sort((a, b) => a - b)[Math.floor(v.length / 2)];
  const avg = (strategy: Strategy) => {
    const runs = SEEDS.map((s) => runPort(strategy, s));
    return [0, 1, 2, 3].map((yi) => ({
      total: med(runs.map((r) => r[yi].total)),
      co2: med(runs.map((r) => num(r[yi].rows['Priemer CO₂']))),
      imp: med(runs.map((r) => num(r[yi].rows['Import']))),
      oze: med(runs.map((r) => num(r[yi].rows['Obnoviteľné zdroje']))),
      grades: runs.map((r) => r[yi].grade)
    }));
  };
  it('no building: grade D ≈ 50, CO₂ ≈ 285 g/kWh, import ≈ 18 TWh every year', () => {
    for (const y of avg('none')) {
      expect(y.total).toBeGreaterThanOrEqual(47); expect(y.total).toBeLessThanOrEqual(53);
      expect(y.co2).toBeGreaterThan(275); expect(y.co2).toBeLessThan(295);
      expect(y.imp).toBeGreaterThan(17); expect(y.imp).toBeLessThan(19.5);
      expect(y.grades.filter((g) => g === 'D').length).toBeGreaterThanOrEqual(12);
    }
  });
  it('green strategy: 2027 C 58 → 2028 C/B ~69 → 2029 B 77 → 2030 B 77, OZE ≈ 29 %, CO₂ ≈ 181', () => {
    const y = avg('green');
    const expected = [58, 69, 77, 77];
    y.forEach((v, i) => { expect(Math.abs(v.total - expected[i])).toBeLessThanOrEqual(3); });
    expect(y[0].grades.filter((g) => g === 'C').length).toBeGreaterThanOrEqual(12);
    expect(y[3].grades.filter((g) => g === 'B').length).toBeGreaterThanOrEqual(12);
    expect(Math.abs(y[3].oze - 29)).toBeLessThanOrEqual(4);
    expect(Math.abs(y[3].co2 - 181)).toBeLessThanOrEqual(12);
  });
});
