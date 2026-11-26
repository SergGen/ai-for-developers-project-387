import type { Slot } from '../generated/sdk/types.gen.ts'

const timeInMoscow = new Intl.DateTimeFormat('ru-RU', {
  timeZone: 'Europe/Moscow', hour: '2-digit', minute: '2-digit',
})
const dateInMoscow = new Intl.DateTimeFormat('en', {
  timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit',
})

const fullDateInMoscow = new Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Moscow', dateStyle: 'long' })

export function formatBookingDate(startsAt: string): string {
  return fullDateInMoscow.format(new Date(startsAt))
}

export function slotDate(startsAt: string): string {
  const parts = dateInMoscow.formatToParts(new Date(startsAt))
  return ['year', 'month', 'day'].map((part) => parts.find(({ type }) => type === part)?.value).join('-')
}

export function formatSlotTime(slot: Pick<Slot, 'startsAt' | 'endsAt'>): string {
  return `${timeInMoscow.format(new Date(slot.startsAt))}–${timeInMoscow.format(new Date(slot.endsAt))}`
}
