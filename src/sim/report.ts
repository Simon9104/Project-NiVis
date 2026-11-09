// Year report, HUD values and plant info – ported from Component.endYear / pushHud / refreshInfo / stackCols.
import { COLORS, LABELS, ITEM_BY, MONTHS, MONTH_SHORT, SLOT_LABELS, fmtMoney, fmtNum, fmtTons } from './constants';
import { missionDefs, ozeShare } from './missions';
import { dateOf, type Game, type Plant } from './sim';

export interface Row { label: string; dem: number; imp?: number; dis?: number; chg?: number; price?: number; out: Record<string, number>; top?: string; co2?: number }
export interface Quiz { q: string; opts: string[]; correct: number; expl: string }
export interface Report {
  kicker: string; title: string; text: string; grade: string; total: number; gradeBg: string; gradeText: string;
  scores: { label: string; score: number; note: string; w: string; c: string }[];
  missions: { text: string; prog: string; icon: string; color: string; money: string }[];
  dayRows: Row[]; monRows: Row[]; quiz: Quiz[]; open: string; rows: { k: string; v: string }[]; btn: string; final: boolean;
}
export interface Col { label: string; segs: { c: string; h: string }[]; demB: string; top: string }

/** stacked column for the small charts: sources from the bottom, then storage, then import; demand = a marker line */
export function stackCols(rows: Row[], H: number): Col[] {
  const order = ['nuclear', 'hydro', 'wind', 'solar', 'coal', 'gas'];
  const tot = (r: Row) => order.reduce((a, k) => a + (r.out[k] || 0), 0) + (r.dis || 0) + (r.imp || 0);
  const max = Math.max(1, ...rows.map((r) => Math.max(tot(r), r.dem)));
  return rows.map((r) => {
    const segs = order.map((k) => ({ c: COLORS[k], v: r.out[k] || 0 })).concat([{ c: COLORS.store, v: r.dis || 0 }, { c: COLORS.imp, v: r.imp || 0 }])
      .filter((x) => x.v > max * 0.004).map((x) => ({ c: x.c, h: (x.v / max * H).toFixed(1) + 'px' }));
    return { label: r.label, segs, demB: (r.dem / max * H).toFixed(1) + 'px', top: r.top !== undefined ? r.top : r.price !== undefined ? Math.round(r.price) + ' €' : '' };
  });
}

export function buildReport(g: Game): Report {
  const s = g.sim; const y = s.y;
  const TWh = (v: number) => (v / 1e6).toFixed(2).replace('.', ',') + ' TWh';
  const genTot = Object.values(y.gen).reduce((a, b) => a + b, 0);
  const cleanGen = y.gen.nuclear + y.gen.hydro + y.gen.wind + y.gen.solar;
  const clean = (cleanGen - Math.min(y.curt, cleanGen) + y.imp * 0.4) / Math.max(1, genTot - y.curt + y.imp);
  const consumption = y.demand - y.unserved;
  const intensity = y.emis * 1000 / Math.max(1, consumption);
  // missions: reward or penalty
  const missions = missionDefs(g, s.yearIdx).map((ms) => { const r = ms.check(); return { text: ms.text, ok: r.ok, prog: r.prog, money: r.ok ? ms.reward : -ms.penalty }; });
  let missionMoney = 0; missions.forEach((ms) => { missionMoney += ms.money; }); s.money += missionMoney;
  const opProfit = y.sales + y.bonus - y.fuel - y.co2cost - y.om - y.impCost - y.loan - y.tax - y.interest;
  const popCh = s.pop - y.popStart;
  const impShare = y.imp / Math.max(1, y.demand);
  const oze = ozeShare(y);
  const sc = (v: number) => Math.round(Math.max(0, Math.min(100, v)));
  const ekon = sc(50 + (opProfit / 1e6) / 20);
  const eko = sc(100 - (intensity - 100) / 3.5);
  const spol = sc(100 - y.blackoutDays * 12 - impShare * 60);
  const ludia = sc(50 + (popCh / y.popStart) * 100 * 20 + (250 - intensity) * 0.25);
  const total = Math.round((ekon + eko + spol + ludia) / 4);
  const grade = total >= 85 ? 'A' : total >= 70 ? 'B' : total >= 55 ? 'C' : total >= 40 ? 'D' : 'E';
  const col = (v: number) => (v >= 70 ? '#2E9A57' : v >= 45 ? '#D9A21B' : '#C0392B');
  const rec = { year: s.year, total, ekon, eko, spol, ludia, opProfit, intensity, clean, popCh, grade };
  s.reports = (s.reports || []).concat([rec]);
  const final = s.yearIdx >= 3;
  // charts: an average day (6 blocks) and the year by month
  const stackKeys = ['nuclear', 'hydro', 'wind', 'solar', 'coal', 'gas'] as const;
  const dayRows: Row[] = y.slots.map((a, k) => { const n = Math.max(1, y.days); const o: Record<string, number> = {}; stackKeys.forEach((kk) => { o[kk] = a.out[kk] / n; }); return { label: SLOT_LABELS[k], dem: a.dem / n, imp: a.imp / n, dis: a.dis / n, chg: a.chg / n, price: a.price / n, out: o }; });
  const monRows: Row[] = y.months.map((mo, i) => { const n = Math.max(1, mo.days) * 24; const o: Record<string, number> = {}; stackKeys.forEach((kk) => { o[kk] = mo.gen[kk] / n; }); return { label: MONTH_SHORT[i], dem: mo.demand / n, imp: mo.imp / n, dis: mo.dis / n, out: o, co2: mo.emis * 1000 / Math.max(1, mo.demand) }; });
  // quiz (multiple choice, answers from this year's data) + one open question
  const priceSlots = dayRows.map((r) => r.price!); const dearK = priceSlots.indexOf(Math.max(...priceSlots));
  const qPool: Record<string, Quiz> = {
    peak: { q: 'Kedy počas dňa bola tento rok elektrina v priemere najdrahšia?', opts: [SLOT_LABELS[1] + ' (ráno)', SLOT_LABELS[3] + ' (popoludní)', SLOT_LABELS[4] + ' (večer)', SLOT_LABELS[0] + ' (v noci)'], correct: [1, 3, 4, 0].indexOf(dearK) >= 0 ? [1, 3, 4, 0].indexOf(dearK) : 2, expl: 'Najdrahšie bolo v bloku ' + SLOT_LABELS[dearK] + ' h (' + Math.round(priceSlots[dearK]) + ' €/MWh). Večer ľudia prídu domov, varia, svietia a nabíjajú autá – a slnko už nesvieti.' },
    solar: { q: 'Kedy vyrábajú solárne panely najviac a kedy najmenej?', opts: ['Najviac v lete, najmenej v zime', 'Rovnako celý rok', 'Najviac na jar, najmenej v lete'], correct: 0, expl: 'V lete je deň dlhší a slnko vyššie – panel vyrobí v júni asi 5× viac ako v decembri. A v noci nevyrobí nič.' },
    imp: { q: 'Koľko spotreby si tento rok musel doviezť zo zahraničia?', opts: ['menej ako 20 %', '20 – 40 %', '40 – 60 %', 'viac ako 60 %'], correct: impShare < 0.2 ? 0 : impShare < 0.4 ? 1 : impShare < 0.6 ? 2 : 3, expl: 'Doviezol si ' + Math.round(impShare * 100) + ' % spotreby. Dovoz je o 15 % drahší a v priemere špinavší (400 g CO₂/kWh).' },
    store: { q: 'Čo najviac pomôže pokryť večernú špičku, keď už nesvieti slnko?', opts: ['Ďalší solárny park', 'Batéria alebo prečerpávacia elektráreň', 'Odstaviť jadrovú elektráreň'], correct: 1, expl: 'Úložisko sa nabije cez deň alebo v noci, keď je elektrina lacná, a vybije sa večer, keď je drahá. Ďalší solárny park večer nepomôže.' },
    co2: { q: 'Čo najviac rozhoduje o tom, či sa ľudia do krajiny prisťahujú?', opts: ['Množstvo CO₂ (hranica 200 g/kWh)', 'Počet postavených elektrární', 'Výška tvojich peňazí'], correct: 0, expl: 'Tento rok si mal priemerne ' + Math.round(intensity) + ' g CO₂/kWh. Pod 200 g/kWh ľudia prichádzajú, nad ňou odchádzajú.' }
  };
  const pick = [['peak', 'solar'], ['imp', 'store'], ['co2', 'peak'], ['store', 'imp']][Math.min(3, s.yearIdx)];
  const quiz = pick.map((k) => qPool[k]);
  const open = [
    'Čo by si na budúci rok urobil inak a prečo?',
    'Ktorá udalosť ti tento rok najviac skomplikovala situáciu? Ako by si sa na ňu pripravil?',
    'Tvoje CO₂ bolo ' + Math.round(intensity) + ' g/kWh. Skutočná domáca výroba Slovenska mala v roku 2025 približne 110 g/kWh. Prečo je rozdiel?',
    'Keby si bol naozaj ministrom energetiky, ktoré tri rozhodnutia z hry by si urobil aj v skutočnosti?'
  ][Math.min(3, s.yearIdx)];
  return {
    kicker: final ? 'Koniec hry · 4 roky' : 'Vyhodnotenie roka', title: final ? 'Konečné hodnotenie' : 'Rok ' + s.year,
    text: (y.events.length ? 'Udalosti roka: ' + y.events.join(', ') + '.' : 'Pokojný rok bez väčších udalostí.') + (final ? '\nPriemer za 4 roky: ' + Math.round(s.reports.reduce((a, r) => a + r.total, 0) / s.reports.length) + ' bodov.' : ''),
    grade, total, gradeBg: col(total), gradeText: grade === 'A' ? 'Výborne – krajina prosperuje a je čistá.' : grade === 'B' ? 'Veľmi dobre.' : grade === 'C' ? 'Dobre, ale je čo zlepšovať.' : 'Krajine sa nedarí – skús iné rozhodnutia.',
    scores: [
      { label: 'Ekonomika', score: ekon, note: 'Čistý zisk ' + fmtMoney(opProfit) + ' (po daniach, bez investícií)' },
      { label: 'Ekológia', score: eko, note: 'Emisie ' + Math.round(intensity) + ' g CO₂/kWh · spolu ' + (y.emis / 1e6).toFixed(2).replace('.', ',') + ' Mt CO₂' },
      { label: 'Spoľahlivosť', score: spol, note: 'Dni s výpadkom: ' + y.blackoutDays + ' · import ' + Math.round(impShare * 100) + ' % spotreby' },
      { label: 'Spokojnosť ľudí', score: ludia, note: 'Prišlo ' + fmtNum(y.arr) + ', odišlo ' + fmtNum(y.dep) + ' · populácia ' + (popCh >= 0 ? '+' : '') + fmtNum(popCh) }
    ].map((r) => ({ label: r.label, score: r.score, note: r.note, w: r.score + '%', c: col(r.score) })),
    missions: missions.map((ms) => ({ text: ms.text, prog: ms.prog, icon: ms.ok ? '✓' : '✗', color: ms.ok ? '#1A7A43' : '#A33A22', money: ms.money ? (ms.money > 0 ? '+' : '') + fmtMoney(ms.money) : 'bez odmeny' })),
    dayRows, monRows, quiz, open,
    rows: ([
      ['Spotreba', TWh(y.demand)], ['Výroba', TWh(genTot)], ['Obnoviteľné zdroje', Math.round(oze * 100) + ' % spotreby'],
      ['Jadro', TWh(y.gen.nuclear)], ['Voda', TWh(y.gen.hydro)], ['Slnko', TWh(y.gen.solar)], ['Vietor', TWh(y.gen.wind)], ['Uhlie', TWh(y.gen.coal)], ['Plyn a biomasa', TWh(y.gen.gas)],
      ['Úložiská vrátili', TWh(y.dis)], ['Export', TWh(y.exp)], ['Import', TWh(y.imp)],
      ['Priemerná cena', Math.round(y.priceSum / Math.max(1, y.days)) + ' €/MWh'], ['Tržby za elektrinu', fmtMoney(y.sales)],
      ['Bonus za čistú energiu', fmtMoney(y.bonus)], ['Odmeny a pokuty z misií', fmtMoney(missionMoney)], ['Palivo', fmtMoney(y.fuel)], ['Emisné povolenky', fmtMoney(y.co2cost)], ['Prevádzka a údržba', fmtMoney(y.om)],
      ['Nákup importu', fmtMoney(y.impCost)], ['Dane (24 %)', fmtMoney(y.tax)], ['Úroky z úveru', fmtMoney(y.interest)], ['Investície do stavieb', fmtMoney(y.capex)],
      ['CO₂ za rok', fmtTons(y.emis)], ['Priemer CO₂', Math.round(intensity) + ' g/kWh'], ['Prisťahovaní', '+' + fmtNum(y.arr)], ['Odsťahovaní', '−' + fmtNum(y.dep)], ['Peniaze na konci roka', fmtMoney(s.money)], ['Populácia', fmtNum(s.pop)]
    ] as [string, string][]).map((r) => ({ k: r[0], v: r[1] })),
    btn: final ? 'Hrať znova' : 'Pokračovať do roku ' + (s.year + 1), final
  };
}

export interface Hud {
  money: number; net: number; pop: number; popDelta: number; clean: number; mult: number; date: string; yearText: string; progress: string;
  prod: number; demand: number; price: number; trend: number; mix: { w: string; c: string; label: string; mw: string }[]; slots: Col[];
  missions: { icon: string; color: string; text: string; prog: string }[];
  temp: string; cloud: string; wind: string; flow: string; co2: number; unserved: number; co2Day: string; co2Year: string; arrYear: string; depYear: string; perCap: string;
  events: { name: string; left: string; bg: string }[];
}

export function hudData(g: Game): Hud | null {
  const s = g.sim; const t = s?.today; if (!t) return null;
  const { m, dd } = dateOf(Math.min(364, s.day));
  const supply = t.gen + t.imp + (t.dis || 0); const mixKeys = ['nuclear', 'hydro', 'solar', 'wind', 'coal', 'gas'] as const;
  const mix = mixKeys.map((k) => ({ k: k as string, mw: t.out[k] })).concat([{ k: 'store', mw: t.dis || 0 }, { k: 'imp', mw: t.imp }]).filter((x) => x.mw > 0.5 || x.k === 'solar' || x.k === 'wind')
    .map((x) => ({ w: (x.mw / Math.max(1, supply) * 100).toFixed(1) + '%', c: COLORS[x.k], label: LABELS[x.k], mw: fmtNum(x.mw) }));
  const avg = s.history.length ? s.history.reduce((a, b) => a + b, 0) / s.history.length : t.price;
  const windMs = (4.3 * t.w).toFixed(1).replace('.', ',');
  const slotRows: Row[] = t.slot.map((sl, k) => ({ label: SLOT_LABELS[k], dem: sl.dem, imp: sl.imp, dis: sl.dis, price: sl.price, out: sl.out }));
  const missions = s.y ? missionDefs(g, s.yearIdx).map((ms) => { const r = ms.check(); return { icon: r.ok ? '✓' : '○', color: r.ok ? '#1A7A43' : '#6B7A83', text: ms.text, prog: r.prog }; }) : [];
  return {
    money: s.money, net: t.net, pop: s.pop, popDelta: s.pop - (s.y ? s.y.popStart : s.pop), clean: s.cleanAvg, mult: t.mult,
    date: dd + '. ' + MONTHS[m] + ' ' + s.year, yearText: 'Rok ' + (s.yearIdx + 1) + ' zo 4 · deň ' + Math.min(365, s.day + 1) + '/365',
    progress: (Math.min(365, s.day) / 365 * 100).toFixed(1) + '%',
    prod: t.gen, demand: t.demand, price: t.price, trend: t.price - avg, mix, slots: stackCols(slotRows, 40), missions,
    temp: Math.round(t.T) + ' °C', cloud: Math.round(t.cloud * 100) + ' %', wind: t.storm ? 'víchrica' : windMs + ' m/s', flow: Math.round(t.flow * 100) + ' %',
    co2: Math.round(t.intensity), unserved: t.unserved,
    co2Day: fmtNum(t.emisT) + ' t', co2Year: s.y ? fmtTons(s.y.emis) : '0 t',
    arrYear: s.y ? fmtNum(s.y.arr) : '0', depYear: s.y ? fmtNum(s.y.dep) : '0',
    perCap: (s.perCap).toFixed(2).replace('.', ','),
    events: s.events.map((e) => ({ name: e.name, left: 'ešte ' + e.left + ' d', bg: e.bg }))
  };
}

export interface PlantInfo { name: string; status: string; color: string; rows: { k: string; v: string }[] }
export function plantInfo(g: Game, p: Plant): PlantInfo {
  const it = ITEM_BY[p.type]; const isStore = p.type === 'battery' || p.type === 'pumped';
  let status = 'V prevádzke', color = '#1A7A43';
  if (p.build > 0) { status = 'Vo výstavbe – zostáva ' + p.build + ' dní'; color = '#9A6200'; }
  else { const off = p.units.filter((u) => u.out > 0); if (off.length === p.units.length) { status = 'Odstavená: ' + off[0].why + ' (' + off[0].out + ' d)'; color = '#A33A22'; } else if (off.length) { status = off.length + ' z ' + p.units.length + ' blokov odstavených: ' + off[0].why; color = '#9A6200'; } else if ((p.type === 'coal') && (p.cur || 0) < 1) { status = 'Mimo prevádzky – elektrina je lacnejšia ako výroba z uhlia'; color = '#4F5F68'; } else if (isStore && !(p.disToday! > 0)) { status = 'Čaká – dnes sa neoplatilo nabíjať'; color = '#4F5F68'; } }
  const days = Math.max(1, g.sim.y ? g.sim.y.days : 1);
  const cfY = p.ytd / Math.max(1, p.mw * 24 * days);
  let rows: { k: string; v: string }[];
  if (isStore) {
    const E = p.mw * it.hours!;
    rows = [
      { k: 'Výkon / kapacita', v: fmtNum(p.mw) + ' MW / ' + fmtNum(E) + ' MWh' },
      { k: 'Nabitie', v: Math.round((p.soc || 0) / E * 100) + ' %' },
      { k: 'Dnes nabila / vybila', v: fmtNum(p.chgToday || 0) + ' / ' + fmtNum(p.disToday || 0) + ' MWh' },
      { k: 'Účinnosť cyklu', v: Math.round(it.eta! * 100) + ' %' },
      { k: 'Vrátila tento rok', v: (p.ytd / 1000).toFixed(0) + ' GWh' }
    ];
  } else {
    rows = [
      { k: 'Inštalovaný výkon', v: fmtNum(p.mw) + ' MW' + (p.units.length > 1 ? ' (' + p.units.length + ' bloky)' : '') },
      { k: 'Výkon dnes (priemer)', v: fmtNum(p.cur || 0) + ' MW' },
      { k: 'Výroba tento rok', v: (p.ytd / 1000).toFixed(0) + ' GWh' },
      { k: 'Využitie tento rok', v: Math.round(cfY * 100) + ' %' },
      { k: 'Emisie (životný cyklus)', v: it.co2 + ' g CO₂/kWh' }
    ];
  }
  if (p.type === 'wind' || p.type === 'solar') rows.push({ k: 'Kvalita miesta', v: '×' + p.loc.toFixed(2).replace('.', ',') });
  if (p.locked) rows.push({ k: 'Skutočná elektráreň', v: 'nedá sa presunúť' });
  return { name: p.name, status, color, rows };
}
