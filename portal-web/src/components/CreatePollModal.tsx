import type { MatrixClient } from 'matrix-js-sdk'
import { Plus, X } from 'lucide-react'
import { useState } from 'react'
import { createPoll } from '../lib/poll'
import { Modal } from './Modal'
import styles from './CreatePollModal.module.css'

interface CreatePollModalProps {
  client: MatrixClient
  roomId: string
  onClose: () => void
}

export function CreatePollModal({ client, roomId, onClose }: CreatePollModalProps) {
  const [question, setQuestion] = useState('')
  const [options, setOptions] = useState(['', ''])
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  function updateOption(index: number, value: string) {
    setOptions((prev) => prev.map((o, i) => (i === index ? value : o)))
  }

  function addOption() {
    setOptions((prev) => [...prev, ''])
  }

  function removeOption(index: number) {
    setOptions((prev) => prev.filter((_, i) => i !== index))
  }

  async function handleCreate() {
    const q = question.trim()
    const cleanOptions = options.map((o) => o.trim()).filter(Boolean)

    if (!q) {
      setError('Введите вопрос')
      return
    }
    if (cleanOptions.length < 2) {
      setError('Нужно минимум два варианта ответа')
      return
    }

    setCreating(true)
    setError(null)
    try {
      await createPoll(client, roomId, q, cleanOptions)
      onClose()
    } catch (err) {
      console.error('не удалось создать опрос', err)
      setError('Не удалось создать опрос')
    } finally {
      setCreating(false)
    }
  }

  return (
    <Modal title="Новый опрос" onClose={onClose}>
      <div className={styles.form}>
        <input
          className={styles.question}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Вопрос"
        />

        <div className={styles.options}>
          {options.map((option, index) => (
            <div key={index} className={styles.optionRow}>
              <input
                className={styles.optionInput}
                value={option}
                onChange={(e) => updateOption(index, e.target.value)}
                placeholder={`Вариант ${index + 1}`}
              />
              {options.length > 2 && (
                <button type="button" className={styles.removeOption} onClick={() => removeOption(index)}>
                  <X size={16} />
                </button>
              )}
            </div>
          ))}
        </div>

        <button type="button" className={styles.addOption} onClick={addOption}>
          <Plus size={14} /> Добавить вариант
        </button>

        {error && <div className={styles.error}>{error}</div>}

        <button type="button" className={styles.submit} onClick={handleCreate} disabled={creating}>
          {creating ? 'Создаём…' : 'Создать опрос'}
        </button>
      </div>
    </Modal>
  )
}
