import { expect, test } from './fixtures.ts'

const consultation = {
  id: 'konsultatsiya',
  title: 'Консультация',
  description: 'Обсудим вопросы по проекту',
  durationMinutes: 30,
}
const review = { ...consultation, id: 'razbor', title: 'Разбор', durationMinutes: 60 }

test.use({
  timezoneId: 'America/Los_Angeles',
  viewport: { width: 375, height: 812 },
  appOptions: {
    eventTypes: [consultation, review],
    now: () => new Date('2026-11-26T21:00:00Z'),
  },
})

test('the guest can retry a stale slot with another day and keep their name', async ({ page, request }) => {
  await page.goto('/book/konsultatsiya')
  const days = page.getByRole('group', { name: 'День звонка' })
  await days.getByRole('radio', { name: 'понедельник, 30 ноября' }).check()
  const slots = page.getByRole('group', { name: 'Время звонка' })
  await slots.getByRole('radio', { name: '10:30–11:00', exact: true }).check()
  const guestName = page.getByRole('textbox', { name: 'Ваше имя' })
  await guestName.fill('Анна', { timeout: 4000 })

  const competitor = await request.post('/api/bookings', {
    data: { eventTypeId: review.id, startsAt: '2026-11-30T07:00:00Z', guestName: 'Борис' },
  })
  expect(competitor.status()).toBe(201)
  const confirm = page.getByRole('button', { name: 'Подтвердить запись' })
  await confirm.click()

  await expect(page.getByRole('alert')).toHaveText('Это время уже занято. Выберите другой слот')
  await expect(guestName).toHaveValue('Анна')
  await expect(slots.getByRole('radio', { name: /10:30–11:00.*Занято/ })).toBeDisabled()
  await expect(confirm).toBeDisabled()

  await days.getByRole('radio', { name: 'вторник, 1 декабря' }).check()
  await slots.getByRole('radio', { name: '11:00–11:30', exact: true }).check()
  await expect(guestName).toHaveValue('Анна')
  await confirm.click()

  await expect(page.getByRole('status')).toContainText('Запись подтверждена')
  await expect(page.getByText(/1 декабря 2026 г\..*11:00–11:30/)).toBeVisible()
})

test('the guest can retry when refreshing a taken slot fails', async ({ page, request }) => {
  await page.goto('/book/konsultatsiya')
  await page.getByRole('radio', { name: 'понедельник, 30 ноября' }).check()
  const slot = page.getByRole('radio', { name: '10:30–11:00', exact: true })
  await slot.check()
  const guestName = page.getByRole('textbox', { name: 'Ваше имя' })
  await guestName.fill('Анна')

  const competitor = await request.post('/api/bookings', {
    data: { eventTypeId: review.id, startsAt: '2026-11-30T07:00:00Z', guestName: 'Борис' },
  })
  expect(competitor.status()).toBe(201)
  await page.route('**/api/event-types/konsultatsiya/slots', (route) => route.abort(), { times: 1 })

  const confirm = page.getByRole('button', { name: 'Подтвердить запись' })
  await confirm.click()
  const alert = page.getByRole('alert')
  await expect(alert).toContainText('Это время уже занято. Выберите другой слот')
  await expect(alert).toContainText('Не удалось обновить слоты.')
  await expect(guestName).toHaveValue('Анна')
  await expect(slot).toBeDisabled()
  await expect(confirm).toBeDisabled()

  await page.getByRole('button', { name: 'Повторить загрузку' }).click()
  await expect(alert).toHaveText('Это время уже занято. Выберите другой слот')
  await expect(page.getByRole('radio', { name: /10:30–11:00.*Занято/ })).toBeDisabled()
  await page.getByRole('radio', { name: '11:00–11:30', exact: true }).check()
  await expect(guestName).toHaveValue('Анна')
  await confirm.click()
  await expect(page.getByRole('heading', { name: 'Запись подтверждена' })).toBeVisible()
})

test('the guest sees the conflict and topic errors separately and can finish after fixing both', async ({ page, request }) => {
  await page.goto('/book/konsultatsiya')
  await page.getByRole('radio', { name: 'понедельник, 30 ноября' }).check()
  await page.getByRole('radio', { name: '10:30–11:00', exact: true }).check()
  const guestName = page.getByRole('textbox', { name: 'Ваше имя' })
  await guestName.fill('Анна')
  const topic = page.getByRole('textbox', { name: 'Тема встречи' })

  const competitor = await request.post('/api/bookings', {
    data: { eventTypeId: review.id, startsAt: '2026-11-30T07:00:00Z', guestName: 'Борис' },
  })
  expect(competitor.status()).toBe(201)

  const confirm = page.getByRole('button', { name: 'Подтвердить запись' })
  await confirm.click()
  await expect(page.getByRole('alert')).toHaveText('Это время уже занято. Выберите другой слот')

  await topic.fill('а'.repeat(201))

  const conflictAlert = page.getByRole('alert').filter({ hasText: 'Это время уже занято' })
  const topicAlert = page.getByRole('alert').filter({ hasText: 'Тема встречи не должна превышать' })
  await expect(conflictAlert).toHaveText('Это время уже занято. Выберите другой слот')
  await expect(topicAlert).toHaveText('Тема встречи не должна превышать 200 символов')
  await expect(topic).toHaveAttribute('aria-invalid', 'true')
  await expect(topic).toHaveAccessibleDescription('Тема встречи не должна превышать 200 символов')
  await expect(confirm).toBeDisabled()

  await topic.fill('Короткая тема')
  await expect(topic).not.toHaveAttribute('aria-invalid', 'true')
  await page.getByRole('radio', { name: '11:00–11:30', exact: true }).check()
  await confirm.click()

  await expect(page.getByRole('heading', { name: 'Запись подтверждена' })).toBeVisible()
  await expect(page.getByText(/30 ноября 2026 г\..*11:00–11:30/)).toBeVisible()
})

test.describe('at Moscow midnight', () => {
  let now = new Date('2026-11-29T20:59:59Z')
  test.use({ appOptions: { eventTypes: [consultation], now: () => now } })

  test('the guest can pick a new day when the selected day leaves the booking window', async ({ page }) => {
    await page.goto('/book/konsultatsiya')
    const expiredDay = page.getByRole('radio', { name: 'понедельник, 30 ноября' })
    await expect(expiredDay).toBeChecked()
    const openingSlot = page.getByRole('radio', { name: '09:00–09:30', exact: true })
    await openingSlot.check()
    const guestName = page.getByRole('textbox', { name: 'Ваше имя' })
    await guestName.fill('Анна')

    now = new Date('2026-11-29T21:00:00Z')
    const confirm = page.getByRole('button', { name: 'Подтвердить запись' })
    const [response] = await Promise.all([
      page.waitForResponse((response) => new URL(response.url()).pathname === '/api/bookings'),
      confirm.click(),
    ])
    expect(response.status()).toBe(400)
    await expect(page.getByRole('alert')).toContainText('Выбранный слот больше недоступен. Выберите другое время.')
    await expect(expiredDay).toHaveCount(0)
    await expect(guestName).toHaveValue('Анна')
    await expect(confirm).toBeDisabled()

    await page.getByRole('radio', { name: 'вторник, 1 декабря' }).check()
    await openingSlot.check()
    await confirm.click()
    await expect(page.getByRole('heading', { name: 'Запись подтверждена' })).toBeVisible()
    await expect(page.getByText(/1 декабря 2026 г\..*09:00–09:30/)).toBeVisible()
  })
})
