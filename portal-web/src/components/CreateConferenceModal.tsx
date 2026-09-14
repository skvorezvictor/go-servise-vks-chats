import { useState } from 'react'
import { useNavigate } from 'react-router'
import { sanitizeRoomName } from '../lib/transliterate'
import { Modal } from './Modal'
import styles from './NewGroupChatModal.module.css'

interface CreateConferenceModalProps {
  onClose: () => void
}

/**
 * Название вводит сам сотрудник (не генерируется случайно, раздел 10.7
 * инструкции). Кириллица транслитерируется только для URL-slug, оригинал
 * идёт как ?subject= и показывается настоящим названием встречи в Jitsi.
 */
export function CreateConferenceModal({ onClose }: CreateConferenceModalProps) {
  const [name, setName] = useState('')
  const navigate = useNavigate()

  function handleCreate() {
    const trimmed = name.trim()
    if (!trimmed) return
    const slug = sanitizeRoomName(trimmed)
    navigate(`/app/call/${slug}?subject=${encodeURIComponent(trimmed)}`)
    onClose()
  }

  return (
    <Modal title="Новая конференция" onClose={onClose}>
      <div className={styles.form}>
        <input
          className={styles.input}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Название встречи"
          autoFocus
          onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
        />
        <button type="button" className={styles.submit} onClick={handleCreate} disabled={!name.trim()}>
          Создать
        </button>
      </div>
    </Modal>
  )
}
