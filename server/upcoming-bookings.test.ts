import { expect, test } from 'vitest'
import { withTestServer } from './test-server.ts'

test('GET /api/bookings/upcoming returns an empty list before any bookings', async () => {
  await withTestServer({}, async (address) => {
    const response = await fetch(`${address}/api/bookings/upcoming`)

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual([])
  })
})

test('GET /api/bookings/upcoming returns future meetings of all types by start time', async () => {
  const consultation = {
    id: 'konsultatsiya',
    title: 'Консультация',
    description: 'Обсудим вопросы по проекту',
    durationMinutes: 30,
  }
  const review = {
    id: 'razbor',
    title: 'Разбор',
    description: 'Разберём проект',
    durationMinutes: 60,
  }
  let now = new Date('2026-11-26T21:00:00Z')
  await withTestServer({ eventTypes: [consultation, review], now: () => now }, async (address) => {
    const bookings = [
      { eventTypeId: consultation.id, guestName: 'София', startsAt: '2026-11-30T09:00:00.000Z' },
      { eventTypeId: review.id, guestName: 'Анна', startsAt: '2026-11-30T06:00:00.000Z' },
      { eventTypeId: review.id, guestName: 'Борис', startsAt: '2026-11-30T08:00:00.000Z', topic: 'Обсудить проект' },
    ]
    for (const booking of bookings) {
      const response = await fetch(`${address}/api/bookings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(booking),
      })
      expect(response.status).toBe(201)
    }

    now = new Date('2026-11-30T07:30:00.000Z')
    const response = await fetch(`${address}/api/bookings/upcoming`)

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual([
      { eventType: review, guestName: 'Борис', topic: 'Обсудить проект', startsAt: '2026-11-30T08:00:00.000Z', endsAt: '2026-11-30T09:00:00.000Z' },
      { eventType: consultation, guestName: 'София', startsAt: '2026-11-30T09:00:00.000Z', endsAt: '2026-11-30T09:30:00.000Z' },
    ])
  })
})
