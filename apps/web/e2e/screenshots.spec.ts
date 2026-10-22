import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

/**
 * Regenerates the images used by the README.
 *
 * Kept out of the normal run — it writes files into the repository — and enabled with
 * `CAPTURE_SCREENSHOTS=1 pnpm --filter @plan-b/web test:e2e screenshots`. Keeping it as a
 * Playwright spec rather than a loose script means the documentation screenshots are produced
 * by the same build the E2E suite verifies.
 */

// The web package is ESM, so `__dirname` is not in scope here.
const OUTPUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../docs');

test.skip(!process.env.CAPTURE_SCREENSHOTS, 'set CAPTURE_SCREENSHOTS=1 to regenerate docs images');

test.use({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 2 });

test.beforeAll(async () => {
  await mkdir(OUTPUT, { recursive: true });
});

test.beforeEach(async ({ page }) => {
  // Documentation images must not depend on whether a backend happens to be running.
  await page.route('**/api/health', (route) => route.abort());

  await page.addInitScript(() => window.localStorage.clear());
  await page.goto('/');
  await expect(page.getByRole('application', { name: /planta baixa/i })).toBeVisible();
  await page.waitForTimeout(900);
});

test('plan view', async ({ page }) => {
  await page.screenshot({ path: path.join(OUTPUT, 'editor-2d.png') });
});

test('three-dimensional view', async ({ page }) => {
  await page.getByRole('radio', { name: '3D' }).click();
  await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(OUTPUT, 'editor-3d.png') });
});

test('split view', async ({ page }) => {
  await page.getByRole('radio', { name: 'Dividido' }).click();
  await page.waitForTimeout(2500);
  // The plan pane just got narrower; reframe it so the whole apartment is in shot.
  await page.keyboard.press('Shift+F');
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUTPUT, 'editor-split.png') });
});

test('project library', async ({ page }) => {
  await page.getByRole('link', { name: 'Projetos' }).click();
  await expect(page.getByRole('heading', { name: 'Seus projetos' })).toBeVisible();
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUTPUT, 'projects.png') });
});
