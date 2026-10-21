import { expect, test, type Page } from '@playwright/test';

/**
 * End-to-end coverage of the flows the product is judged on: open the studio without an
 * account, edit the plan, see the edit in 3D, undo it, and get the work back out.
 *
 * The suite drives the real canvas with real pointer events rather than reaching into the
 * store, so it fails if hit-testing, snapping or the render loop regress.
 */

const STATUS_BAR = 'footer';

/**
 * Centre of the demo apartment in plan coordinates.
 *
 * `fitBounds` centres the view on the middle of the drawing's bounding box, and the demo's
 * envelope spans (-0.1, -0.1) to (9.1, 7.1) once wall thickness is taken into account.
 */
const PLAN_CENTER = { x: 4.5, y: 3.5 };

interface Point {
  x: number;
  y: number;
}

async function canvasBox(
  page: Page,
): Promise<{ x: number; y: number; width: number; height: number }> {
  const box = await page.locator('canvas').first().boundingBox();
  if (!box) throw new Error('plan canvas not found');
  return box;
}

/**
 * Converts a point in meters into viewport pixels.
 *
 * Reading the live zoom out of the view controls instead of hard-coding pixel offsets is what
 * keeps these tests meaningful: they describe *what* is being clicked ("the sofa", "bare
 * floor") rather than where it happened to land on one particular screen size.
 */
async function worldPoint(page: Page, world: Point, center: Point = PLAN_CENTER): Promise<Point> {
  await page.keyboard.press('Shift+F');

  const readout = await page.getByText(/px\/m$/).innerText();
  const zoom = Number.parseFloat(readout);
  expect(Number.isFinite(zoom)).toBe(true);

  const box = await canvasBox(page);

  return {
    x: box.x + (world.x - center.x) * zoom + box.width / 2,
    y: box.y + (world.y - center.y) * zoom + box.height / 2,
  };
}

async function clickWorld(page: Page, world: Point): Promise<void> {
  const point = await worldPoint(page, world);
  await page.mouse.click(point.x, point.y);
}

const inspector = (page: Page) => page.getByRole('complementary', { name: 'Propriedades' });

test.beforeEach(async ({ page }) => {
  // Playwright gives every test its own browser context, so local storage already starts
  // empty and the demo apartment is reseeded on each run.
  await page.goto('/');
  await expect(page.getByRole('application', { name: /planta baixa/i })).toBeVisible();
});

test('opens straight into the furnished demo without any sign-in', async ({ page }) => {
  await expect(page.getByRole('button', { name: 'Apartamento Aurora' })).toBeVisible();
  await expect(page.locator(STATUS_BAR)).toContainText(/Ambientes\s*5/);
  await expect(page.locator(STATUS_BAR)).toContainText(/Móveis\s*25/);
  await expect(page.getByText('Salvo')).toBeVisible();

  // No login wall of any kind.
  await expect(page.getByRole('textbox', { name: /senha|password/i })).toHaveCount(0);
});

test('selects a piece of furniture and shows it in the inspector', async ({ page }) => {
  // The living room sofa sits at (1.85, 1.15) in the demo plan.
  await clickWorld(page, { x: 1.85, y: 1.15 });

  await expect(inspector(page)).toContainText('Móvel');
  await expect(inspector(page)).toContainText('Sofá da sala');
  await expect(inspector(page).getByLabel('Largura')).toHaveValue('220');
});

test('selects a room by clicking bare floor', async ({ page }) => {
  await clickWorld(page, { x: 4.6, y: 3.6 });

  await expect(inspector(page)).toContainText('Ambiente');
  await expect(inspector(page)).toContainText('Sala de estar');
});

test('draws a wall and undoes it', async ({ page }) => {
  await expect(page.locator(STATUS_BAR)).toContainText(/Paredes\s*50,80/);

  await page.getByRole('button', { name: 'Parede', exact: true }).click();

  // Two clicks on empty ground south of the building, three metres apart.
  const from = await worldPoint(page, { x: 1, y: -1.2 });
  const to = await worldPoint(page, { x: 4, y: -1.2 });
  await page.mouse.click(from.x, from.y);
  await page.mouse.click(to.x, to.y);
  await page.keyboard.press('Escape');

  await expect(page.locator(STATUS_BAR)).toContainText(/Paredes\s*53,80/);
  await expect(page.getByText('Alterações não salvas')).toBeVisible();

  await page.keyboard.press('Control+z');
  await expect(page.locator(STATUS_BAR)).toContainText(/Paredes\s*50,80/);

  await page.keyboard.press('Control+Shift+z');
  await expect(page.locator(STATUS_BAR)).toContainText(/Paredes\s*53,80/);
});

test('closes a rectangle of walls into a new room', async ({ page }) => {
  await expect(page.locator(STATUS_BAR)).toContainText(/Ambientes\s*5/);

  await page.getByRole('button', { name: 'Ambiente', exact: true }).click();

  const from = await worldPoint(page, { x: -0.5, y: -1.5 });
  const to = await worldPoint(page, { x: 3.5, y: -0.5 });
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await page.mouse.up();

  await expect(page.locator(STATUS_BAR)).toContainText(/Ambientes\s*6/);
});

test('places a catalog item on the plan', async ({ page }) => {
  await expect(page.locator(STATUS_BAR)).toContainText(/Móveis\s*25/);

  await page.getByRole('button', { name: /^Poltrona/ }).click();
  await clickWorld(page, { x: 4.6, y: 3.6 });

  await expect(page.locator(STATUS_BAR)).toContainText(/Móveis\s*26/);
});

test('deletes the selection and restores it with undo', async ({ page }) => {
  await clickWorld(page, { x: 1.85, y: 1.15 });
  await expect(inspector(page)).toContainText('Sofá da sala');

  await page.keyboard.press('Delete');
  await expect(page.locator(STATUS_BAR)).toContainText(/Móveis\s*24/);

  await page.keyboard.press('Control+z');
  await expect(page.locator(STATUS_BAR)).toContainText(/Móveis\s*25/);
});

test('switches between the plan, the 3D scene and the split view', async ({ page }) => {
  await expect(page.locator('canvas')).toHaveCount(1);

  await page.getByRole('radio', { name: '3D' }).click();
  await expect(page.getByRole('radio', { name: 'Perspectiva' })).toBeVisible();
  await expect(page.locator('canvas')).toHaveCount(1);

  await page.getByRole('radio', { name: 'Dividido' }).click();
  await expect(page.locator('canvas')).toHaveCount(2);

  await page.getByRole('radio', { name: 'Planta' }).click();
  await expect(page.locator('canvas')).toHaveCount(1);
});

test('changes a room material', async ({ page }) => {
  await clickWorld(page, { x: 4.6, y: 3.6 });
  await expect(inspector(page)).toContainText('Ambiente');

  await inspector(page).getByRole('radio', { name: 'Mármore' }).click();

  await expect(inspector(page)).toContainText('Mármore');
  await expect(page.getByText('Alterações não salvas')).toBeVisible();
});

test('autosaves to local storage and restores after a reload', async ({ page }) => {
  await page.getByRole('button', { name: 'Apartamento Aurora' }).click();

  const input = page.getByLabel('Nome do projeto');
  await input.fill('Casa da Serra');
  await input.press('Enter');

  // Wait for the rename to actually dirty the document before waiting for the save to land.
  await expect(page.getByText('Alterações não salvas')).toBeVisible();
  await expect(page.getByText('Salvo')).toBeVisible({ timeout: 15_000 });

  await page.reload();
  await expect(page.getByRole('button', { name: 'Casa da Serra' })).toBeVisible();
});

test('exports the project as JSON', async ({ page }) => {
  const downloadPromise = page.waitForEvent('download');

  await page.getByRole('button', { name: 'Exportar' }).click();
  await page.getByRole('menuitem', { name: 'Exportar JSON' }).click();

  const download = await downloadPromise;
  expect(download.suggestedFilename()).toContain('.spacecraft.json');
});

test('exports the plan as a PNG image', async ({ page }) => {
  const downloadPromise = page.waitForEvent('download');

  await page.getByRole('button', { name: 'Exportar' }).click();
  await page.getByRole('menuitem', { name: 'Planta em PNG' }).click();

  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.png$/);
});

test('captures the 3D view as a PNG', async ({ page }) => {
  await page.getByRole('radio', { name: '3D' }).click();
  // Give the scene a frame or two to register its renderer before capturing it.
  await expect(page.getByRole('radio', { name: 'Perspectiva' })).toBeVisible();
  await page.waitForTimeout(1500);

  const downloadPromise = page.waitForEvent('download');

  await page.getByRole('button', { name: 'Exportar' }).click();
  await page.getByRole('menuitem', { name: 'Captura da vista 3D' }).click();

  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/-3d-.*\.png$/);
});

test('guides the first step on a blank project', async ({ page }) => {
  await page.getByRole('link', { name: 'Projetos' }).click();
  await page.getByRole('button', { name: 'Novo projeto' }).click();

  await expect(page.getByRole('button', { name: 'Novo projeto' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Planta em branco' })).toBeVisible();
  await expect(page.locator(STATUS_BAR)).toContainText(/Ambientes\s*0/);

  await page
    .getByRole('listitem')
    .filter({ hasText: 'Comece por um ambiente' })
    .getByRole('button', { name: 'Usar' })
    .click();

  // An empty level frames a 10 x 10 m area centred on the origin.
  const origin = { x: 0, y: 0 };
  const from = await worldPoint(page, { x: -2, y: -1.5 }, origin);
  const to = await worldPoint(page, { x: 2, y: 1.5 }, origin);

  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 10 });
  await page.mouse.up();

  await expect(page.locator(STATUS_BAR)).toContainText(/Ambientes\s*1/);
  await expect(page.getByRole('heading', { name: 'Planta em branco' })).toHaveCount(0);
});

test('lists the project in the library', async ({ page }) => {
  await page.getByRole('link', { name: 'Projetos' }).click();

  await expect(page.getByRole('heading', { name: 'Seus projetos' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Apartamento Aurora' })).toBeVisible();
  await expect(page.getByText('Salvando neste navegador')).toBeVisible();
});

test('offers the shortcut reference and the layer toggles from the keyboard', async ({ page }) => {
  await page.keyboard.press('?');
  await expect(page.getByRole('dialog', { name: 'Atalhos do teclado' })).toBeVisible();
  await page.keyboard.press('Escape');

  const grid = page.getByRole('button', { name: 'Grade' });
  await expect(grid).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('g');
  await expect(grid).toHaveAttribute('aria-pressed', 'false');

  await page.keyboard.press('h');
  await expect(page.locator(STATUS_BAR)).toBeVisible();
});
