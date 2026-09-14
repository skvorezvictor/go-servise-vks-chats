import type { MatrixClient } from 'matrix-js-sdk'
import { useState } from 'react'
import { createGroupChat } from '../lib/matrix'
import { ContactPicker } from './ContactPicker'
import { Modal } from './Modal'
import styles from './NewGroupChatModal.module.css'

interface NewGroupChatModalProps {
  client: MatrixClient
  onClose: () => void
  onCreated: (roomId: string) => void
}

export function NewGroupChatModal({ client, onClose, onCreated }: NewGroupChatModalProps) {
  const [name, setName] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  async function handleCreate() {
    const groupName = name.trim()

    if (!groupName) {
      setError('Введите название группы')
      return
    }
    if (selected.length === 0) {
      setError('Добавьте хотя бы одного участника')
      return
    }

    setCreating(true)
    setError(null)
    try {
      const room = await createGroupChat(client, groupName, selected)
      onCreated(room.roomId)
    } catch (err) {
      console.error('не удалось создать групповой чат', err)
      setError('Не удалось создать группу')
    } finally {
      setCreating(false)
    }
  }

  return (
    <Modal title="Новая группа" onClose={onClose}>
      <div className={styles.form}>
        <label className={styles.label}>
          Название
          <input className={styles.input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Например, Проект X" />
        </label>
        <label className={styles.label}>
          Участники
          <ContactPicker client={client} selected={selected} onChange={setSelected} />
        </label>
        {error && <div className={styles.error}>{error}</div>}
        <button type="button" className={styles.submit} onClick={handleCreate} disabled={creating}>
          {creating ? 'Создаём…' : 'Создать группу'}
        </button>
      </div>
    </Modal>
  )
}
