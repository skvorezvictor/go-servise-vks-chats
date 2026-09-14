import type { MatrixClient } from 'matrix-js-sdk'
import { Search } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { Avatar } from '../components/Avatar'
import { ContactCardModal } from '../components/ContactCardModal'
import { type Contact, fetchContacts } from '../lib/contactsApi'
import { getMatrixClient, getOrCreateDirectMessage } from '../lib/matrix'
import styles from './ContactsPage.module.css'

export function ContactsPage() {
  const [client, setClient] = useState<MatrixClient | null>(null)
  const [contacts, setContacts] = useState<Contact[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Contact | null>(null)
  const navigate = useNavigate()

  useEffect(() => {
    getMatrixClient()
      .then((c) => {
        setClient(c)
        return fetchContacts(c)
      })
      .then(setContacts)
      .catch((err) => {
        console.error('не удалось загрузить контакты', err)
        setError('Не удалось загрузить контакты')
      })
  }, [])

  async function handleWrite(contact: Contact) {
    if (!client) return
    try {
      const room = await getOrCreateDirectMessage(client, contact.userId)
      setSelected(null)
      navigate(`/app/chats?room=${encodeURIComponent(room.roomId)}`)
    } catch (err) {
      console.error('не удалось начать чат с контактом', err)
    }
  }

  if (error) return <div className={styles.centered}>{error}</div>
  if (!contacts) return <div className={styles.centered}>Загрузка…</div>

  const filtered = contacts.filter((c) => c.displayName.toLowerCase().includes(query.toLowerCase()))

  return (
    <div className={styles.page}>
      <div className={styles.searchWrapper}>
        <Search size={16} className={styles.searchIcon} />
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
          <button key={contact.userId} type="button" className={styles.row} onClick={() => setSelected(contact)}>
            <Avatar mxcUrl={undefined} name={contact.displayName} size={40} />
            <div className={styles.info}>
              <div className={styles.name}>{contact.displayName}</div>
              {contact.about && <div className={styles.about}>{contact.about}</div>}
            </div>
          </button>
        ))}
      </div>

      {selected && (
        <ContactCardModal contact={selected} onClose={() => setSelected(null)} onWrite={() => handleWrite(selected)} />
      )}
    </div>
  )
}
