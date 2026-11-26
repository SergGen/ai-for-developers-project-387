import type { Page } from '@playwright/test'
import { expect, test } from './fixtures.ts'

test.use({
  timezoneId: 'America/Los_Angeles',
  viewport: { width: 375, height: 812 },
  appOptions: { now: () => new Date('2026-11-26T21:00:00Z') },
})

async function createMeetingType(page: Page, title = 'Знакомство') {
  await page.goto('/')
  await page.getByRole('link', { name: 'Админка' }).click()
  await page.getByLabel('Название').fill(title)
  await page.getByLabel('Описание').fill('Короткий звонок для знакомства')
  await page.getByLabel('Длительность в минутах').fill('15')
  await page.getByRole('button', { name: 'Сохранить' }).click()
  await expect(page.getByRole('status')).toContainText(`Тип встречи «${title}» сохранён.`)
}

interface BookingForm {
  title?: string
  day?: string
  slot?: string
  guestName: string
  topic?: string
}

async function fillBooking(
  guest: Page,
  { title = 'Знакомство', day = 'понедельник, 30 ноября', slot = '09:00–09:15', guestName, topic }: BookingForm,
) {
  await guest.goto('/')
  await guest.getByRole('link', { name: 'Записаться' }).click()
  await guest.getByRole('link', { name: title }).click()
  await guest.getByRole('radio', { name: day }).check()
  await guest.getByRole('radio', { name: slot, exact: true }).check()
  await guest.getByRole('textbox', { name: 'Ваше имя' }).fill(guestName)
  if (topic !== undefined) {
    await guest.getByRole('textbox', { name: 'Тема встречи' }).fill(topic)
  }
}

async function bookMeeting(guest: Page, form: BookingForm) {
  await fillBooking(guest, form)
  await guest.getByRole('button', { name: 'Подтвердить запись' }).click()
  await expect(guest.getByRole('heading', { name: 'Запись подтверждена' })).toBeVisible()
}

test('the owner sees the topic of an upcoming meeting booked by a guest', async ({ page, context }) => {
  await createMeetingType(page)

  const guest = await context.newPage()
  await bookMeeting(guest, { guestName: 'Мария', topic: 'Подготовить вопросы по проекту' })
  await expect(guest.getByRole('status')).not.toContainText('Подготовить вопросы по проекту')

  await page.getByRole('link', { name: 'Предстоящие встречи' }).click()
  await expect(page).toHaveURL(/\/admin\/upcoming$/)
  await expect(page.getByRole('heading', { name: 'Предстоящие встречи', level: 1 })).toBeVisible()
  const meeting = page.getByRole('listitem').filter({ hasText: 'Мария' })
  await expect(meeting).toContainText('Знакомство')
  await expect(meeting).toContainText('Тема: Подготовить вопросы по проекту')
  await expect(meeting).toContainText('30 ноября 2026 г.')
  await expect(meeting).toContainText('09:00–09:15 по Москве')
})

test('the owner sees a meeting booked without a topic as before', async ({ page, context }) => {
  await createMeetingType(page)

  const guest = await context.newPage()
  await bookMeeting(guest, { guestName: 'Мария' })

  await page.getByRole('link', { name: 'Предстоящие встречи' }).click()
  await expect(page).toHaveURL(/\/admin\/upcoming$/)
  const meeting = page.getByRole('listitem').filter({ hasText: 'Мария' })
  await expect(meeting).toContainText('Знакомство')
  await expect(meeting).toContainText('30 ноября 2026 г.')
  await expect(meeting).toContainText('09:00–09:15 по Москве')
  await expect(meeting).not.toContainText('Тема:')
})

test('the guest sees a clear error and keeps the slot when the topic is too long', async ({ page, context }) => {
  await createMeetingType(page)

  const guest = await context.newPage()
  await fillBooking(guest, { guestName: 'Мария', topic: 'а'.repeat(201) })

  await expect(guest.getByRole('alert')).toHaveText('Тема встречи не должна превышать 200 символов')
  await expect(guest.getByRole('button', { name: 'Подтвердить запись' })).toBeDisabled()
  await expect(guest.getByRole('radio', { name: '09:00–09:15', exact: true })).toBeChecked()
})
