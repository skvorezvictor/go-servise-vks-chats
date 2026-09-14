import type { MatrixClient, Room } from 'matrix-js-sdk'
import { useMemo } from 'react'

/**
 * Разделительная полоса "непрочитанные сообщения" в ленте (раздел 15.10
 * инструкции). Ключевая тонкость: снимок "докуда прочитано" нужно взять
 * ДО первого рендера и ДО отправки своего read receipt при открытии чата,
 * иначе граница мгновенно съезжает в самый низ и никогда не видна.
 *
 * useMemo вычисляется синхронно во время рендера (до любых эффектов) и
 * пересчитывается только при смене client/room.roomId, то есть ровно
 * один раз на "открытие чата", а не на каждое новое сообщение, пока чат
 * остаётся открытым.
 */
export function useUnreadDivider(client: MatrixClient | null, room: Room | null): string | null {
  return useMemo(() => {
    if (!client || !room) return null
    const userId = client.getUserId()
    return userId ? room.getEventReadUpTo(userId) : null
    // eslint-disable-next-line -- пересчёт намеренно только по roomId, не по каждому изменению room
  }, [client, room?.roomId])
}
