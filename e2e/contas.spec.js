const { test, expect } = require('@playwright/test');
const { useMockApi } = require('./helpers');

// Dados de exemplo de scripts/mock-d1.js: 5 empresas do top (3 RJ, 2 SP) + 1 cliente Noesis.
test.describe('Brasil Dashboard — contas', () => {
  let errors;
  test.beforeEach(async ({ page }) => { errors = await useMockApi(page); });
  test.afterEach(() => { expect(errors, 'erros de JavaScript na página').toEqual([]); });

  test('carrega KPIs, contexto e a tabela de contas', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#tbody tr[data-id]')).toHaveCount(6);
    await expect(page.locator('#hint')).toContainText('5 maiores empresas (RJ + SP) + 1 cliente Noesis');
    await expect(page.locator('#kpi-target [data-s]')).not.toHaveText('A carregar…');
    await expect(page.locator('#gen')).toContainText('Atualizado');
    await expect(page).toHaveTitle('Brasil Dashboard');
  });

  test('filtro por estado mostra só as empresas de SP', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#tbody tr[data-id]')).toHaveCount(6);
    await page.locator('#f-state').selectOption('SP');
    await expect(page.locator('#tbody tr[data-id]')).toHaveCount(2);
    await expect(page.locator('#tbody .name')).toContainText(['JBS', 'Claro']);
    await page.locator('#btn-reset').click();
    await expect(page.locator('#tbody tr[data-id]')).toHaveCount(6);
  });

  test('decisores: perfis LinkedIn válidos têm link, URLs perigosos não', async ({ page }) => {
    await page.goto('/');
    await page.locator('tr[data-id="br-rj-11"] [data-act="decisors"]').click();
    const sheet = page.locator('.overlay .sheet').last();
    await expect(sheet.locator('.item')).toHaveCount(2);
    await expect(sheet.locator('a.ic[href^="https://"]')).toHaveCount(2);
    await sheet.locator('.close').click();

    await page.locator('tr[data-id="br-sp-01"] [data-act="decisors"]').click();
    const jbs = page.locator('.overlay .sheet').last();
    await expect(jbs.locator('.item .t')).toHaveText('Marta Demo');
    await expect(jbs.locator('a[href^="javascript:"]')).toHaveCount(0);
  });

  test('abre a ficha de conta', async ({ page }) => {
    await page.goto('/');
    await page.locator('tr[data-id="br-rj-11"] button.name').click();
    const sheet = page.locator('.overlay .sheet.wide');
    await expect(sheet.locator('h2')).toHaveText('Globo');
    await expect(sheet).not.toContainText('A carregar a ficha de conta…');
  });
});
