import { EventType, type MatrixClient, RelationType, type Room } from 'matrix-js-sdk'
import { addReaction, removeReaction } from '../lib/matrix'
import styles from './ReactionBar.module.css'

interface ReactionBarProps {
  client: MatrixClient
  room: Room
  eventId: string
}

/**
 * Только пилюли уже поставленных реакций (m.reaction/m.annotation,
 * раздел 15.1 инструкции). Кнопка добавления новой реакции, одна, в
 * MessageBubble.actions сверху, здесь её дублировать не нужно.
 */
export function ReactionBar({ client, room, eventId }: ReactionBarProps) {
  const myUserId = client.getUserId()

  const relations = room.relations.getChildEventsForEvent(eventId, RelationType.Annotation, EventType.Reaction)
  const grouped = relations?.getSortedAnnotationsByKey() ?? []

  if (grouped.length === 0) return null

  function handleToggle(emoji: string, ownReactionEventId: string | undefined) {
    if (ownReactionEventId) {
      removeReaction(client, room.roomId, ownReactionEventId).catch((err) => console.error('не удалось снять реакцию', err))
    } else {
      addReaction(client, room.roomId, eventId, emoji).catch((err) => console.error('не удалось поставить реакцию', err))
    }
  }

  return (
    <div className={styles.bar}>
      {grouped.map(([emoji, events]) => {
        const ownEvent = [...events].find((e) => e.getSender() === myUserId)
        return (
          <button
            key={emoji}
            type="button"
            className={ownEvent ? `${styles.pill} ${styles.pillMine}` : styles.pill}
            onClick={() => handleToggle(emoji, ownEvent?.getId())}
          >
            {emoji} {events.size}
          </button>
        )
      })}
    </div>
  )
}
