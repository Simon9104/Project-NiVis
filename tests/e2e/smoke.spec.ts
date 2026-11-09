import { expect, test, type Page } from '@playwright/test';

async function ready(page: Page) {
  await page.goto('/');
  await page.waitForFunction(() => (window as any).__ready, null, { timeout: 120_000 });
}

/** drag a dock card onto a map coordinate with pointer events (works for mouse and touch layouts) */
async function dragTo(page: Page, type: string, ll: [number, number]) {
  return page.evaluate(async ([type, ll]) => {
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const ev = (t: string, x: number, y: number, target?: EventTarget) => (target || window).dispatchEvent(new PointerEvent(t, { clientX: x, clientY: y, bubbles: true, cancelable: true, button: 0, pointerId: 1, isPrimary: true }));
    const map = (window as any).__map; const card = document.querySelector(`[data-type=${type}]`)!; const cb = card.getBoundingClientRect();
    const p = map.project(ll); const cr = map.getContainer().getBoundingClientRect();
    ev('pointerdown', cb.left + 20, cb.top + 20, card); ev('pointermove', p.x + cr.left, p.y + cr.top); await sleep(250);
    const tip = (document.querySelector('[data-testid=tip]') as HTMLElement | null)?.innerText || '';
    ev('pointerup', p.x + cr.left, p.y + cr.top); await sleep(150);
    return tip;
  }, [type, ll] as const);
}

test('desktop: intro, building with rules, year report', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await ready(page);
  await expect(page.getByText('Staň sa správcom energetiky Slovenska')).toBeVisible();
  for (let i = 0; i < 5; i++) await page.getByTestId('modal-action').click();
  await expect(page.getByText('Ako hrať')).toBeVisible();
  await page.getByTestId('modal-action').click(); // Začať rok 2027
  await expect(page.locator('.nv-modal')).toHaveCount(0);
  await page.getByTestId('play').click(); // pause

  expect(await dragTo(page, 'wind', [20.15, 49.17])).toContain('Tu je národný park TANAP');
  expect(await dragTo(page, 'hydro', [17.84, 48.62])).toContain('na rieke Váh');
  await expect(page.getByTestId('toast')).toContainText('Výstavba začala: Vodná elektráreň na rieke Váh');
  expect(await page.evaluate(() => (window as any).__game.plants.length)).toBe(2);

  // run the rest of the year instantly and check the report
  await page.evaluate(() => { const g = (window as any).__game; while (!g.sim.yearDone) g.stepDay(false); });
  await expect(page.getByTestId('grade')).toHaveText(/[A-E]/);
  await expect(page.getByText('Otázky na zamyslenie')).toBeVisible();
  await page.getByTestId('modal-action').click();
  await expect(page.getByTestId('date')).toContainText('2028');
});

test('mobile portrait: dock at the bottom, touch drag builds', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await ready(page);
  await page.getByText('Preskočiť úvod').click();
  const dock = await page.locator('.nv-dock').boundingBox();
  expect(dock!.y).toBeGreaterThan(500);
  expect(await dragTo(page, 'solar', [18.3, 48.0])).toContain('Solárny park');
  expect(await page.evaluate(() => (window as any).__game.plants.length)).toBe(2);
});
