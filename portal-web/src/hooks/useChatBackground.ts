import { type MatrixClient, type MatrixEvent, type Room, RoomStateEvent } from 'matrix-js-sdk'
import { useEffect, useState } from 'react'
import { fetchAuthedMediaBlobUrl } from '../lib/matrix'
import { getChatBackground } from '../lib/chatBackground'
import { CHAT_BACKGROUND_STATE_EVENT_TYPE } from '../types/events'

/** Живой фон чата: перезагружается при изменении state-события в комнате. */
export function useChatBackground(client: MatrixClient, room: Room): string | null {
  const [blobUrl, setBlobUrl] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    let objectUrl: string | null = null

    function load() {
      const background = getChatBackground(room)
      if (!background) {
        setBlobUrl(null)
        return
      }
      fetchAuthedMediaBlobUrl(client, background.value)
        .then((url) => {
          if (cancelled) return
          objectUrl = url
          setBlobUrl(url)
        })
        .catch((err) => console.error('не удалось загрузить фон чата', err))
    }

    load()

    const onStateEvent = (event: MatrixEvent) => {
      if (event.getType() === CHAT_BACKGROUND_STATE_EVENT_TYPE) load()
    }
    room.on(RoomStateEvent.Events, onStateEvent)

    return () => {
      cancelled = true
      room.removeListener(RoomStateEvent.Events, onStateEvent)
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [client, room])

  return blobUrl
}
