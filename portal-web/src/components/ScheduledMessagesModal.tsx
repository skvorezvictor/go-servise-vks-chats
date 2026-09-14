import type { MatrixClient, Room } from 'matrix-js-sdk'
import { Trash2 } from 'lucide-react'
import { useRef, useState } from 'react'
import { useScheduledMessages } from '../hooks/useScheduledMessages'
import { cancelScheduledMessage, scheduleMessage } from '../lib/scheduledMessages'
import { MentionAutocomplete } from './MentionAutocomplete'
import { Modal } from './Modal'
import styles from './ScheduledMessagesModal.module.css'

interface ScheduledMessagesModalProps {
  client: MatrixClient
  room: Room
  onClose: () => void
}

function formatDateTime(ts: number): string {
  return new Date(ts).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

/** input[type=datetime-local] хочет локальное время без часового пояса, а не toISOString(). */
function toDatetimeLocalValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/**
 * Планирование/отмена отложенных сообщений для конкретного чата,
 * настоящее серверное планирование (matrix-auth-bridge), уходит даже
 * если ни у кого не открыто приложение к моменту отправки. Отменить
 * может только тот, кто запланировал.
 */
export function ScheduledMessagesModal({ client, room, onClose }: ScheduledMessagesModalProps) {
  const { items, refetch } = useScheduledMessages(client, room.roomId)
  const [text, setText] = useState('')
  const [datetime, setDatetime] = useState('')
  const [mentionQuery, setMentionQuery] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const myUserId = client.getUserId()
  const memberNames = room
    .getMembers()
    .filter((m) => m.userId !== myUserId)
    .map((m) => m.name)

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const value = e.target.value
    setText(value)
    const cursor = e.target.selectionStart
    const beforeCursor = value.slice(0, cursor)
    const match = /@([^\s@]*)$/.exec(beforeCursor)
    setMentionQuery(match ? match[1] : null)
  }

  function pickMention(name: string) {
    const cursor = textareaRef.current?.selectionStart ?? text.length
    const beforeCursor = text.slice(0, cursor)
    const afterCursor = text.slice(cursor)
    const replaced = beforeCursor.replace(/@([^\s@]*)$/, `@${name} `)
    setText(replaced + afterCursor)
    setMentionQuery(null)
    textareaRef.current?.focus()
  }

  async function handleSchedule() {
    const trimmed = text.trim()
    if (!trimmed) {
      setError('Введите текст сообщения')
      return
    }
    if (!datetime) {
      setError('Выберите дату и время')
      return
    }
    const sendAt = new Date(datetime).getTime()
    if (!Number.isFinite(sendAt) || sendAt <= Date.now()) {
      setError('Время должно быть в будущем')
      return
    }

    setSubmitting(true)
    setError(null)
    try {
      await scheduleMessage(client, room.roomId, trimmed, sendAt)
      setText('')
      setDatetime('')
      refetch()
    } catch (err) {
      console.error('не удалось запланировать сообщение', err)
      setError('Не удалось запланировать сообщение')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleCancel(id: string) {
    try {
      await cancelScheduledMessage(client, id)
      refetch()
    } catch (err) {
      console.error('не удалось отменить отложенное сообщение', err)
    }
  }

  const filteredNames =
    mentionQuery !== null
      ? memberNames.filter((name) => name.toLowerCase().includes(mentionQuery.toLowerCase())).slice(0, 6)
      : []

  return (
    <Modal title="Отложенные сообщения" onClose={onClose}>
      <div className={styles.wrap}>
        {items.length > 0 && (
          <div className={`${styles.list} no-scrollbar`}>
            {[...items]
              .sort((a, b) => a.sendAt - b.sendAt)
              .map((m) => (
                <div key={m.id} className={styles.item}>
                  <div className={styles.itemInfo}>
                    <div className={styles.itemTime}>{formatDateTime(m.sendAt)}</div>
                    <div className={styles.itemBody}>{m.body}</div>
                  </div>
                  <button type="button" className={styles.cancelButton} onClick={() => handleCancel(m.id)} title="Отменить">
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
          </div>
        )}

        <div className={styles.form}>
          <label className={styles.label}>
            Дата и время
            <input
              type="datetime-local"
              className={styles.input}
              value={datetime}
              min={toDatetimeLocalValue(new Date(Date.now() + 2 * 60 * 1000))}
              onChange={(e) => setDatetime(e.target.value)}
            />
          </label>
          <label className={styles.label}>
            Сообщение
            <div className={styles.textareaWrapper}>
              {filteredNames.length > 0 && <MentionAutocomplete names={filteredNames} onPick={pickMention} />}
              <textarea
                ref={textareaRef}
                className={styles.textarea}
                value={text}
                onChange={handleChange}
                placeholder="Текст сообщения… (@ для упоминания)"
                rows={3}
              />
            </div>
          </label>
          {error && <div className={styles.error}>{error}</div>}
          <button type="button" className={styles.submit} onClick={handleSchedule} disabled={submitting}>
            {submitting ? 'Планируем…' : 'Запланировать'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
