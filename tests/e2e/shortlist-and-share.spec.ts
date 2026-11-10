import { test, expect, type Page } from '@playwright/test';

// Mirrors the enter3D helper in explorer.spec.ts / furniture-hotspots.spec.ts
// — kept local rather than shared, since these spec files intentionally stay
// independent (see explorer.spec.ts's own comment on why each starts fresh).
async function enter3D(page: Page) {
  await page.getByRole('button', { name: 'Enter 3D' }).first().click();
  await expect(page.getByRole('dialog', { name: /Interactive 3D house explorer/i })).toBeVisible();
  await page.waitForTimeout(500);
}

const SHORTLIST_STORAGE_KEY = 'ai-house:shortlist:v1';

/**
 * The saved-pieces panel itself.
 *
 * Every assertion about the list is scoped to this region rather than to the
 * page: the landing page stays in the document behind the explorer overlay
 * and shares the same vocabulary — the living room's design story sentence
 * names "a low curved warm-beige modular sofa", and "Living Room" appears in
 * a heading, a comparison label, a room <select>, and the minimap. A
 * page-wide getByText would match those instead of the list, and would keep
 * matching them after the list had changed.
 */
const savedPanel = (page: Page) => page.getByRole('region', { name: 'Saved pieces' });

/**
 * Seeds a saved list the way a previous visit would have left one.
 *
 * The Save button itself lives on an in-scene furniture hotspot, and this
 * codebase deliberately never drives 3D-projected clicks from a test (see
 * furniture-hotspots.spec.ts): a software-rendered GPU makes them flaky in a
 * way real hardware wouldn't. Seeding storage exercises the half that can
 * actually break in the DOM — restoring the list, rendering every row with
 * its real retailer link, removing, and exporting — while the store's own
 * save/toggle path is covered exhaustively in tests/unit/shortlist-store.
 */
async function seedShortlist(page: Page, ids: string[]) {
  await page.addInitScript(
    ([key, value]) => {
      window.localStorage.setItem(key as string, value as string);
    },
    [SHORTLIST_STORAGE_KEY, JSON.stringify(ids)] as const,
  );
}

test.describe('saved pieces', () => {
  test('restores a saved list and shows every piece with a real retailer link', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await seedShortlist(page, ['living-sofa', 'living-rug']);
    await page.goto('/');
    await enter3D(page);

    const savedButton = page.getByRole('button', { name: /Saved \(2\)/ });
    await expect(savedButton).toBeVisible();
    await savedButton.click();

    const panel = savedPanel(page);
    await expect(panel).toBeVisible();
    await expect(panel.getByText('Living Room', { exact: true })).toBeVisible();
    await expect(panel.getByText('Modular sofa')).toBeVisible();
    await expect(panel.getByText('Wool area rug')).toBeVisible();

    // Every row is a genuinely clickable, safely-targeted outbound link.
    const links = panel.locator('a');
    await expect(links).toHaveCount(2);
    for (const link of await links.all()) {
      expect(await link.getAttribute('href')).toMatch(/^https:\/\//);
      await expect(link).toHaveAttribute('target', '_blank');
      expect(await link.getAttribute('rel')).toContain('noopener');
    }

    expect(errors).toEqual([]);
  });

  test('ignores stored ids that name no piece in the catalogue', async ({ page }) => {
    await seedShortlist(page, ['living-sofa', 'not-a-real-piece']);
    await page.goto('/');
    await enter3D(page);
    await expect(page.getByRole('button', { name: /Saved \(1\)/ })).toBeVisible();
  });

  test('copying reveals the plain-text list even when the clipboard refuses', async ({ page }) => {
    await seedShortlist(page, ['living-sofa']);
    await page.goto('/');
    await enter3D(page);

    await page.getByRole('button', { name: /Saved \(1\)/ }).click();
    await savedPanel(page).getByRole('button', { name: 'Copy list' }).click();

    // Whatever the clipboard said, the visitor leaves with their list.
    const exportBox = savedPanel(page).getByRole('textbox', { name: 'Saved pieces as plain text' });
    await expect(exportBox).toBeVisible();
    await expect(exportBox).toHaveValue(/Modular sofa/);
    await expect(exportBox).toHaveValue(/https:\/\//);
  });

  test('removing a piece updates the list and the count', async ({ page }) => {
    await seedShortlist(page, ['living-sofa', 'living-rug']);
    await page.goto('/');
    await enter3D(page);

    await page.getByRole('button', { name: /Saved \(2\)/ }).click();
    const panel = savedPanel(page);
    await panel.getByRole('button', { name: 'Remove Modular sofa from saved pieces' }).click();

    await expect(panel.getByText('Modular sofa')).toHaveCount(0);
    await expect(panel.getByText('Wool area rug')).toBeVisible();
    await expect(page.getByRole('button', { name: /Saved \(1\)/ })).toBeVisible();
  });

  test('an empty list explains how to fill it', async ({ page }) => {
    await page.goto('/');
    await enter3D(page);
    await page.getByRole('button', { name: /Saved/ }).click();
    await expect(savedPanel(page).getByText(/Nothing saved yet/)).toBeVisible();
  });
});

test.describe('shareable views', () => {
  test('a shared link reopens the explorer in the room and mode it names', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await page.goto('/?room=mamad&mode=orbit&light=evening');
    await expect(page.getByRole('dialog', { name: /Interactive 3D house explorer/i })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Dollhouse', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: /Evening/ })).toHaveAttribute('aria-pressed', 'true');
    await page.waitForTimeout(500);

    expect(errors).toEqual([]);
  });

  test('a link with no view does not open the explorer', async ({ page }) => {
    await page.goto('/?utm_source=newsletter');
    await expect(page.getByRole('dialog', { name: /Interactive 3D house explorer/i })).toHaveCount(0);
  });

  test('a link naming a room that does not exist is ignored', async ({ page }) => {
    await page.goto('/?room=ballroom&mode=orbit');
    await expect(page.getByRole('dialog', { name: /Interactive 3D house explorer/i })).toHaveCount(0);
  });

  test('Share view offers a link that round-trips the current view', async ({ page }) => {
    await page.goto('/');
    await enter3D(page);

    await page.getByRole('button', { name: /Rooms/i }).click();
    await page.locator('#room-navigator-panel').getByRole('button', { name: /^Living Room/ }).click();
    await expect(page.getByRole('img', { name: 'Minimap' })).toContainText('Living Room');
    await page.getByRole('button', { name: 'Dollhouse', exact: true }).click();

    await page.getByRole('button', { name: 'Share view' }).click();
    const shareInput = page.getByRole('textbox', { name: 'Link to this view' });
    await expect(shareInput).toBeVisible();
    const url = await shareInput.inputValue();
    expect(url).toContain('room=living');
    expect(url).toContain('mode=orbit');

    // The link is only worth anything if following it lands where it says.
    await page.goto(url);
    await expect(page.getByRole('dialog', { name: /Interactive 3D house explorer/i })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Dollhouse', exact: true })).toHaveAttribute('aria-pressed', 'true');
  });
});
