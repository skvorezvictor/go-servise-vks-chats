import { type MatrixClient, type MatrixEvent, type Room, RoomEvent } from 'matrix-js-sdk'
import { useEffect, useState } from 'react'

/** Живой список событий таймлайна открытой комнаты. */
export function useRoomTimeline(room: Room | null): MatrixEvent[] {
  const [events, setEvents] = useState<MatrixEvent[]>([])

  useEffect(() => {
    if (!room) {
      setEvents([])
      return
    }

    function recompute() {
      if (!room) return
      setEvents(room.getLiveTimeline().getEvents().slice())
    }

    recompute()

    const onChange = () => recompute()
    room.on(RoomEvent.Timeline, onChange)
    // Сама редакция приходит как новое событие в таймлайн и уже вызвала бы
    // recompute через Timeline выше, но подписываемся на Redaction отдельно
    // и явно: redactEvent должен гарантированно убирать сообщение из ленты
    // сразу, без полагания на побочный эффект другого листенера.
    room.on(RoomEvent.Redaction, onChange)

    return () => {
      room.removeListener(RoomEvent.Timeline, onChange)
      room.removeListener(RoomEvent.Redaction, onChange)
    }
  }, [room])

  return events
}

/**
 * Отправляет read receipt на последнее событие открытого чата, но только
 * когда сообщение реально видно: лента докручена почти до низа И вкладка
 * браузера в фокусе. Раньше receipt уходил просто потому, что чат был
 * "выбран" (ChatWindow смонтирован рядом со списком всегда, это не
 * отдельная страница), даже если чат оказался выбран случайно (например
 * в URL остался старый ?room=... с прошлого захода) или пользователь читал
 * историю выше, а новое сообщение пришло внизу вне поля зрения. Именно
 * так непрочитанные тихо обнулялись раньше, чем их кто-то увидел.
 */
export function useMarkAsRead(client: MatrixClient | null, room: Room | null, events: MatrixEvent[], isNearBottom: boolean) {
  const lastEvent = events[events.length - 1]
  const lastEventId = lastEvent?.getId()

  useEffect(() => {
    if (!client || !room || !lastEvent || !isNearBottom) return
    // Локальное эхо (наше же только что отправленное сообщение) носит
    // временный id вида "~!roomId:txnId" до подтверждения сервером,
    // Synapse отвечает 400 на receipt с таким id. Как только сервер
    // подтвердит отправку, id в таймлайне сменится на настоящий, этот
    // эффект перезапустится по новому lastEventId и receipt уйдёт тогда.
    if (lastEvent.isSending()) return

    let cancelled = false
    function trySend() {
      if (cancelled || !document.hasFocus()) return
      client?.sendReadReceipt(lastEvent).catch((err) => {
        console.error(`не удалось отправить read receipt в ${room?.roomId}`, err)
      })
    }
    trySend()
    window.addEventListener('focus', trySend)
    document.addEventListener('visibilitychange', trySend)
    return () => {
      cancelled = true
      window.removeEventListener('focus', trySend)
      document.removeEventListener('visibilitychange', trySend)
    }
    // Зависимость именно от id последнего события, а не от самого объекта
    // lastEvent: не пересылать receipt на каждый ререндер того же
    // таймлайна, только когда реально сменилось последнее событие.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [client, room, lastEventId, isNearBottom])
}
