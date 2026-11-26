import type { RouteHandlers } from '../generated/sdk/fastify.gen.ts'
import type { EventType } from '../generated/sdk/types.gen.ts'

export function listEventTypes(catalog: ReadonlyMap<string, EventType>): RouteHandlers['listEventTypes'] {
  return (_request, reply) => {
    reply.code(200).send([...catalog.values()])
  }
}

const russianLetters: Readonly<Record<string, string>> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo',
  ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm',
  н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u',
  ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch',
  ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
}

function eventTypeId(title: string): string {
  return title
    .toLowerCase()
    .replace(/[а-яё]/g, (letter) => russianLetters[letter])
    .normalize('NFKD')
    .replace(/\p{Mark}/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'event-type'
}

export function createEventType(catalog: Map<string, EventType>): RouteHandlers['createEventType'] {
  return (request, reply) => {
    const { title, description, durationMinutes } = request.body
    if (!title.trim() || !description.trim()) {
      reply.code(400).send({ message: 'Введите название и описание типа встречи' })
      return
    }

    const baseId = eventTypeId(title)
    let id = baseId
    for (let suffix = 2; catalog.has(id); suffix++) {
      id = `${baseId}-${suffix}`
    }
    const eventType = { id, title, description, durationMinutes }

    catalog.set(id, eventType)
    reply.code(201).send(eventType)
  }
}
