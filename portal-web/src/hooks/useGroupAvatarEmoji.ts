import { type MatrixEvent, type Room, RoomStateEvent } from 'matrix-js-sdk'
import { useEffect, useState } from 'react'
import { getGroupAvatarEmoji } from '../lib/groupAvatar'
import { GROUP_AVATAR_EMOJI_STATE_EVENT_TYPE } from '../types/events'

/** Живой эмодзи-аватар группового чата: пересчитывается при изменении state-события в комнате. */
export function useGroupAvatarEmoji(room: Room): string | null {
  const [emoji, setEmoji] = useState<string | null>(() => getGroupAvatarEmoji(room))

  useEffect(() => {
    setEmoji(getGroupAvatarEmoji(room))

    const onStateEvent = (event: MatrixEvent) => {
      if (event.getType() === GROUP_AVATAR_EMOJI_STATE_EVENT_TYPE) setEmoji(getGroupAvatarEmoji(room))
    }
    room.on(RoomStateEvent.Events, onStateEvent)
    return () => {
      room.removeListener(RoomStateEvent.Events, onStateEvent)
    }
  }, [room])

  return emoji
}
