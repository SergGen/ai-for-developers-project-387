import { expect, test } from 'vitest'
import type { SlotWindow } from '../generated/sdk/types.gen.ts'
import type { AppOptions } from './app.ts'
import { withTestServer } from './test-server.ts'

const consultation = {
  id: 'konsultatsiya',
  title: 'Консультация',
  description: 'Обсудим вопросы по проекту',
  durationMinutes: 30,
}

async function withSlotsServer(options: AppOptions, run: (url: string) => Promise<void>) {
  await withTestServer({ eventTypes: [consultation], ...options }, (address) => run(`${address}/api/event-types`))
}

test('the Moscow booking window includes 14 calendar days and only offers workday slots', async () => {
  await withSlotsServer({ now: () => new Date('2026-11-26T21:00:00Z') }, async (url) => {
    const response = await fetch(`${url}/${consultation.id}/slots`)

    expect(response.status).toBe(200)
    const body = await response.json() as SlotWindow
    expect(body.eventType).toEqual(consultation)
    expect(body.days).toEqual([
      '2026-11-28', '2026-11-29', '2026-11-30', '2026-12-01', '2026-12-02', '2026-12-03', '2026-12-04',
      '2026-12-05', '2026-12-06', '2026-12-07', '2026-12-08', '2026-12-09', '2026-12-10', '2026-12-11',
    ])
    const slotDays = body.slots.map(({ startsAt }) => startsAt.slice(0, 10))
    expect([...new Set(slotDays)]).toEqual([
      '2026-11-30', '2026-12-01', '2026-12-02', '2026-12-03', '2026-12-04',
      '2026-12-07', '2026-12-08', '2026-12-09', '2026-12-10', '2026-12-11',
    ])
    const monday = body.slots.filter(({ startsAt }) => startsAt.startsWith('2026-11-30'))
    expect(monday).toHaveLength(35)
    expect(monday.slice(0, 2)).toEqual([
      { startsAt: '2026-11-30T06:00:00.000Z', endsAt: '2026-11-30T06:30:00.000Z', available: true },
      { startsAt: '2026-11-30T06:15:00.000Z', endsAt: '2026-11-30T06:45:00.000Z', available: true },
    ])
    expect(monday.at(-1)).toEqual({
      startsAt: '2026-11-30T14:30:00.000Z', endsAt: '2026-11-30T15:00:00.000Z', available: true,
    })
  })
})

test('a different event type blocks overlapping intervals while adjacent slots remain available', async () => {
  const longCall = { ...consultation, id: 'dlinnaya-vstrecha', durationMinutes: 60 }
  await withSlotsServer({
    eventTypes: [consultation, longCall],
    now: () => new Date('2026-11-26T21:00:00Z'),
    bookings: [{
      eventTypeId: longCall.id,
      guestName: 'Анна',
      startsAt: '2026-11-30T09:30:00+03:00',
      endsAt: '2026-11-30T10:30:00+03:00',
    }],
  }, async (url) => {
    const response = await fetch(`${url}/${consultation.id}/slots`)

    expect(response.status).toBe(200)
    const { slots } = await response.json() as SlotWindow
    const firstSlots = slots.slice(0, 7)
    expect(firstSlots.map(({ available }) => available))
      .toEqual([true, false, false, false, false, false, true])
  })
})

test('a 540-minute meeting has one opening slot that ends at closing on a workday', async () => {
  const allDayMeeting = { ...consultation, durationMinutes: 540 }
  await withSlotsServer({
    eventTypes: [allDayMeeting],
    now: () => new Date('2026-11-26T21:00:00Z'),
  }, async (url) => {
    const response = await fetch(`${url}/${allDayMeeting.id}/slots`)

    expect(response.status).toBe(200)
    const { slots } = await response.json() as SlotWindow
    expect(slots.filter(({ startsAt }) => startsAt.startsWith('2026-11-30'))).toEqual([
      { startsAt: '2026-11-30T06:00:00.000Z', endsAt: '2026-11-30T15:00:00.000Z', available: true },
    ])
  })
})

test('on an already running server the window advances at Moscow midnight', async () => {
  let now = new Date('2026-11-26T20:59:59Z')

  await withSlotsServer({ now: () => now }, async (url) => {
    const endpoint = `${url}/${consultation.id}/slots`
    const before = await fetch(endpoint)
    expect(before.status).toBe(200)
    const beforeMidnight = await before.json() as SlotWindow
    expect(beforeMidnight.days[0]).toBe('2026-11-27')
    expect(beforeMidnight.days.at(-1)).toBe('2026-12-10')

    now = new Date('2026-11-26T21:00:00Z')
    const after = await fetch(endpoint)
    expect(after.status).toBe(200)
    const afterMidnight = await after.json() as SlotWindow
    expect(afterMidnight.days[0]).toBe('2026-11-28')
    expect(afterMidnight.days.at(-1)).toBe('2026-12-11')
  })
})

test('an unknown event type returns the slots contract 404', async () => {
  await withSlotsServer({}, async (url) => {
    const response = await fetch(`${url}/missing/slots`)

    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ message: 'Тип встречи не найден' })
  })
})
