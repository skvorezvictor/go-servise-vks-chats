import type { MatrixClient, Room } from 'matrix-js-sdk'
import { GROUP_AVATAR_EMOJI_STATE_EVENT_TYPE, type GroupAvatarEmojiContent } from '../types/events'

/**
 * Аватар группового чата (3+ участников) в виде эмодзи вместо стандартной
 * иконки, state-событие, тот же приём, что у фона чата. Личным чатам
 * (2 участника) не подходит: там аватар, это аватар собеседника.
 */
export async function setGroupAvatarEmoji(client: MatrixClient, room: Room, emoji: string): Promise<void> {
  const content: GroupAvatarEmojiContent = { emoji }
  await client.sendStateEvent(room.roomId, GROUP_AVATAR_EMOJI_STATE_EVENT_TYPE as never, content as never, '')
}

export function getGroupAvatarEmoji(room: Room): string | null {
  const event = room.currentState.getStateEvents(GROUP_AVATAR_EMOJI_STATE_EVENT_TYPE, '')
  const content = event?.getContent() as Partial<GroupAvatarEmojiContent> | undefined
  return content?.emoji || null
}
