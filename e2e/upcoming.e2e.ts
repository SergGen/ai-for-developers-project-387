import { expect, test } from './fixtures.ts'

test.use({
  timezoneId: 'America/Los_Angeles',
  viewport: { width: 375, height: 812 },
  appOptions: { now: () => new Date('2026-11-26T21:00:00Z') },
})

test('the owner sees an upcoming meeting booked by a guest from the catalog', async ({ page, context }) => {
  await page.goto('/')
  await page.getByRole('link', { name: 'Админка' }).click()
  await page.getByLabel('Название').fill('Знакомство')
  await page.getByLabel('Описание').fill('Короткий звонок для знакомства')
  await page.getByLabel('Длительность в минутах').fill('15')
  await page.getByRole('button', { name: 'Сохранить' }).click()
  await expect(page.getByRole('status')).toContainText('Тип встречи «Знакомство» сохранён.')

  const guest = await context.newPage()
  await guest.goto('/')
  await guest.getByRole('link', { name: 'Записаться' }).click()
  await guest.getByRole('link', { name: 'Знакомство' }).click()
  await guest.getByRole('radio', { name: 'понедельник, 30 ноября' }).check()
  await guest.getByRole('radio', { name: '09:00–09:15', exact: true }).check()
  await guest.getByRole('textbox', { name: 'Ваше имя' }).fill('Мария')
  await guest.getByRole('button', { name: 'Подтвердить запись' }).click()
  await expect(guest.getByRole('heading', { name: 'Запись подтверждена' })).toBeVisible()

  await page.getByRole('link', { name: 'Предстоящие встречи' }).click()
  await expect(page).toHaveURL(/\/admin\/upcoming$/)
  await expect(page.getByRole('heading', { name: 'Предстоящие встречи', level: 1 })).toBeVisible()
  const meeting = page.getByRole('listitem').filter({ hasText: 'Мария' })
  await expect(meeting).toContainText('Знакомство')
  await expect(meeting).toContainText('30 ноября 2026 г.')
  await expect(meeting).toContainText('09:00–09:15 по Москве')
})
