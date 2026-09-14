import type { MatrixClient } from 'matrix-js-sdk'
import { Link2, Search } from 'lucide-react'
import { useEffect, useState } from 'react'
import { type Contact, fetchContacts } from '../lib/contactsApi'
import { createInviteLink, createInviteLinkRoom, getOrCreateDirectMessage } from '../lib/matrix'
import { Avatar } from './Avatar'
import { Modal } from './Modal'
import styles from './ContactPicker.module.css'
import ownStyles from './NewChatModal.module.css'

interface NewChatModalProps {
  client: MatrixClient
  onClose: () => void
  onCreated: (roomId: string) => void
}

/** «Написать», выбор адресата из справочника контактов вместо ручного ввода Matrix ID. */
export function NewChatModal({ client, onClose, onCreated }: NewChatModalProps) {
  const [contacts, setContacts] = useState<Contact[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [starting, setStarting] = useState(false)
  const [creatingLink, setCreatingLink] = useState(false)
  const [linkCopied, setLinkCopied] = useState(false)

  useEffect(() => {
    fetchContacts(client)
      .then(setContacts)
      .catch((err) => {
        console.error('не удалось загрузить контакты', err)
        setError('Не удалось загрузить список контактов')
      })
  }, [client])

  async function handlePick(contact: Contact) {
    setStarting(true)
    setError(null)
    try {
      const room = await getOrCreateDirectMessage(client, contact.userId)
      onCreated(room.roomId)
    } catch (err) {
      console.error('не удалось начать чат', err)
      setError('Не удалось начать чат с этим пользователем')
      setStarting(false)
    }
  }

  /** Человека ещё нет в справочнике (не заходил в портал), создаём чат и делимся ссылкой вместо приглашения по ID. */
  async function handleCreateInviteLink() {
    setCreatingLink(true)
    setLinkCopied(false)
    setError(null)
    try {
      const room = await createInviteLinkRoom(client)
      const link = await createInviteLink(client, room.roomId)
      await navigator.clipboard.writeText(link)
      setLinkCopied(true)
    } catch (err) {
      console.error('не удалось создать ссылку-приглашение', err)
      setError('Не удалось создать ссылку-приглашение')
    } finally {
      setCreatingLink(false)
    }
  }

  const filtered = (contacts ?? []).filter((c) => c.displayName.toLowerCase().includes(query.toLowerCase()))

  return (
    <Modal title="Написать" onClose={onClose}>
      <div className={styles.picker}>
        <div className={styles.searchWrapper}>
          <Search size={14} className={styles.searchIcon} />
          <input
            className={styles.search}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск по имени"
            autoFocus
          />
        </div>

        {error && <div className={styles.error}>{error}</div>}
        {!error && !contacts && <div className={styles.loading}>Загрузка контактов…</div>}

        {contacts && (
          <div className={`${styles.list} no-scrollbar`}>
            {filtered.length === 0 && <div className={styles.empty}>Никого не нашлось</div>}
            {filtered.map((contact) => (
              <button
                key={contact.userId}
                type="button"
                className={styles.row}
                onClick={() => handlePick(contact)}
                disabled={starting}
              >
                <Avatar mxcUrl={undefined} name={contact.displayName} size={32} />
                <span className={styles.name}>{contact.displayName}</span>
              </button>
            ))}
          </div>
        )}

        <button type="button" className={ownStyles.linkButton} onClick={handleCreateInviteLink} disabled={creatingLink}>
          <Link2 size={16} /> {linkCopied ? 'Ссылка скопирована' : 'Пригласить по ссылке'}
        </button>
        <div className={ownStyles.hint}>Если человека ещё нет в списке, он не заходил в портал: ссылка заведёт новый чат и скопируется в буфер.</div>
      </div>
    </Modal>
  )
}
