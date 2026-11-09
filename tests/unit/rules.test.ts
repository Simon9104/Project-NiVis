import { beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import * as turf from '@turf/turf';
import { setDem, elevation } from '../../src/rules/dem';
import { evaluate, distKm, inside, nearestRiver, nationalPark, relief, solarFactor, windFactor, CITIES, type LngLat } from '../../src/rules/evaluate';
import { Game } from '../../src/sim/sim';

beforeAll(() => { setDem(fs.readFileSync(path.resolve(__dirname, '../../public/dem-sk.bin'))); });
const ctx = (money = 3e9, plants: any[] = []) => ({ plants, money });
const why = (e: ReturnType<typeof evaluate>) => (e.ok ? 'OK' : e.why);

describe('terrain sampler (Terrarium z10 → dem-sk.bin)', () => {
  it('knows real heights', () => {
    expect(elevation(20.17, 49.165)).toBeGreaterThan(1900); // Vysoké Tatry
    expect(elevation(17.6, 47.95)).toBeLessThan(150); // Žitný ostrov
    expect(elevation(19.94, 49.0)).toBeGreaterThan(700); // Čierny Váh
  });
});

describe('geometry', () => {
  it('local km distances match turf (<1 %)', () => {
    const pairs: [LngLat, LngLat][] = [[[17.1, 48.14], [21.26, 48.72]], [[19.0, 48.5], [19.05, 48.52]], [[17.68, 48.49], [17.84, 48.6]]];
    for (const [a, b] of pairs) expect(Math.abs(distKm(a, b) / turf.distance(a, b, { units: 'kilometers' }) - 1)).toBeLessThan(0.01);
  });
  it('border, rivers, parks, cities', () => {
    expect(inside([19.5, 48.7])).toBe(true);
    expect(inside([19.0, 47.5])).toBe(false); // Budapest
    expect(nearestRiver([17.84, 48.62]).name).toBe('Váh');
    expect(nationalPark([20.15, 49.17])).toBe('TANAP');
    expect(nationalPark([17.6, 48.0])).toBeNull();
    expect(CITIES.find((c) => c.name === 'Bratislava')!.R).toBeGreaterThan(4);
  });
});

describe('building rules (BRIEF.md examples)', () => {
  it('hydro on the Váh near Piešťany: OK, snapped onto the river and oriented downstream', () => {
    const e = evaluate('hydro', [17.84, 48.62], null, ctx());
    expect(why(e)).toBe('OK');
    if (e.ok) {
      expect(e.river).toBe('Váh');
      expect(e.sub).toContain('na rieke Váh');
      expect(e.dir).toBeDefined();
      expect(e.dir![1]).toBeLessThan(0); // the Váh flows south here
      expect(nearestRiver(e.lngLat).d).toBeLessThan(0.05);
    }
  });
  it('nuclear in the middle of Bratislava: NO', () => {
    expect(evaluate('nuclear', [17.107, 48.144], null, ctx()).ok).toBe(false);
    expect(why(evaluate('nuclear', [17.13, 48.16], null, ctx()))).toBe('Príliš blízko mesta Bratislava');
  });
  it('pumped storage at Čierny Váh: OK', () => {
    const e = evaluate('pumped', [19.94, 49.0], null, ctx());
    expect(why(e)).toBe('OK');
    if (e.ok) expect(e.sub).toBe('300 MW / 2 400 MWh · voda z rieky Čierny Váh · 600 mil. €');
  });
  it('wind in TANAP: NO (national park)', () => {
    expect(why(evaluate('wind', [20.15, 49.17], null, ctx()))).toBe('Tu je národný park TANAP – stavať sa tu nesmie');
    expect(why(evaluate('coal', [20.15, 49.17], null, ctx()))).toContain('národný park');
    expect(why(evaluate('solar', [20.2, 49.2], null, ctx()))).not.toContain('národný park');
  });
  it('pumped storage needs hills, a river and ≥ 200 m relief within 3 km', () => {
    expect(why(evaluate('pumped', [17.2, 48.6], null, ctx()))).toBe('Prečerpávacia VE potrebuje kopce (nad 550 m)');
    expect(elevation(19.52, 49.08)).toBeGreaterThan(550); // Liptov basin: high but flat
    expect(relief([19.52, 49.08])).toBeLessThan(200);
    expect(why(evaluate('pumped', [19.52, 49.08], null, ctx()))).toBe('Prečerpávacia VE potrebuje väčší výškový rozdiel');
  });
  it('nuclear needs a river within 6 km; next to the river is "wet"', () => {
    expect(why(evaluate('nuclear', [18.46, 48.26], null, ctx()))).toBe('OK'); // near Mochovce / Hron
    expect(why(evaluate('coal', [18.53, 48.71], null, ctx()))).toBe('Tu tečie rieka Nitra – vyber suché miesto');
    expect(why(evaluate('nuclear', [20.3, 48.5], null, ctx()))).toMatch(/chladenie|rieka|mesta/);
  });
  it('hydro far from rivers; lakes; outside Slovakia', () => {
    expect(why(evaluate('hydro', [18.0, 48.25], null, ctx()))).toMatch(/Vodná elektráreň musí stáť na rieke|Tu je/);
    expect(why(evaluate('solar', [19.6, 49.08], null, ctx()))).toMatch(/Tu je Liptovská Mara|Tu tečie/);
    expect(why(evaluate('solar', [19.05, 47.5], null, ctx()))).toBe('Stavať môžeš len na Slovensku');
  });
  it('spacing 3,5 km between plants and the credit limit', () => {
    const g = new Game(); g.newGame();
    const p = g.addPlant('solar', [18.3, 48.0]);
    expect(why(evaluate('solar', [18.32, 48.0], null, ctx(3e9, g.plants)))).toBe('Príliš blízko inej elektrárne'); // ~1.5 km
    expect(why(evaluate('solar', [18.32, 48.0], p, ctx(3e9, g.plants)))).toBe('OK'); // moving itself
    expect(why(evaluate('solar', [18.36, 48.0], null, ctx(3e9, g.plants)))).toBe('OK'); // ~4.5 km
    expect(why(evaluate('nuclear', [18.46, 48.26], null, ctx(-5e9)))).toBe('Prekročil by si úverový limit 12 mld. € (10,00 mld. €)');
  });
  it('real height drives wind and solar quality', () => {
    expect(windFactor([17.6, 48.0])).toBeLessThan(0.85);
    expect(windFactor([19.3, 48.62])).toBeGreaterThan(windFactor([17.6, 48.0]) + 0.1); // Kremnické vrchy vs Žitný ostrov
    for (const ll of [[17.6, 48.0], [20.15, 49.17], [21.5, 49.2]] as LngLat[]) { const w = windFactor(ll); expect(w).toBeGreaterThanOrEqual(0.7); expect(w).toBeLessThanOrEqual(1.3); }
    expect(solarFactor([18.3, 47.9])).toBeGreaterThan(solarFactor([19.4, 49.4]));
    expect(solarFactor([20.15, 49.17])).toBeLessThan(solarFactor([20.3, 49.05]));
  });
});
