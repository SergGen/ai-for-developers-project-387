import { expect, test } from './fixtures.ts'

test('the guest can open an empty catalog from the home page', async ({ page }) => {
  await page.goto('/')
  const [response] = await Promise.all([
    page.waitForResponse((response) => new URL(response.url()).pathname === '/api/event-types'),
    page.getByRole('link', { name: 'Записаться' }).click(),
  ])

  expect(response.status()).toBe(200)
  await expect(page).toHaveURL(/\/book$/)
  await expect(page.getByRole('heading', { name: 'Каталог типов встреч' })).toBeVisible()
  await expect(page.getByText('Здесь появятся типы встреч, доступные для записи.')).toBeVisible()
})

test.describe('catalog with an event type', () => {
  test.use({
    appOptions: {
      eventTypes: [{
        id: 'znakomstvo',
        title: 'Знакомство',
        description: 'Короткий звонок для знакомства',
        durationMinutes: 15,
      }],
    },
  })

  test('the guest sees the title, description and duration', async ({ page }) => {
    await page.goto('/book')

    await expect(page.getByRole('heading', { name: 'Знакомство' })).toBeVisible()
    await expect(page.getByText('Короткий звонок для знакомства')).toBeVisible()
    await expect(page.getByText('15 мин.')).toBeVisible()
  })
})
