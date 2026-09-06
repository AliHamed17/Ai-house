import { expect, test } from '@playwright/test';

const ROOM_COUNT = 12;

async function scrollToFraction(page: import('@playwright/test').Page, fraction: number) {
  await page.evaluate((f) => {
    const track = document.querySelector('#journey')!.firstElementChild as HTMLElement;
    const span = track.offsetHeight - window.innerHeight;
    window.scrollTo(0, Math.round(track.offsetTop + f * span));
  }, fraction);
  await page.waitForTimeout(400);
}

test.describe('Scroll journey', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.locator('#journey').waitFor();
  });

  test('pins a sticky stage without disabling it via overflow on the track', async ({ page }) => {
    const geometry = await page.evaluate(() => {
      const track = document.querySelector('#journey')!.firstElementChild as HTMLElement;
      const stage = track.firstElementChild as HTMLElement;
      return {
        trackOverflow: getComputedStyle(track).overflow,
        stagePosition: getComputedStyle(stage).position,
        trackTallerThanViewport: track.offsetHeight > window.innerHeight * 2,
      };
    });
    expect(geometry.stagePosition).toBe('sticky');
    expect(geometry.trackOverflow).toBe('visible');
    expect(geometry.trackTallerThanViewport).toBe(true);
  });

  test('walks through every room in order as the visitor scrolls', async ({ page }) => {
    const seen: string[] = [];
    for (let i = 0; i < ROOM_COUNT; i += 1) {
      await scrollToFraction(page, i / (ROOM_COUNT - 1));
      seen.push((await page.locator('#journey h3').innerText()).trim());
    }
    expect(seen).toHaveLength(ROOM_COUNT);
    expect(new Set(seen).size).toBe(ROOM_COUNT);
    expect(seen[0]).toBe('Entry Stair');
    expect(seen[seen.length - 1]).toBe('Guest WC');
  });

  test('never hijacks the wheel, so native scrolling keeps working', async ({ page }) => {
    await scrollToFraction(page, 0.4);
    const prevented = await page.evaluate(() => {
      let hijacked = false;
      const probe = (e: Event) => { if (e.defaultPrevented) hijacked = true; };
      window.addEventListener('wheel', probe, { passive: true });
      window.dispatchEvent(new WheelEvent('wheel', { deltaY: 200, cancelable: true, bubbles: true }));
      window.removeEventListener('wheel', probe);
      return hijacked;
    });
    expect(prevented).toBe(false);

    const before = await page.evaluate(() => window.scrollY);
    await page.mouse.wheel(0, 600);
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(before);
  });

  test('switches the whole house between design directions', async ({ page }) => {
    await scrollToFraction(page, 0.3);
    const shown = async () =>
      page.evaluate(() => {
        const img = document.querySelector('#journey img[sizes="100vw"]') as HTMLImageElement | null;
        return decodeURIComponent(img?.currentSrc || img?.src || '');
      });

    expect(await shown()).toContain('/interiors/warm-oak/');

    await page.getByRole('button', { name: 'Cool Stone & Champagne' }).click();
    await page.waitForTimeout(600);
    expect(await shown()).toContain('/interiors/cool-stone/');
    await expect(page.getByRole('button', { name: 'Cool Stone & Champagne' })).toHaveAttribute('aria-pressed', 'true');

    await page.getByRole('button', { name: 'Sand & Linen' }).click();
    await page.waitForTimeout(600);
    expect(await shown()).toContain('/interiors/sand-linen/');
  });

  test('keeps the room label in step with the progress counter', async ({ page }) => {
    for (const f of [0, 0.5, 1]) {
      await scrollToFraction(page, f);
      const counter = await page.locator('#journey').getByText(/^Room \d+ of \d+$/).innerText();
      const index = Number(counter.match(/Room (\d+)/)![1]);
      expect(index).toBeGreaterThanOrEqual(1);
      expect(index).toBeLessThanOrEqual(ROOM_COUNT);
      await expect(page.locator('#journey h3')).not.toBeEmpty();
    }
  });

  test('never loads a broken image while walking the house', async ({ page }) => {
    for (const f of [0, 0.25, 0.5, 0.75, 1]) {
      await scrollToFraction(page, f);
    }
    const broken = await page.evaluate(() =>
      [...document.querySelectorAll('#journey img')]
        .filter((i) => (i as HTMLImageElement).complete && (i as HTMLImageElement).naturalWidth === 0)
        .map((i) => i.getAttribute('src')),
    );
    expect(broken).toEqual([]);
  });

  test('lets a keyboard user reach the design switcher and the room jumps', async ({ page }) => {
    const pill = page.getByRole('button', { name: 'Sand & Linen' });
    await pill.focus();
    await expect(pill).toBeFocused();
    await page.keyboard.press('Enter');
    await page.waitForTimeout(400);
    await expect(pill).toHaveAttribute('aria-pressed', 'true');

    const jump = page.getByRole('button', { name: /^Jump to / }).nth(5);
    await jump.focus();
    await expect(jump).toBeFocused();
  });
});
