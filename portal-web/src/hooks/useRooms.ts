import { ClientEvent, type MatrixClient, type Room, RoomEvent } from 'matrix-js-sdk'
import { useEffect, useState } from 'react'

export interface RoomSummary {
  room: Room
  unread: boolean
  unreadCount: number
  /** Личный чат (ровно 2 участника) или групповой (3+). */
  isGroup: boolean
}

/**
 * Список чатов (личных и групповых, этап 2) с признаком непрочитанного.
 *
 * Подписка на события уровня клиента (client.on), а не комнаты (room.on):
 * MatrixClient ре-эмиттит на уровень клиента почти все нужные события
 * комнаты (Timeline/MyMembership/Receipt/RoomState.*, см. _createAndReEmitRoom
 * в matrix-js-sdk), КРОМЕ Room.UnreadNotifications, этого события в списке
 * ре-эмита нет (проверено по исходникам sync.js), сервер присылает счётчик
 * непрочитанных отдельно от самих событий таймлайна, и он обновляется на
 * объекте комнаты чуть позже, чем приходит Timeline. Из-за этого пересчёт
 * по одному только Timeline читал ещё не обновившийся (нулевой) счётчик, и
 * бейдж "не прочитано" гас именно в момент прихода уведомления. Поэтому
 * Room.UnreadNotifications подписываем персонально на каждую комнату.
 */
export function useRooms(client: MatrixClient | null): RoomSummary[] {
  const [rooms, setRooms] = useState<RoomSummary[]>([])

  useEffect(() => {
    if (!client) {
      setRooms([])
      return
    }

    let subscribed: Room[] = []

    function syncUnreadSubscriptions(currentRooms: Room[]) {
      for (const room of subscribed) {
        if (!currentRooms.includes(room)) room.removeListener(RoomEvent.UnreadNotifications, recompute)
      }
      for (const room of currentRooms) {
        if (!subscribed.includes(room)) room.on(RoomEvent.UnreadNotifications, recompute)
      }
      subscribed = currentRooms
    }

    function recompute() {
      if (!client) return
      const visibleRooms = client
        .getVisibleRooms()
        .filter((room) => {
          const membership = room.getMyMembership()
          return (membership === 'join' || membership === 'invite') && room.getMembers().length >= 2
        })

      syncUnreadSubscriptions(visibleRooms)

      const summaries = visibleRooms
        .map((room) => {
          const unreadCount = room.getUnreadNotificationCount()
          return {
            room,
            unread: unreadCount > 0,
            unreadCount,
            isGroup: room.getMembers().length > 2,
          }
        })
        .sort((a, b) => (b.room.getLastActiveTimestamp() ?? 0) - (a.room.getLastActiveTimestamp() ?? 0))

      setRooms(summaries)
    }

    recompute()

    client.on(RoomEvent.Timeline, recompute)
    client.on(ClientEvent.Room, recompute)
    client.on(RoomEvent.MyMembership, recompute)
    client.on(RoomEvent.Receipt, recompute)

    // Подстраховка: список чатов уже несколько раз оказывался "не тем,
    // что реально в SDK", хотя подписки на конкретные события выглядят
    // правильными по документации, вместо того чтобы ловить ещё один
    // недостающий тип события, раз в несколько секунд просто сверяемся
    // с состоянием клиента напрямую. Разница на глаз незаметна, а список
    // гарантированно не залипает надолго независимо от точной причины.
    const pollId = window.setInterval(recompute, 4000)

    return () => {
      client.removeListener(RoomEvent.Timeline, recompute)
      client.removeListener(ClientEvent.Room, recompute)
      client.removeListener(RoomEvent.MyMembership, recompute)
      client.removeListener(RoomEvent.Receipt, recompute)
      for (const room of subscribed) room.removeListener(RoomEvent.UnreadNotifications, recompute)
      window.clearInterval(pollId)
    }
  }, [client])

  return rooms
}
