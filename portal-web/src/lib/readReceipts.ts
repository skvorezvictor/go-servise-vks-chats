import type { Room } from 'matrix-js-sdk'

/**
 * Matrix даёт только "прочитано вплоть до события E" на пользователя, не
 * булев флаг на конкретное сообщение. Чтобы понять, прочитано ли ИМЕННО
 * это сообщение, нужно сравнить позицию чужого read receipt-а с позицией
 * сообщения в таймлайне, этой функции в SDK нет, пишем сами.
 *
 * -1: a раньше b, 0: то же событие, 1: a позже b, null: одно из событий не
 * найдено в загруженных сейчас сегментах таймлайна (например, чужой receipt
 * указывает дальше в историю, чем сейчас подгружено), в этом случае вызывающий
 * код должен считать "не удалось определить", а не гадать в пользу true/false.
 */
export function compareEventPosition(room: Room, eventIdA: string, eventIdB: string): -1 | 0 | 1 | null {
  if (eventIdA === eventIdB) return 0

  const events = room
    .getUnfilteredTimelineSet()
    .getTimelines()
    .flatMap((timeline) => timeline.getEvents())

  const indexA = events.findIndex((e) => e.getId() === eventIdA)
  const indexB = events.findIndex((e) => e.getId() === eventIdB)

  if (indexA === -1 || indexB === -1) return null
  if (indexA === indexB) return 0
  return indexA < indexB ? -1 : 1
}

/**
 * Сообщение считается прочитанным пользователем, если его read receipt
 * указывает НА это событие или ПОЗЖЕ него (receipt-ы включают отмеченное
 * событие и всё, что до него).
 */
export function isReadByUser(room: Room, userId: string, messageEventId: string): boolean {
  const readUpToId = room.getEventReadUpTo(userId)
  if (!readUpToId) return false

  const cmp = compareEventPosition(room, readUpToId, messageEventId)
  return cmp !== null && cmp >= 0
}
