// Yearly missions based on real Slovak / EU targets (ported 1:1 from Component.missionDefs)
import { fmtNum } from './constants';
import type { Game } from './sim';

export interface Mission { text: string; reward: number; penalty: number; check: () => { ok: boolean; prog: string } }

export function ozeShare(y: { gen: Record<string, number>; demand: number }): number {
  return (y.gen.hydro + y.gen.wind + y.gen.solar) / Math.max(1, y.demand);
}

export function missionDefs(g: Game, idx: number): Mission[] {
  const s = g.sim; const y = s.y; const pct = (v: number) => Math.round(v * 100) + ' %';
  const vreMW = () => g.plants.filter((p) => !p.locked && (p.type === 'solar' || p.type === 'wind')).reduce((a, p) => a + p.mw, 0);
  const hasStore = () => g.plants.some((p) => p.type === 'battery' || p.type === 'pumped');
  const intensity = () => y.emis * 1000 / Math.max(1, y.demand - y.unserved);
  const all: Mission[][] = [
    [
      { text: 'Postav aspoň 300 MW slnka alebo vetra', reward: 200e6, penalty: 0, check: () => { const v = vreMW(); return { ok: v >= 300, prog: fmtNum(v) + ' / 300 MW' }; } },
      { text: 'Ani jeden deň bez elektriny (výpadok)', reward: 100e6, penalty: 0, check: () => ({ ok: y.blackoutDays === 0, prog: y.blackoutDays + ' dní s výpadkom' }) }
    ],
    [
      { text: 'Aspoň 15 % elektriny z obnoviteľných zdrojov', reward: 300e6, penalty: 0, check: () => { const v = ozeShare(y); return { ok: v >= 0.15, prog: pct(v) + ' / 15 %' }; } },
      { text: 'Postav úložisko energie (batériu alebo prečerpávaciu VE)', reward: 150e6, penalty: 0, check: () => ({ ok: hasStore(), prog: hasStore() ? 'postavené' : 'zatiaľ nie' }) }
    ],
    [
      { text: 'Priemerné CO₂ pod 220 g/kWh', reward: 300e6, penalty: 0, check: () => { const v = intensity(); return { ok: y.days > 0 && v < 220, prog: Math.round(v) + ' g/kWh' }; } },
      { text: 'Dovážaj najviac 50 % spotreby', reward: 300e6, penalty: 0, check: () => { const v = y.imp / Math.max(1, y.demand); return { ok: y.days > 0 && v <= 0.5, prog: pct(v) + ' / 50 %' }; } }
    ],
    [
      { text: 'Cieľ Slovenska pre rok 2030: 25 % elektriny z obnoviteľných zdrojov', reward: 500e6, penalty: 300e6, check: () => { const v = ozeShare(y); return { ok: v >= 0.25, prog: pct(v) + ' / 25 %' }; } },
      { text: 'Priemerné CO₂ pod 180 g/kWh', reward: 400e6, penalty: 0, check: () => { const v = intensity(); return { ok: y.days > 0 && v < 180, prog: Math.round(v) + ' g/kWh' }; } }
    ]
  ];
  return all[Math.min(3, idx)];
}
