// Random events (ported 1:1 from Component.eventDefs)
export interface EventDef { id: string; name: string; p: number; len: [number, number]; months: number[] | null; bg: string; text: string }

export const EVENT_DEFS: EventDef[] = [
  { id: 'gas', name: 'Plynová kríza v Európe', p: 0.0012, len: [40, 70], months: null, bg: '#B3541E', text: 'Cena plynu vyletela – drahší plyn zdražuje elektrinu v celej Európe.' },
  { id: 'drought', name: 'Sucho', p: 0.004, len: [30, 50], months: [6, 7, 8], bg: '#B07A1E', text: 'Rieky majú menej vody – vodné elektrárne vyrábajú menej a jadrové musia znížiť výkon (teplá voda na chladenie).' },
  { id: 'flood', name: 'Povodne', p: 0.003, len: [7, 12], months: [3, 4, 5, 6], bg: '#2B6CA3', text: 'Rozvodnené rieky – vodné elektrárne idú naplno, no niektoré stavby pri riekach museli odstaviť.' },
  { id: 'heat', name: 'Horúčava', p: 0.005, len: [8, 15], months: [6, 7, 7, 8], bg: '#C0392B', text: 'Klimatizácie zvyšujú spotrebu, solárne panely v horúčave strácajú účinnosť a teplá voda obmedzuje chladenie.' },
  { id: 'cold', name: 'Tuhý mráz', p: 0.005, len: [6, 12], months: [0, 1, 11], bg: '#3A6EA5', text: 'Kúrenie zvyšuje spotrebu a ceny elektriny rastú.' },
  { id: 'storm', name: 'Víchrica', p: 0.0025, len: [2, 3], months: null, bg: '#5B4A8B', text: 'Príliš silný vietor – turbíny sa z bezpečnosti zastavili, niektoré sa poškodili.' },
  { id: 'dunkel', name: 'Bezvetrie a hmla', p: 0.004, len: [6, 10], months: [0, 1, 10, 11], bg: '#5C6670', text: 'Nefúka a je zamračené – slnko a vietor takmer nevyrábajú, cena rastie.' },
  { id: 'hail', name: 'Krupobitie', p: 0.003, len: [1, 2], months: [5, 6, 7], bg: '#4A6274', text: 'Ľadovec poškodil solárne panely – oprava potrvá niekoľko dní.' },
  { id: 'glut', name: 'Prebytok zelenej energie v Európe', p: 0.003, len: [5, 9], months: [3, 4, 5, 6, 7], bg: '#2E9A57', text: 'Veterno a slnečno v celej Európe – burzová cena prudko klesla.' },
  { id: 'ets', name: 'Zdraženie emisných povoleniek', p: 0.001, len: [80, 120], months: null, bg: '#7A4E2D', text: 'Vypúšťanie CO₂ je drahšie – uhlie a plyn sa menej oplatia.' }
];
