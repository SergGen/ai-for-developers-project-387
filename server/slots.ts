import type { RouteHandlers } from '../generated/sdk/fastify.gen.ts'
import type { EventType } from '../generated/sdk/types.gen.ts'
import { bookingDays, overlaps, slotsForDay } from './schedule.ts'
import type { Interval } from './schedule.ts'

export function listSlots(
  catalog: ReadonlyMap<string, EventType>,
  calendar: readonly Interval[],
  now: () => Date,
): RouteHandlers['listSlots'] {
  return (request, reply) => {
    const eventType = catalog.get(request.params.id)
    if (!eventType) {
      reply.code(404).send({ message: 'Тип встречи не найден' })
      return
    }

    const days = bookingDays(now())
    const slots = days.flatMap((day) => slotsForDay(day, eventType.durationMinutes))
      .map((interval) => ({
        ...interval,
        available: !calendar.some((booking) => overlaps(interval, booking)),
      }))

    reply.code(200).send({ eventType, days, slots })
  }
}
