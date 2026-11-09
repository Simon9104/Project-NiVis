// Constants and static texts ported 1:1 from reference/Main.dc.html (Component constructor).

export type PlantType = 'solar' | 'wind' | 'hydro' | 'battery' | 'pumped' | 'nuclear' | 'coal';
export type GenKey = 'nuclear' | 'hydro' | 'wind' | 'solar' | 'coal' | 'gas';

export interface Item {
  type: PlantType; name: string; mw: number; hours?: number; eta?: number; price: number; build: number;
  om: number; varc: number; co2: number; cf: string; tint: string; rule: string; refund: number;
}

// Real-world parameters (sources in the design notes): unit size, capital cost (EUR), build time (game days),
// fixed O&M (EUR per MW and year), variable cost (EUR/MWh, without CO2), lifecycle CO2 (g/kWh, IPCC medians)
export const ITEMS: Item[] = [
  { type: 'solar', name: 'Solárny park', mw: 50, price: 33e6, build: 120, om: 15000, varc: 0, co2: 48, cf: '≈11 %', tint: '#FFF4D6', rule: 'Viac slnka na juhu', refund: 0.2 },
  { type: 'wind', name: 'Veterný park', mw: 30, price: 42e6, build: 240, om: 40000, varc: 0, co2: 11, cf: '≈24 %', tint: '#DDF0F8', rule: 'Najlepšie na kopci', refund: 0.2 },
  { type: 'hydro', name: 'Vodná elektráreň', mw: 60, price: 180e6, build: 330, om: 30000, varc: 0, co2: 24, cf: '≈35 %', tint: '#D6EAF4', rule: 'Len na rieke', refund: 0.2 },
  { type: 'battery', name: 'Batériové úložisko', mw: 100, hours: 2, eta: 0.88, price: 60e6, build: 120, om: 20000, varc: 0, co2: 0, cf: 'nabíja/vybíja', tint: '#E4F2EA', rule: 'Presúva energiu na večer', refund: 0.2 },
  { type: 'pumped', name: 'Prečerpávacia VE', mw: 300, hours: 8, eta: 0.76, price: 600e6, build: 540, om: 25000, varc: 0, co2: 0, cf: 'nabíja/vybíja', tint: '#DCEBF3', rule: 'V horách pri rieke', refund: 0.2 },
  { type: 'nuclear', name: 'Jadrová elektráreň', mw: 1200, price: 10e9, build: 730, om: 130000, varc: 10, co2: 12, cf: '≈90 %', tint: '#ECE9F4', rule: 'Pri rieke (chladenie)', refund: 0 },
  { type: 'coal', name: 'Uhoľná elektráreň', mw: 400, price: 800e6, build: 540, om: 50000, varc: 30, co2: 820, cf: 'podľa ceny', tint: '#ECE8E2', rule: 'Mimo vody a miest', refund: 0.2 }
];
export const ITEM_BY: Record<PlantType, Item> = Object.fromEntries(ITEMS.map((it) => [it.type, it])) as Record<PlantType, Item>;

export const CO2 = { nuclear: 12, hydro: 24, wind: 11, solar: 48, coal: 820, gas: 490, imp: 400 };
export const COLORS: Record<string, string> = { nuclear: '#7B55B8', hydro: '#2B7BB9', solar: '#F2C230', wind: '#8FD6F2', coal: '#3C4248', gas: '#E07B39', store: '#2E9A57', imp: '#AEB8BF' };
export const LABELS: Record<string, string> = { nuclear: 'Jadro', hydro: 'Voda', solar: 'Slnko', wind: 'Vietor', coal: 'Uhlie', gas: 'Plyn', store: 'Úložisko', imp: 'Import' };
export const MONTH_PRICE = [140.21, 153.41, 104.53, 84.37, 77.15, 79.14, 98.51, 80.08, 94.25, 97.76, 120.08, 110.74];
export const CREDIT = 12e9; // state credit line: the player may go into debt down to -12 bn EUR (4.5 % interest per year)
export const DEM_SHAPE = [0.80, 0.92, 1.05, 1.02, 1.16, 1.05]; // share of daily demand per 4-hour block (evening peak)
export const PRICE_SHAPE = [0.82, 0.95, 1.02, 0.95, 1.22, 1.04];
export const SLOT_LABELS = ['0–4', '4–8', '8–12', '12–16', '16–20', '20–24'];
export const MONTH_SHORT = ['jan', 'feb', 'mar', 'apr', 'máj', 'jún', 'júl', 'aug', 'sep', 'okt', 'nov', 'dec'];
export const MONTHS = ['januára', 'februára', 'marca', 'apríla', 'mája', 'júna', 'júla', 'augusta', 'septembra', 'októbra', 'novembra', 'decembra'];
export const MDAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
export const YEAR_SECONDS = 270; // one game year = 270 real seconds at 1×

/** Jaslovské Bohunice V2 – the starting (locked) plant */
export const STARTER = { name: 'JE Jaslovské Bohunice V2', lngLat: [17.683, 48.494] as [number, number], units: [505, 505] };

const G = '#1A7A43', B = '#2B6CA3', O = '#D9A21B', R = '#C0392B', P = '#7B55B8', Y = '#F2C230', S = '#8FD6F2', K = '#3C4248';
export interface IntroStep { kicker: string; title: string; text: string; bullets: { t: string; d: string; c: string }[] }
export const INTRO_STEPS: IntroStep[] = [
  { kicker: 'Vitaj v Nivis', title: 'Staň sa správcom energetiky Slovenska',
    text: 'Na 4 roky (2027 – 2030) rozhoduješ, odkiaľ bude mať Slovensko elektrinu. Cieľom je, aby krajina prosperovala: mala dosť elektriny, zarábala a bola čo najčistejšia.',
    bullets: [
      { t: 'Dosť elektriny', d: 'Pokry spotrebu všetkých obyvateľov bez výpadkov a bez drahého dovozu.', c: B },
      { t: 'Čistá krajina', d: 'Čím menej CO₂ vypúšťaš, tým viac ľudí sa prisťahuje a dostaneš bonus k tržbám.', c: G },
      { t: 'Zdravé financie', d: 'Stavby sú drahé – investuj múdro a príliš sa nezadlž.', c: O }
    ] },
  { kicker: 'Tvoj štart', title: 'Začínaš s jedinou elektrárňou',
    text: 'Máš len jadrovú elektráreň Jaslovské Bohunice V2 (2 bloky po 505 MW). Pokryje asi tretinu spotreby Slovenska. Zvyšok musíš dovážať zo zahraničia – je to o 15 % drahšie a dovezená elektrina je špinavšia (400 g CO₂/kWh).',
    bullets: [
      { t: 'Spotreba Slovenska ≈ 2 900 MW', d: 'V zime viac, v lete menej. Rastie s počtom obyvateľov a s elektrifikáciou.', c: B },
      { t: 'Bohunice ≈ 950 MW', d: 'Jadro vyrába stabilne, no raz ročne má každý blok odstávku na výmenu paliva.', c: P },
      { t: 'Rozdiel = dovoz', d: 'Na začiatku máš 3 mld. € a môžeš si požičať až 12 mld. € (úrok 4,5 % ročne).', c: R }
    ] },
  { kicker: 'Ako funguje výroba', title: 'Žiadna elektráreň nevyrába stále rovnako',
    text: 'Hra simuluje každý deň počasie a stav elektrární. Deň má 6 blokov po 4 hodiny – v grafe hore vidíš, že v noci slnko nevyrába a večer je špička spotreby aj ceny.',
    bullets: [
      { t: 'Slnko ≈ 11 % roka', d: 'Svieti len cez deň, v lete oveľa viac ako v zime, mraky výrobu znižujú. Na juhu je slnka najviac.', c: Y },
      { t: 'Vietor ≈ 24 % roka', d: 'Niekedy nefúka vôbec, pri víchrici sa turbíny zastavia. Na kopcoch fúka viac.', c: S },
      { t: 'Voda ≈ 35 % roka', d: 'Najviac na jar, keď sa topí sneh. V suchu menej. Stavať sa dá len na rieke.', c: B },
      { t: 'Jadro ≈ 90 % roka', d: 'Stabilné, no má odstávky a poruchy. Stojí 10 mld. € a stavia sa 2 roky. Potrebuje rieku na chladenie.', c: P },
      { t: 'Uhlie', d: 'Vyrába, kedy chceš, ale vypúšťa veľa CO₂ a platíš za palivo aj emisné povolenky.', c: K },
      { t: 'Batérie a prečerpávacie VE', d: 'Nevyrábajú, ale presúvajú energiu: nabijú sa, keď je lacná, a vybijú večer v špičke. Časť energie sa pri tom stratí.', c: G }
    ] },
  { kicker: 'Peniaze', title: 'Elektrinu predávaš na burze',
    text: 'Za každú vyrobenú megawatthodinu dostaneš aktuálnu burzovú cenu. Tá sa mení každý deň podľa počasia, ceny plynu, emisných povoleniek a udalostí vo svete (priemer ~100 €/MWh).',
    bullets: [
      { t: 'Bonus za čistú energiu', d: 'Pri vysokom podiele čistej energie dostaneš k tržbám bonus až ×1,2. Pri špinavej energii naopak prídeš o 5 %.', c: G },
      { t: 'Výdavky', d: 'Dovoz, palivo, emisné povolenky, údržba elektrární, dane a úroky z úveru.', c: R },
      { t: 'Prebytok sa vyváža', d: 'Keď vyrobíš viac, ako krajina spotrebuje, predáš to do zahraničia.', c: B }
    ] },
  { kicker: 'Ľudia a CO₂', title: 'Ľudia idú tam, kde je čistý vzduch',
    text: 'Každý deň sa niekto prisťahuje a niekto odíde. Rozhoduje hlavne to, koľko CO₂ krajina vypúšťa.',
    bullets: [
      { t: 'Pod 200 g CO₂/kWh ľudia prichádzajú', d: 'Nad touto hranicou odchádzajú. Odháňajú ich aj výpadky prúdu a veľmi drahá elektrina.', c: G },
      { t: 'Viac ľudí = vyššia spotreba', d: 'Rastúca krajina potrebuje viac elektriny – musíš stavať priebežne.', c: B },
      { t: 'Udalosti', d: 'Sucho, povodne, horúčavy, mrazy, víchrice či plynová kríza ti môžu skomplikovať rok.', c: O }
    ] },
  { kicker: 'Ovládanie', title: 'Ako hrať',
    text: 'Každý rok trvá asi 4,5 minúty. Na konci roka dostaneš známku A – E za ekonomiku, ekológiu, spoľahlivosť a spokojnosť ľudí.',
    bullets: [
      { t: 'Mapa', d: 'Ťahaním ju posúvaš, pravým tlačidlom otáčaš, kolieskom približuješ. Na mobile prstami.', c: B },
      { t: 'Stavanie', d: 'Potiahni elektráreň z panela na mapu. Zelená = dá sa stavať, červená ti povie prečo nie.', c: G },
      { t: 'Detail a búranie', d: 'Klikni na elektráreň a uvidíš jej výkon a stav. Potiahni ju späť na panel a zbúraš ju.', c: O },
      { t: 'Misie', d: 'Každý rok máš 2 misie podľa skutočných cieľov Slovenska. Za splnenie dostaneš odmenu, za nesplnenie cieľa 2030 pokutu.', c: G },
      { t: 'Čas', d: 'Hore môžeš hru pozastaviť alebo zrýchliť na 2× či 4×.', c: K }
    ] }
];

// ---------- formatting (Slovak) ----------
export function fmtNum(n: number): string { const v = Math.round(n); return (v < 0 ? '−' : '') + Math.abs(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0'); }
export function fmtTons(t: number): string { if (t >= 1e6) return (t / 1e6).toFixed(2).replace('.', ',') + ' mil. t'; if (t >= 1e3) return Math.round(t / 1e3) + ' tis. t'; return fmtNum(t) + ' t'; }
export function fmtMoney(v: number): string { const a = Math.abs(v), sg = v < 0 ? '−' : ''; if (a >= 1e9) return sg + (a / 1e9).toFixed(2).replace('.', ',') + ' mld. €'; if (a >= 1e6) return sg + Math.round(a / 1e6) + ' mil. €'; return sg + fmtNum(a) + ' €'; }
