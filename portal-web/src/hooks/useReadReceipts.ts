import type { Room } from 'matrix-js-sdk'
import { RoomEvent } from 'matrix-js-sdk'
import { useEffect, useState } from 'react'

/**
 * Отдельный от useUnreadDivider хук (сознательно, см. комментарий там):
 * тот фиксирует МОЮ позицию один раз при открытии чата, этот, живо
 * отслеживает ЧУЖИЕ receipt-ы, пока чат открыт, и не должен вмешиваться
 * в момент отправки своего receipt-а или в зафиксированную границу
 * непрочитанного.
 *
 * Сам по себе не хранит статус прочтения, только инкрементирует счётчик
 * при изменениях, чтобы компоненты, читающие isReadByUser/getReceiptsForEvent
 * напрямую из room при каждом рендере, знали, когда пересчитать.
 */
export function useReadReceiptsTick(room: Room | null): number {
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (!room) return

    const bump = () => setTick((t) => t + 1)
    room.on(RoomEvent.Receipt, bump)
    room.on(RoomEvent.Timeline, bump)

    return () => {
      room.removeListener(RoomEvent.Receipt, bump)
      room.removeListener(RoomEvent.Timeline, bump)
    }
  }, [room])

  return tick
}
