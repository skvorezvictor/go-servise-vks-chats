import type { MatrixClient, MatrixEvent, Room } from 'matrix-js-sdk'
import { POLL_MSGTYPE, POLL_VOTE_MSGTYPE, POLL_VOTE_RELATION_TYPE, type PollContent, type PollVoteContent } from '../types/events'

/**
 * Опросы сознательно кастомные, не MSC3381 (раздел 15.4 инструкции),
 * официальная спека Matrix Polls показалась слишком тяжеловесной для
 * единственного клиента, который вообще их читает. Сам опрос, обычное
 * m.room.message с msgtype ru.example.portal.poll, поэтому идёт через
 * штатный таймлайн/пагинацию/redaction без специальной обработки истории.
 *
 * msgtype здесь не входит в типизированный SDK-словарь вообще (это
 * осознанно кастомное расширение, а не вариант стандартного msgtype, как
 * у m.image/m.file), поэтому контент отправляется через явный "as never"
 * на границе только этих двух функций, тот же приём, что и у
 * sendVoiceMessage в lib/matrix.ts для нестандартного voice-маркера.
 */
export async function createPoll(client: MatrixClient, roomId: string, question: string, options: string[]): Promise<void> {
  const body = `${question}\n${options.map((o, i) => `${i + 1}. ${o}`).join('\n')}`
  const content: PollContent = { msgtype: POLL_MSGTYPE, body, question, options }
  await client.sendMessage(roomId, content as never)
}

export async function votePoll(client: MatrixClient, roomId: string, pollEventId: string, optionIndex: number): Promise<void> {
  const content: PollVoteContent = {
    msgtype: POLL_VOTE_MSGTYPE,
    body: `Голос за вариант ${optionIndex + 1}`,
    'm.relates_to': { rel_type: POLL_VOTE_RELATION_TYPE, event_id: pollEventId },
    optionIndex,
  }
  await client.sendMessage(roomId, content as never)
}

export interface PollTally {
  /** Индекс варианта -> число голосов. */
  counts: number[]
  total: number
  /** Индекс варианта, за который проголосовал текущий пользователь, если голосовал. */
  myVote: number | null
}

/**
 * Берёт ПОСЛЕДНИЙ голос от каждого отправителя (тот же принцип "последняя
 * версия побеждает", что и у редактирования сообщений) и пересчитывается
 * при каждом новом событии в ленте комнаты.
 */
export function tallyPollVotes(room: Room, pollEvent: MatrixEvent, optionsCount: number, myUserId: string | null): PollTally {
  const lastVoteBySender = new Map<string, number>()

  for (const event of room.getLiveTimeline().getEvents()) {
    if (event.isRedacted()) continue
    const content = event.getContent() as Partial<PollVoteContent>
    const relatesTo = content['m.relates_to']
    if (relatesTo?.rel_type !== POLL_VOTE_RELATION_TYPE || relatesTo.event_id !== pollEvent.getId()) continue

    const sender = event.getSender()
    const optionIndex = content.optionIndex
    if (!sender || typeof optionIndex !== 'number' || optionIndex < 0 || optionIndex >= optionsCount) continue

    lastVoteBySender.set(sender, optionIndex)
  }

  const counts = new Array(optionsCount).fill(0)
  let myVote: number | null = null
  for (const [sender, optionIndex] of lastVoteBySender) {
    counts[optionIndex] += 1
    if (sender === myUserId) myVote = optionIndex
  }

  return { counts, total: lastVoteBySender.size, myVote }
}
