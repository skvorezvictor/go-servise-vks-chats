import { type MatrixEvent, type Room, RoomStateEvent } from 'matrix-js-sdk'
import { useEffect, useState } from 'react'
import { getChatConferences } from '../lib/chatConferences'
import { CHAT_CONFERENCES_STATE_EVENT_TYPE, type ChatConferenceEntry } from '../types/events'

/** Живой список конференций, созданных из этого чата: пересчитывается при изменении state-события. */
export function useChatConferences(room: Room): ChatConferenceEntry[] {
  const [items, setItems] = useState<ChatConferenceEntry[]>(() => getChatConferences(room))

  useEffect(() => {
    setItems(getChatConferences(room))

    const onStateEvent = (event: MatrixEvent) => {
      if (event.getType() === CHAT_CONFERENCES_STATE_EVENT_TYPE) setItems(getChatConferences(room))
    }
    room.on(RoomStateEvent.Events, onStateEvent)
    return () => {
      room.removeListener(RoomStateEvent.Events, onStateEvent)
    }
  }, [room])

  return items
}
