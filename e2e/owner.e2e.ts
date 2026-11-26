import { expect, test } from './fixtures.ts'

test('the owner gets field-specific feedback for whitespace-only meeting details', async ({ page }) => {
  await page.goto('/admin')
  const title = page.getByLabel('Название')
  const description = page.getByLabel('Описание')
  const save = page.getByRole('button', { name: 'Сохранить' })

  await title.fill('   ')
  await description.fill(' \n ')
  await page.getByLabel('Длительность в минутах').fill('15')
  await save.click()
  await expect(page.getByRole('alert')).toHaveText('Введите название типа встречи.')

  await title.fill('Знакомство')
  await save.click()
  await expect(page.getByRole('alert')).toHaveText('Введите описание типа встречи.')
  await expect(title).toHaveValue('Знакомство')

  await description.fill('Короткий звонок для знакомства')
  await save.click()
  await expect(page.getByRole('status')).toHaveText('Тип встречи «Знакомство» сохранён.')
})

test('the owner creates a meeting type that guests see in the catalog', async ({ page }) => {
  await page.goto('/')
  const adminLink = page.getByRole('link', { name: 'Админка' })
  await expect(adminLink).toBeVisible()
  await adminLink.click()
  await expect(page).toHaveURL(/\/admin$/)

  await page.getByLabel('Название').fill('Знакомство')
  await page.getByLabel('Описание').fill('Короткий звонок для знакомства')
  await page.getByLabel('Длительность в минутах').fill('15')

  const [response] = await Promise.all([
    page.waitForResponse((response) =>
      new URL(response.url()).pathname === '/api/event-types' && response.request().method() === 'POST',
    ),
    page.getByRole('button', { name: 'Сохранить' }).click(),
  ])

  expect(response.status()).toBe(201)
  await expect(page.getByRole('status')).toHaveText('Тип встречи «Знакомство» сохранён.')
  await page.getByRole('link', { name: 'Каталог типов встреч' }).click()
  await expect(page).toHaveURL(/\/book$/)
  await expect(page.getByRole('heading', { name: 'Знакомство' })).toBeVisible()
  await expect(page.getByText('Короткий звонок для знакомства')).toBeVisible()
  await expect(page.getByText('15 мин.')).toBeVisible()
})
