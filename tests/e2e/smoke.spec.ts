import { expect, test } from '@playwright/test';

const PAGES = ['/dashboard', '/updates', '/projects', '/my-tasks', '/calendar', '/logistics', '/cashflow', '/employees', '/leave', '/approvals', '/settings'];

test('signs in and opens every main page without an error', async ({ page }) => {
  const problems: string[] = [];
  page.on('pageerror', (error) => problems.push(error.message));

  await page.goto('/login');
  await page.locator('input[type="email"]').fill(process.env.E2E_EMAIL!);
  await page.locator('input[autocomplete="current-password"]').fill(process.env.E2E_PASSWORD!);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(/\/dashboard/);

  for (const path of PAGES) {
    const response = await page.goto(path);
    expect(response?.status(), path).toBeLessThan(400);
    await expect(page.getByRole('heading', { level: 1 }).first(), path).toBeVisible();
    await expect(page.getByText('Something went wrong'), path).toHaveCount(0);
  }
  expect(problems).toEqual([]);
});

test('a review link that does not exist shows not found, without signing in', async ({ page }) => {
  const response = await page.goto(`/review/${'0'.repeat(64)}`);
  expect(response?.status()).toBe(404);
});
