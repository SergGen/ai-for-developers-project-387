import type { RouteHandlers } from '../generated/sdk/fastify.gen.ts'
import type { EventType } from '../generated/sdk/types.gen.ts'
import { overlaps, slotAt } from './schedule.ts'
import type { Interval } from './schedule.ts'

export interface Booking extends Interval {
  eventTypeId: string
  guestName: string
}

export function listUpcomingBookings(
  catalog: ReadonlyMap<string, EventType>,
  calendar: readonly Booking[],
  now: () => Date,
): RouteHandlers['listUpcomingBookings'] {
  return (_request, reply) => {
    const currentTime = now().getTime()
    const bookings = calendar
      .filter(({ startsAt }) => Date.parse(startsAt) > currentTime)
      .sort((first, second) => Date.parse(first.startsAt) - Date.parse(second.startsAt))
      .flatMap(({ eventTypeId, ...booking }) => {
        const eventType = catalog.get(eventTypeId)
        return eventType ? [{ ...booking, eventType }] : []
      })
    reply.code(200).send(bookings)
  }
}

export function createBooking(
  catalog: ReadonlyMap<string, EventType>,
  calendar: Booking[],
  now: () => Date,
): RouteHandlers['createBooking'] {
  return (request, reply) => {
    const { eventTypeId, startsAt, guestName } = request.body
    const eventType = catalog.get(eventTypeId)
    if (!eventType) {
      reply.code(404).send({ message: 'Тип встречи не найден' })
      return
    }

    const name = guestName.trim()
    if (!name) {
      reply.code(400).send({ message: 'Введите имя' })
      return
    }

    const interval = slotAt(startsAt, eventType.durationMinutes, now())
    if (!interval) {
      reply.code(400).send({ message: 'Выберите время из расписания' })
      return
    }

    // Checking and adding the booking share one synchronous turn of the event loop.
    if (calendar.some((booking) => overlaps(interval, booking))) {
      reply.code(409).send({ message: 'Это время уже занято. Выберите другой слот' })
      return
    }

    calendar.push({ ...interval, eventTypeId, guestName: name })
    reply.code(201).send({ ...interval, eventType, guestName: name })
  }
}
