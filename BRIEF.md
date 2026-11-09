# Nivis na MapLibre – zadanie pre code agenta

## 1. O čo ide

**Nivis** je vzdelávacia strategická hra pre stredoškolákov (súťaž „Hackni vedu“, tím NiVis, Gymnázium Šrobárová 1, Košice). Hráč je 4 roky (2027–2030) ministrom energetiky Slovenska: stavia elektrárne na 3D mape, simulácia počíta každý deň výrobu, spotrebu, burzovú cenu, CO₂ a pohyb obyvateľov a na konci roka hráč dostane vyhodnotenie so známkou A–E, grafmi a otázkami.

Hra dnes existuje ako jeden súbor `reference/Main.dc.html` (Three.js r147 + vlastný, ručne modelovaný terén). **Úloha: prepísať ju na samostatnú webovú aplikáciu, kde mapa beží na MapLibre GL JS so skutočnými mapovými podkladmi (OpenStreetMap) a skutočným 3D terénom.** Simulácia, pravidlá, texty a UI majú zostať rovnaké (1 : 1), mení sa mapa a „kreslenie sveta“.

Prečo samostatná aplikácia: v claude.ai artefakte sú všetky externé požiadavky blokované (test: OpenFreeMap, AWS terrain tiles, tile.openstreetmap.org aj MapTiler → `TypeError: Failed to fetch`). Aplikácia preto musí bežať na vlastnom hostingu (GitHub Pages / Netlify / Vercel) alebo lokálne cez `npm run dev`.

Jazyk hry: **slovenčina** (všetky texty v UI ponechať tak, ako sú v referencii).

## 2. Referenčné súbory (priečinok `reference/`)

| Súbor | Čo obsahuje |
|---|---|
| `Main.dc.html` | Celá pôvodná hra. Hore šablóna UI (HTML s dierami `{{ }}`, `<sc-if>`, `<sc-for>` – formát Claude Design, správa sa ako JSX), dole `<script type="text/x-dc">` s triedou `Component` (všetka logika). |
| `Mobil.dc.html` | Mobilné rozloženie 390×844 – importuje Main s `layout="portrait"`. |
| `nivis-sk.json` | Hranica SR (lon/lat), susedné krajiny, 28 riek, 8 jazier, 96 ciest (Natural Earth 10m + ručne dokreslené rieky Ondava, Laborec, Bodrog, Poprad, Orava, Topľa, Kysuca, Rimava). |
| `screenshots/` | Ako hra vyzerá (hra, stavanie, intro, ročná správa, mobil). |
| `balance/main-logic.js` + `balance/simtest.js` | Vytiahnutá logika a testovací skript: `node simtest.js main-logic.js none` / `green`. Slúži na kontrolu, že port simulácie dáva rovnaké výsledky. |

### Dôležité metódy v `Main.dc.html` (trieda `Component`)

- **Konštanty a dáta:** `constructor` – `items` (typy elektrární a ich ceny/výkony/CO₂), `introSteps`, `CO2`, `COLORS`, `LABELS`, `MONTH_PRICE`, `CREDIT`, `DEM_SHAPE`, `PRICE_SHAPE`, `MDAYS`.
- **Simulácia (prenesie sa takmer bez zmeny):** `newGame`, `startYear`, `scheduleOutages`, `eventDefs`, `stepDay`, `startEvent`, `endYear`, `missionDefs`, `ozeShare`, `onModalAction`, `resetGame`, `removePlant`, `stackCols`, `pushHud`, `refreshInfo`, `renderVals` (pripravuje všetky hodnoty pre UI vrátane grafov a kvízu).
- **Pravidlá stavania:** `evaluate(type, x, z, ignore)` + pomocné `nearestRiver`, `inLake`, `inside`, `windFactor`, `solarFactor`, `sampleH`, `urban`.
- **3D modely:** `turbine`, `buildModel(type)` (vietor, voda, jadro, batéria, prečerpávačka, slnko, uhlie – procedurálne Three.js), `ghost`, `makeSmoke`, `setConstruction` (lešenie počas stavby).
- **Ovládanie:** `startNew`, `onCanvasDown`, `beginMove`, `onPointerMove`, `onPointerUp` (ťahanie z panela, presun, zbúranie potiahnutím späť), `frame` (animácia).
- **Toto sa NEprenáša** (nahradí MapLibre): `geo`, `hash`, `vnoise`, `fbm`, `ridged`, `baseKm`, `build(data)` (generovanie terénu, riek, ciest, miest, stromov, áut), `initScene`, `makeLabel`, `setView`, `zoomBy`, projekcia `P(lon, lat)`.

### Kontrolné čísla simulácie (musia sedieť aj po porte, ±3 body kvôli náhode)

```
bez stavania (none):  každý rok známka D ≈ 50, CO₂ ≈ 285 g/kWh, dovoz ≈ 18 TWh
zelená stratégia:     2027 C 58 → 2028 C 69 → 2029 B 77 → 2030 B 77, OZE 29 %, CO₂ ≈ 181 g/kWh
```

## 3. Cieľová architektúra

**Stack:** Vite + TypeScript + Preact (šablóna v referencii sa prirodzene prepíše do JSX) + `maplibre-gl` (aktuálna stabilná verzia z npm) + `three` (na 3D modely elektrární cez custom layer) + `@turf/turf` (vzdialenosti v km). Testy: Vitest (simulácia) + Playwright (smoke test UI).

```
src/
  sim/        čistá logika bez DOM: constants.ts, sim.ts (newGame, stepDay, endYear…), missions.ts, events.ts, report.ts
  rules/      evaluate.ts – pravidlá stavania nad lon/lat (rieky, mestá, terén, chránené územia)
  map/        map.ts (MapLibre, štýl, terén, maska mimo SR), layers.ts, camera.ts
  models/     three-layer.ts (custom layer), models.ts (port buildModel/turbine/smoke/lešenie)
  ui/         Hud.tsx, Dock.tsx (panel stavieb), InfoCard.tsx, Intro.tsx, YearReport.tsx, Toast.tsx, Legend.tsx
  data/       sk-border.json, rivers.json, lakes.json, cities.json, protected.json
scripts/      fetch-osm.ts (Overpass → data/*.json), voliteľne build-pmtiles.sh
```

Simulácia nesmie závisieť od mapy – `sim` dostane zoznam elektrární `{type, units, lngLat, loc (lokálny faktor), build…}` a vracia stav. UI a mapa sa prekresľujú zo stavu.

## 4. Mapa

### 4.1 Podklad
- **Vektorové dlaždice: OpenFreeMap** (bez kľúča, zadarmo): `https://tiles.openfreemap.org/styles/liberty` (alebo `positron`/`bright` ako základ). Štýl si stiahni do projektu (`public/style.json`) a uprav:
  - názvy po slovensky: `["coalesce", ["get", "name:sk"], ["get", "name"]]`,
  - **rieky musia byť zreteľné** (to bola hlavná požiadavka): `waterway` vrstvy výraznejšie modré (#2B7BB9), hrubšie podľa zoomu, názvy riek kurzívou pozdĺž toku; vodné plochy #8EC3E6,
  - stlmiť POI a nepotrebné štítky, aby mapa nepôsobila preplnene,
  - 3D budovy (`fill-extrusion` z vrstvy `building`) od zoomu ~14.
- **Terén (raster-dem):** AWS Terrain Tiles (Terrarium, verejné, bez kľúča): `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png`, `encoding: "terrarium"`, `tileSize: 256`, `maxzoom: 15`. `map.setTerrain({source, exaggeration: 1.4})` + vrstva `hillshade` + `setSky` (hmla/obloha). Alternatíva s kľúčom: MapTiler `terrain-rgb-v2` (kľúč cez `.env`, `VITE_MAPTILER_KEY`).
- **Maska mimo Slovenska:** polygón „svet mínus SR“ z `nivis-sk.json.border` ako `fill` s bielou/šedou 55 % priehľadnosťou + hrubšia hraničná čiara. `maxBounds` ≈ [16.3, 47.4] – [23.0, 49.9].
- **Atribúcia** (povinná): © OpenStreetMap contributors, OpenFreeMap, © OpenMapTiles, terén: Mapzen/AWS Terrain Tiles (zdroje: SRTM, EU-DEM…).

### 4.2 Kamera a ovládanie
- Štart: celé Slovensko, `center [19.5, 48.7]`, `zoom ≈ 6.8`, `pitch 50`, `bearing -10`. Tlačidlo „celé Slovensko“, +/−.
- Ťahanie = posun, pravé tlačidlo / Ctrl+ťahanie = otáčanie a náklon, koliesko = zoom; mobil: 1 prst posun, 2 prsty zoom/otáčanie. `maxPitch 75`.
- Obmedzenie: `minZoom 6`, `maxZoom 16`.

### 4.3 Dáta pre pravidlá (nesmú závisieť od toho, čo je práve na obrazovke)
Pravidlá **nepočítať cez `queryRenderedFeatures`** (závisí od zoomu a výrezu). Pripraviť statické GeoJSON pri builde skriptom `scripts/fetch-osm.ts` (Overpass API, area = Slovensko, `admin_level=2`, ISO SK) a uložiť do `src/data/`:
- `rivers.json` – `waterway=river` (zlúčené podľa mena, zjednodušené na ~50 m, `turf.simplify`), aj `waterway=canal` (Vážsky kanál, Gabčíkovo),
- `lakes.json` – `natural=water` + `water=reservoir|lake` väčšie ako 0,5 km² (Liptovská Mara, Oravská priehrada, Zemplínska šírava…),
- `cities.json` – `place=city|town` s počtom obyvateľov → polomer zástavby `R ≈ 0.9 + sqrt(pop/1000)*0.18 km` (prípadne priamo polygóny `landuse=residential` väčšie ako 0,2 km²),
- `protected.json` – `boundary=national_park` (TANAP, NAPANT, Pieniny, Malá Fatra, Muránska planina, Slovenský raj, Poloniny, Veľká Fatra, Slovenský kras),
- fallback ak Overpass nejde: rieky a hranica z `reference/nivis-sk.json`.

### 4.4 Pravidlá stavania (port `evaluate`, vzdialenosti v km cez turf)
Zachovať všetky hlášky v slovenčine z referencie. Prahy (rovnaké ako dnes, len reálne km):
| Typ | Pravidlo |
|---|---|
| všetky | vnútri SR; nie v jazere (odstup 1,5 km, vodná 0); nie bližšie ako 3,5 km k inej elektrárni; neprekročiť úver −12 mld. €; nie v meste (batéria smie bližšie: `R*0.4+0.5`, ostatné `R*0.75+2`) |
| okrem vodnej | nie priamo na rieke (< 1,2 km) – „Tu tečie rieka X – vyber suché miesto“ |
| vodná | do 3,5 km od rieky → model sa prichytí na najbližší bod toku a natočí po prúde |
| jadrová | rieka do 6 km (chladenie) |
| prečerpávacia | nadmorská výška ≥ 550 m **z reálneho terénu** a rieka do 6 km; nové: prevýšenie ≥ 200 m v okruhu 3 km (navzorkovať 16 bodov) – hláška „Prečerpávacia VE potrebuje väčší výškový rozdiel“ |
| nové: veterná, uhoľná | nie v národnom parku – „Tu je národný park X – stavať sa tu nesmie“ |

- Výška terénu: `map.queryTerrainElevation(lngLat)` – **over si**, či vracia hodnotu vrátane `exaggeration` (ak áno, vydeľ). Dlaždice musia byť načítané; pre spoľahlivosť pridaj vlastný sampler, ktorý si dekóduje Terrarium PNG pre z=10 (`h = R*256 + G + B/256 − 32768`) a cachuje.
- `windFactor` – dnes podľa výšky a hrebeňov; nahradiť: `0.75 + 0.5 * clamp((výška − 150) / 900)` + bonus za otvorenú polohu (rozdiel voči priemeru okolia), výsledok 0.7–1.3. `solarFactor` – podľa zemepisnej šírky (juh lepší, ako dnes) mierne znížený v horách.
- `loc` faktor elektrárne sa posiela do simulácie (rovnako ako dnes).

## 5. 3D modely elektrární
- Jeden **MapLibre custom layer** (`type: "custom", renderingMode: "3d"`) so zdieľaným Three.js `WebGLRenderer` (`autoClear = false`) – podľa oficiálneho príkladu „Add a 3D model with three.js“. Každá elektráreň = `THREE.Group` umiestnená cez `MercatorCoordinate.fromLngLat(lngLat, výška)` a `meterInMercatorCoordinateUnits()`.
- Modely preniesť z `buildModel`/`turbine`/`makeSmoke`/`setConstruction` (procedurálne, bez externých GLTF). Mierka: modely sú „herné“, nie v reálnej veľkosti – na zoome 7 musí byť elektráreň viditeľná. Mierku počítaj zo zoomu (napr. `scale = clamp(2^(11 − zoom), 1, 40)` × základná veľkosť ~300 m), aby boli čitateľné z celej krajiny aj zblízka.
- Animácie: rotujúce lopatky (rýchlosť podľa aktuálneho vetra zo simulácie), dym z uhlia a pára z chladiacich veží jadra, blikanie pri odstávke, lešenie počas stavby. `map.triggerRepaint()` v slučke len keď hra beží.
- Výber (klik): paralelný GeoJSON zdroj bodov elektrární + neviditeľná `circle` vrstva → `queryRenderedFeatures` pri kliku → InfoCard. (Jednoduchšie a spoľahlivejšie ako raycasting cez custom layer.)
- Ghost pri ťahaní: polopriehľadný model zelený/červený + tooltip s `sub` textom z `evaluate` (napr. „Batériové úložisko 100 MW / 200 MWh · nabíja cez deň, vybíja večer · 60 mil. €“).
- Bohunice V2 (štartová, zamknutá): `[17.683, 48.494]`, 2 bloky po 505 MW.

## 6. UI
Prepísať šablónu z `Main.dc.html` do Preact komponentov, vzhľad zachovať (pozri screenshoty): písma Fredoka (nadpisy) + Nunito (text), farby z `COLORS`, zaoblené biele karty.
- **Horný HUD:** peniaze, % čistej energie, obyvatelia (+ príchody/odchody), dátum, rýchlosť 1×/2×/4×, pauza, CO₂ g/kWh, misie roka, graf dňa (6 blokov po 4 h).
- **Panel stavieb (dock):** položky z `items` – ťahanie na mapu (pointer events, funguje myšou aj dotykom).
- **InfoCard:** detail elektrárne (výkon, stav blokov, dôvod odstávky, ytd výroba).
- **Intro:** 6 krokov z `introSteps`.
- **Ročná správa:** známka, 4 skóre, misie, priemerný deň, mesiace, kvíz, otvorené otázky (všetko z `renderVals`).
- **Responzívne:** šírka < 700 px alebo výška > šírka → mobilné rozloženie z `Mobil.dc.html` (dock dole, HUD zúžený).

## 7. Míľniky (každý ukonči commitom a krátkym zhrnutím)
1. **Kostra + mapa:** Vite projekt, MapLibre s OpenFreeMap štýlom, terén, hillshade, obloha, maska mimo SR, výrazné rieky so slovenskými názvami, ovládanie kamery. Screenshot desktop + mobil.
2. **Simulácia:** port `src/sim` v TS + Vitest test, ktorý zopakuje `balance/simtest.js` (none/green) a overí kontrolné čísla z bodu 2.
3. **Dáta a pravidlá:** `scripts/fetch-osm.ts`, `src/data/*.json`, `evaluate` nad lon/lat + unit testy (napr. vodná na Váhu pri Piešťanoch OK, jadrová v strede Bratislavy NIE, prečerpávačka pri Čiernom Váhu OK, veterná v TANAPe NIE).
4. **3D modely + stavanie:** custom layer, ghost, drag & drop, presun, zbúranie, výber.
5. **UI:** HUD, dock, info, intro, ročná správa, kvíz, mobil.
6. **Doladenie + nasadenie:** výkon (cieľ 60 fps na bežnom notebooku; `pixelRatio ≤ 2`), atribúcia, `vite build`, nasadenie na GitHub Pages (workflow), README so spustením.
7. **Voliteľné – offline podklady:** `pmtiles extract` Slovenska (bbox 16.8,47.7,22.6,49.65, maxzoom 14) z Protomaps buildu + štýl `protomaps-themes-base`; terén z Copernicus DEM GLO-30 → `rio rgbify` → PMTiles. Hostovať staticky spolu s aplikáciou, aby hra fungovala aj v škole bez závislosti na cudzích serveroch.

## 8. Akceptačné kritériá
- Mapa ukazuje skutočné Slovensko s reálnym reliéfom (Tatry, Fatra, Podunajská nížina sú jasne rozpoznateľné), rieky sú výrazné a pomenované.
- Hra sa dá prejsť celé 4 roky; simulácia dáva kontrolné čísla z bodu 2.
- Všetky typy elektrární sa dajú postaviť ťahaním, pravidlá a slovenské hlášky fungujú, reálna výška ovplyvňuje vietor a prečerpávačky.
- Funguje na desktope (Chrome, Safari, Firefox) aj na mobile (iOS Safari, Android Chrome), na výšku aj na šírku.
- Žiadne API kľúče nie sú v repozitári; bez kľúča beží na OpenFreeMap + AWS terrain.
- `npm run dev`, `npm test`, `npm run build` prejdú bez chýb.
