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
    bookings: [{
      eventTypeId: review.id,
      guestName: 'Анна',
      startsAt: '2026-11-30T06:30:00Z',
      endsAt: '2026-11-30T07:30:00Z',
    }],
  },
})

test('the guest can choose a free slot in Moscow time from the real server', async ({ page }) => {
  await page.goto('/book')
  const [response] = await Promise.all([
    page.waitForResponse((response) => new URL(response.url()).pathname === '/api/event-types/konsultatsiya/slots'),
    page.getByRole('link', { name: 'Консультация' }).click({ timeout: 4000 }),
  ])

  expect(response.status()).toBe(200)
  await expect(page).toHaveURL(/\/book\/konsultatsiya$/)
  const days = page.getByRole('group', { name: 'День звонка' })
  await expect(days.getByRole('radio')).toHaveCount(14)
  await days.getByRole('radio', { name: 'суббота, 28 ноября' }).check()
  await expect(page.getByText('На этот день слотов нет.')).toBeVisible()
  await days.getByRole('radio', { name: 'понедельник, 30 ноября' }).check()

  const slots = page.getByRole('group', { name: 'Время звонка' })
  await expect(slots.getByRole('radio', { name: /09:30–10:00.*Занято/ })).toBeDisabled()
  const available = slots.getByRole('radio', { name: '09:00–09:30', exact: true })
  await available.check()
  await expect(available).toBeChecked()
})
