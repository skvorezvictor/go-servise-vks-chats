import type { MatrixClient, Room } from 'matrix-js-sdk'
import { Plus, Video } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { useChatConferences } from '../hooks/useChatConferences'
import { addChatConference } from '../lib/chatConferences'
import { sendConferenceLink } from '../lib/matrix'
import { sanitizeRoomName } from '../lib/transliterate'
import styles from './ChatConferencesPicker.module.css'

interface ChatConferencesPickerProps {
  client: MatrixClient
  room: Room
}

/**
 * Кнопка ВКС в шапке чата: список конференций, уже созданных из этого
 * чата (по клику, сразу в неё), плюс создание новой прямо здесь же.
 */
export function ChatConferencesPicker({ client, room }: ChatConferencesPickerProps) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [shareInChat, setShareInChat] = useState(false)
  const conferences = useChatConferences(room)
  const navigate = useNavigate()
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  function join(slug: string, subject: string) {
    setOpen(false)
    if (shareInChat) {
      // "Отправить ссылку в чат", по желанию пользователя вместо
      // немедленного перехода: скидываем ссылку остальным и остаёмся
      // в чате, а не прыгаем в конференцию сами.
      sendConferenceLink(client, room.roomId, slug, subject).catch((err) => console.error('не удалось отправить ссылку на ВКС', err))
      return
    }
    navigate(`/app/call/${slug}?subject=${encodeURIComponent(subject)}`)
  }

  function createNew() {
    const trimmed = name.trim()
    if (!trimmed) return
    const slug = sanitizeRoomName(trimmed)
    addChatConference(client, room, { slug, subject: trimmed, createdAt: Date.now() }).catch((err) =>
      console.error('не удалось сохранить конференцию в чате', err),
    )
    setName('')
    join(slug, trimmed)
  }

  return (
    <div ref={ref} className={styles.wrapper}>
      <button type="button" onClick={() => setOpen((v) => !v)} title="Видеоконференция">
        <Video size={18} />
      </button>
      {open && (
        <div className={styles.popover}>
          <label className={styles.shareRow}>
            <input type="checkbox" checked={shareInChat} onChange={(e) => setShareInChat(e.target.checked)} />
            Отправить ссылку в чат
          </label>
          {conferences.length > 0 && (
            <div className={`${styles.list} no-scrollbar`}>
              {conferences.map((c) => (
                <button key={c.slug} type="button" className={styles.item} onClick={() => join(c.slug, c.subject)}>
                  {c.subject}
                </button>
              ))}
            </div>
          )}
          <div className={styles.newRow}>
            <input
              className={styles.input}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Новая конференция"
              onKeyDown={(e) => e.key === 'Enter' && createNew()}
              autoFocus
            />
            <button type="button" className={styles.addButton} onClick={createNew} disabled={!name.trim()} title="Создать и перейти">
              <Plus size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
