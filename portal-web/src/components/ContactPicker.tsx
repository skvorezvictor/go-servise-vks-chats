import type { MatrixClient } from 'matrix-js-sdk'
import { Search } from 'lucide-react'
import { useEffect, useState } from 'react'
import { type Contact, fetchContacts } from '../lib/contactsApi'
import { Avatar } from './Avatar'
import styles from './ContactPicker.module.css'

interface ContactPickerProps {
  client: MatrixClient
  selected: string[]
  onChange: (userIds: string[]) => void
  /** Уже состоящие в комнате, незачем предлагать пригласить их снова. */
  excludeUserIds?: string[]
}

/** Список сотрудников из /app/api/contacts с поиском и множественным выбором. */
export function ContactPicker({ client, selected, onChange, excludeUserIds }: ContactPickerProps) {
  const [contacts, setContacts] = useState<Contact[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')

  useEffect(() => {
    fetchContacts(client)
      .then(setContacts)
      .catch((err) => {
        console.error('не удалось загрузить контакты', err)
        setError('Не удалось загрузить список контактов')
      })
  }, [client])

  function toggle(userId: string) {
    onChange(selected.includes(userId) ? selected.filter((id) => id !== userId) : [...selected, userId])
  }

  if (error) return <div className={styles.error}>{error}</div>
  if (!contacts) return <div className={styles.loading}>Загрузка контактов…</div>

  const excluded = new Set(excludeUserIds ?? [])
  const filtered = contacts
    .filter((c) => !excluded.has(c.userId))
    .filter((c) => c.displayName.toLowerCase().includes(query.toLowerCase()))

  return (
    <div className={styles.picker}>
      <div className={styles.searchWrapper}>
        <Search size={14} className={styles.searchIcon} />
        <input
          className={styles.search}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Поиск по имени"
        />
      </div>
      <div className={`${styles.list} no-scrollbar`}>
        {filtered.length === 0 && <div className={styles.empty}>Никого не нашлось</div>}
        {filtered.map((contact) => (
          <button
            key={contact.userId}
            type="button"
            className={selected.includes(contact.userId) ? `${styles.row} ${styles.rowSelected}` : styles.row}
            onClick={() => toggle(contact.userId)}
          >
            <Avatar mxcUrl={undefined} name={contact.displayName} size={32} />
            <span className={styles.name}>{contact.displayName}</span>
            <span className={styles.checkbox} aria-hidden="true" />
          </button>
        ))}
      </div>
    </div>
  )
}
