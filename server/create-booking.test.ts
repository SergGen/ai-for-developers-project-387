import { expect, test } from 'vitest'
import type { SlotWindow } from '../generated/sdk/types.gen.ts'
import { withTestServer } from './test-server.ts'

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

async function withCalendar(run: (url: string) => Promise<void>) {
  await withTestServer({
    eventTypes: [consultation, review],
    now: () => new Date('2026-11-26T21:00:00Z'),
  }, run)
}

function postBooking(url: string, eventTypeId: string, startsAt: string, guestName = 'Анна', topic?: string) {
  return fetch(`${url}/api/bookings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ eventTypeId, startsAt, guestName, topic }),
  })
}

test('POST /api/bookings matches a slot by instant and calculates the end from the meeting type', async () => {
  await withCalendar(async (url) => {
    const response = await postBooking(url, consultation.id, '2026-11-29T23:00:00-07:00')

    expect(response.status).toBe(201)
    expect(await response.json()).toEqual({
      eventType: consultation,
      guestName: 'Анна',
      startsAt: '2026-11-30T06:00:00.000Z',
      endsAt: '2026-11-30T06:30:00.000Z',
    })
  })
})

test('POST /api/bookings stores an optional topic and returns it with the booking', async () => {
  await withCalendar(async (url) => {
    const response = await postBooking(url, consultation.id, '2026-11-30T06:00:00Z', 'Анна', 'Обсудить проект')

    expect(response.status).toBe(201)
    expect(await response.json()).toEqual({
      eventType: consultation,
      guestName: 'Анна',
      topic: 'Обсудить проект',
      startsAt: '2026-11-30T06:00:00.000Z',
      endsAt: '2026-11-30T06:30:00.000Z',
    })
  })
})

test('POST /api/bookings trims a topic and treats a blank topic as absent', async () => {
  await withCalendar(async (url) => {
    const trimmed = await postBooking(url, consultation.id, '2026-11-30T06:00:00Z', 'Анна', '  Обсудить проект  ')
    expect(trimmed.status).toBe(201)
    expect(await trimmed.json()).toEqual({
      eventType: consultation,
      guestName: 'Анна',
      topic: 'Обсудить проект',
      startsAt: '2026-11-30T06:00:00.000Z',
      endsAt: '2026-11-30T06:30:00.000Z',
    })

    const blank = await postBooking(url, consultation.id, '2026-11-30T06:30:00Z', 'Борис', ' \t ')
    expect(blank.status).toBe(201)
    expect(await blank.json()).not.toHaveProperty('topic')

    const upcoming = await fetch(`${url}/api/bookings/upcoming`)
    const bookings = await upcoming.json() as Array<{ guestName: string; topic?: string }>
    expect(bookings.find(({ guestName }) => guestName === 'Анна')).toMatchObject({ topic: 'Обсудить проект' })
    expect(bookings.find(({ guestName }) => guestName === 'Борис')).not.toHaveProperty('topic')
  })
})

test('POST /api/bookings accepts a topic of exactly 200 characters after trimming', async () => {
  await withCalendar(async (url) => {
    const topic = 'а'.repeat(200)
    const response = await postBooking(url, consultation.id, '2026-11-30T06:00:00Z', 'Анна', `  ${topic}  `)

    expect(response.status).toBe(201)
    expect(await response.json()).toMatchObject({ topic })
  })
})

test('POST /api/bookings rejects a topic longer than 200 characters after trimming and creates no booking', async () => {
  await withCalendar(async (url) => {
    const response = await postBooking(url, consultation.id, '2026-11-30T06:00:00Z', 'Анна', `  ${'а'.repeat(201)}  `)

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ message: 'Тема встречи не должна превышать 200 символов' })

    const upcoming = await fetch(`${url}/api/bookings/upcoming`)
    expect(await upcoming.json()).toEqual([])
  })
})

test('POST /api/bookings counts the topic limit in characters, not UTF-16 code units', async () => {
  await withCalendar(async (url) => {
    const topic = '😀'.repeat(200)
    const accepted = await postBooking(url, consultation.id, '2026-11-30T06:00:00Z', 'Анна', topic)
    expect(accepted.status).toBe(201)
    expect(await accepted.json()).toMatchObject({ topic })

    const rejected = await postBooking(url, consultation.id, '2026-11-30T06:30:00Z', 'Борис', '😀'.repeat(201))
    expect(rejected.status).toBe(400)
    expect(await rejected.json()).toEqual({ message: 'Тема встречи не должна превышать 200 символов' })

    const upcoming = await fetch(`${url}/api/bookings/upcoming`)
    expect(await upcoming.json()).toHaveLength(1)
  })
})

test('POST /api/bookings rejects a conflicting interval with a topic and keeps only the first booking', async () => {
  await withCalendar(async (url) => {
    const first = await postBooking(url, review.id, '2026-11-30T07:00:00Z', 'Анна', 'Первый вопрос')
    expect(first.status).toBe(201)
    const firstBooking = await first.json()

    const conflict = await postBooking(url, consultation.id, '2026-11-30T07:30:00Z', 'Борис', 'Второй вопрос')
    expect(conflict.status).toBe(409)
    expect(await conflict.json()).toEqual({ message: 'Это время уже занято. Выберите другой слот' })

    const upcoming = await fetch(`${url}/api/bookings/upcoming`)
    expect(await upcoming.json()).toEqual([firstBooking])
  })
})

test('POST /api/bookings reports the interval conflict before an over-limit topic', async () => {
  await withCalendar(async (url) => {
    const first = await postBooking(url, review.id, '2026-11-30T07:00:00Z', 'Анна', 'Первый вопрос')
    expect(first.status).toBe(201)

    const conflict = await postBooking(url, consultation.id, '2026-11-30T07:30:00Z', 'Борис', 'а'.repeat(201))
    expect(conflict.status).toBe(409)
    expect(await conflict.json()).toEqual({ message: 'Это время уже занято. Выберите другой слот' })

    const upcoming = await fetch(`${url}/api/bookings/upcoming`)
    expect(await upcoming.json()).toHaveLength(1)
  })
})

test('POST /api/bookings rejects a partial overlap across meeting types and allows an adjacent start', async () => {
  await withCalendar(async (url) => {
    const booked = await postBooking(url, review.id, '2026-11-30T07:00:00Z')
    expect(booked.status).toBe(201)

    const overlap = await postBooking(url, consultation.id, '2026-11-30T07:30:00Z')
    expect(overlap.status).toBe(409)

    const adjacent = await postBooking(url, consultation.id, '2026-11-30T08:00:00Z')
    expect(adjacent.status).toBe(201)
  })
})

test('concurrent requests for overlapping intervals create only the winning booking', async () => {
  await withCalendar(async (url) => {
    const [longBooking, shortBooking] = await Promise.all([
      postBooking(url, review.id, '2026-11-30T07:00:00Z', 'Анна'),
      postBooking(url, consultation.id, '2026-11-30T07:45:00Z', 'Борис'),
    ])
    expect([longBooking.status, shortBooking.status].sort()).toEqual([201, 409])
    const longBookingWon = longBooking.status === 201
    const winner = longBookingWon ? longBooking : shortBooking

    const upcoming = await fetch(`${url}/api/bookings/upcoming`)
    expect(upcoming.status).toBe(200)
    expect(await upcoming.json()).toEqual([await winner.json()])

    const response = await fetch(`${url}/api/event-types/${consultation.id}/slots`)
    expect(response.status).toBe(200)
    const { slots } = await response.json() as SlotWindow
    const availability = new Map(slots.map(({ startsAt, available }) => [startsAt, available]))
    // The 10:00 and 11:00 slots each intersect only one of the two proposed bookings.
    expect(availability.get('2026-11-30T07:00:00.000Z')).toBe(!longBookingWon)
    expect(availability.get('2026-11-30T07:45:00.000Z')).toBe(false)
    expect(availability.get('2026-11-30T08:00:00.000Z')).toBe(longBookingWon)
  })
})

test.each([
  ['outside the window', '2026-11-27T07:00:00Z'],
  ['on a weekend', '2026-11-28T07:00:00Z'],
  ['before opening', '2026-11-30T05:45:00Z'],
  ['too late for the meeting to finish by closing', '2026-11-30T14:45:00Z'],
  ['off the quarter-hour grid', '2026-11-30T06:16:00Z'],
  ['with nonzero fractional seconds', '2026-11-30T06:15:00.000001Z'],
  ['without a time offset', '2026-11-30T09:00:00'],
  ['with a malformed timestamp', 'not a timestamp'],
])('POST /api/bookings rejects a start %s', async (_reason, startsAt) => {
  await withCalendar(async (url) => {
    const response = await postBooking(url, consultation.id, startsAt)
    expect(response.status).toBe(400)
  })
})

test.each(['', ' \t '])('POST /api/bookings rejects a blank guest name %j', async (guestName) => {
  await withCalendar(async (url) => {
    const response = await postBooking(url, consultation.id, '2026-11-30T06:00:00Z', guestName)
    expect(response.status).toBe(400)
  })
})

test('POST /api/bookings returns 404 for an unknown meeting type', async () => {
  await withCalendar(async (url) => {
    const response = await postBooking(url, 'unknown', '2026-11-30T06:00:00Z')
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ message: 'Тип встречи не найден' })
  })
})
