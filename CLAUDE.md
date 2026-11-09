# Pokyny pre agenta – Nivis (MapLibre)

- Najprv si celé prečítaj `BRIEF.md`, potom pozri `reference/screenshots/` a `reference/Main.dc.html` (šablóna UI hore, logika v `<script type="text/x-dc">` dole).
- Postupuj po míľnikoch z `BRIEF.md` (bod 7). Po každom: `npm test` + `npm run build` musia prejsť, potom commit a krátke zhrnutie (čo funguje, čo nie).
- Simuláciu prenášaj verne – čísla, vzorce, pravdepodobnosti, texty. Nevymýšľaj nové pravidlá okrem tých, ktoré sú v `BRIEF.md` výslovne označené ako „nové“.
- Všetky texty pre hráča sú po slovensky; kód, názvy premenných a commity po anglicky.
- Kontrola balansu pôvodnej hry: `cd reference/balance && node simtest.js main-logic.js none` (a `green`). Port musí dávať rovnaké výsledky (±3 body).
- Žiadne API kľúče do repozitára. Voliteľný MapTiler kľúč len cez `.env` (`VITE_MAPTILER_KEY`) a `.env` v `.gitignore`.
- Vizuálnu kontrolu rob Playwright screenshotom (desktop 1280×800 a mobil 390×844) a pozri si ho, než míľnik označíš za hotový.
- Ak niečo v zadaní nejde (napr. Overpass neodpovedá), použi fallback z `reference/nivis-sk.json` a napíš to do zhrnutia.
