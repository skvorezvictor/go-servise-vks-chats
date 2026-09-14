import type { MatrixClient, Room } from 'matrix-js-sdk'
import { CHAT_CONFERENCES_STATE_EVENT_TYPE, type ChatConferenceEntry, type ChatConferencesContent } from '../types/events'

const MAX_ENTRIES = 20

export function getChatConferences(room: Room): ChatConferenceEntry[] {
  const event = room.currentState.getStateEvents(CHAT_CONFERENCES_STATE_EVENT_TYPE, '')
  const content = event?.getContent() as Partial<ChatConferencesContent> | undefined
  return content?.items ?? []
}

/** Добавляет конференцию в список этого чата (новые сверху, без дублей по slug). */
export async function addChatConference(client: MatrixClient, room: Room, entry: ChatConferenceEntry): Promise<void> {
  const existing = getChatConferences(room).filter((c) => c.slug !== entry.slug)
  const content: ChatConferencesContent = { items: [entry, ...existing].slice(0, MAX_ENTRIES) }
  await client.sendStateEvent(room.roomId, CHAT_CONFERENCES_STATE_EVENT_TYPE as never, content as never, '')
}
