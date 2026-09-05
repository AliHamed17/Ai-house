import { test, expect } from '@playwright/test';

test.describe('Landing page', () => {
  test('loads the hero and lets the visitor scroll before entering 3D', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Enter 3D Explorer' })).toBeVisible();

    await page.evaluate(() => window.scrollTo(0, 1200));
    const scrollY = await page.evaluate(() => window.scrollY);
    expect(scrollY).toBeGreaterThan(0);
  });

  test('every primary section is present', async ({ page }) => {
    await page.goto('/');
    for (const id of ['evidence', 'floor-plan', 'rooms', 'materials', 'comparisons', 'ai-studio']) {
      await expect(page.locator(`#${id}`)).toBeAttached();
    }
  });

  test('nav links scroll to their sections', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'Materials' }).click();
    await page.waitForTimeout(300);
    const inView = await page.locator('#materials').isVisible();
    expect(inView).toBe(true);
  });

  test('the technical note discloses MAMAD and construction-accuracy limitations', async ({ page }) => {
    await page.goto('/');
    await page.locator('#ai-studio').scrollIntoViewIfNeeded();
    await expect(page.getByText(/protected room/i).first()).toBeVisible();
    await expect(page.getByRole('heading', { name: /not construction documentation/i })).toBeVisible();
  });
});
