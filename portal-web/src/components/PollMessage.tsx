import type { MatrixClient, MatrixEvent, Room } from 'matrix-js-sdk'
import { tallyPollVotes, votePoll } from '../lib/poll'
import type { PollContent } from '../types/events'
import styles from './PollMessage.module.css'

interface PollMessageProps {
  client: MatrixClient
  room: Room
  event: MatrixEvent
}

/**
 * Опросы, созданные утраченной оригинальной версией фронтенда, всё ещё
 * лежат в истории реальных комнат с вариантами в виде объектов
 * {id, text}, наш createPoll пишет только string[], но старые события
 * никуда не делись и должны продолжать рендериться.
 */
function optionLabel(option: unknown): string {
  if (typeof option === 'string') return option
  if (option && typeof option === 'object' && 'text' in option) return String((option as { text: unknown }).text)
  return String(option)
}

export function PollMessage({ client, room, event }: PollMessageProps) {
  const content = event.getContent() as unknown as PollContent
  const eventId = event.getId()
  const myUserId = client.getUserId()

  if (!eventId || !Array.isArray(content.options)) return null

  const tally = tallyPollVotes(room, event, content.options.length, myUserId)

  function handleVote(optionIndex: number) {
    if (!eventId) return
    votePoll(client, room.roomId, eventId, optionIndex).catch((err) => console.error('не удалось проголосовать', err))
  }

  return (
    <div className={styles.poll}>
      <div className={styles.question}>{content.question}</div>
      <div className={styles.options}>
        {content.options.map((option, index) => {
          const count = tally.counts[index] ?? 0
          const percent = tally.total > 0 ? Math.round((count / tally.total) * 100) : 0
          const isMine = tally.myVote === index

          return (
            <button
              key={index}
              type="button"
              className={isMine ? `${styles.option} ${styles.optionVoted}` : styles.option}
              onClick={() => handleVote(index)}
            >
              <div className={styles.optionBar} style={{ width: `${percent}%` }} />
              <span className={styles.optionLabel}>{optionLabel(option)}</span>
              <span className={styles.optionCount}>
                {count} · {percent}%
              </span>
            </button>
          )
        })}
      </div>
      <div className={styles.total}>Всего голосов: {tally.total}</div>
    </div>
  )
}
