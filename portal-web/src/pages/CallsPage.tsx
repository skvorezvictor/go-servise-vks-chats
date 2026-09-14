import { Trash2, Video } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { ConfirmModal } from '../components/ConfirmModal'
import { type CallLogEntry, deleteCallEntry, fetchCallLog } from '../lib/callsApi'
import { getMatrixClient } from '../lib/matrix'
import styles from './CallsPage.module.css'

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export function CallsPage() {
  const [entries, setEntries] = useState<CallLogEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [deletingEntry, setDeletingEntry] = useState<{ id: string; room: string } | null>(null)
  const navigate = useNavigate()

  useEffect(() => {
    getMatrixClient()
      .then((client) => fetchCallLog(client))
      .then(setEntries)
      .catch((err) => {
        console.error('не удалось загрузить журнал звонков', err)
        setError('Не удалось загрузить журнал звонков')
      })
  }, [])

  async function handleDelete() {
    if (!deletingEntry) return
    const { id } = deletingEntry
    setDeletingEntry(null)
    setEntries((prev) => prev?.filter((entry) => entry.id !== id) ?? null)
    try {
      const client = await getMatrixClient()
      await deleteCallEntry(client, id)
    } catch (err) {
      console.error('не удалось удалить запись журнала звонков', err)
    }
  }

  if (error) return <div className={styles.centered}>{error}</div>
  if (!entries) return <div className={styles.centered}>Загрузка…</div>

  return (
    <div className={styles.page}>
      <div className={`${styles.list} no-scrollbar`}>
        {entries.length === 0 && <div className={styles.empty}>Пока нет звонков</div>}
        {entries.map((entry) => (
          // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
          <div
            key={entry.id}
            role="button"
            tabIndex={0}
            className={styles.row}
            onClick={() => navigate(`/app/call/${entry.room}`)}
            onKeyDown={(e) => e.key === 'Enter' && navigate(`/app/call/${entry.room}`)}
          >
            <div className={styles.icon}>
              <Video size={18} />
            </div>
            <div className={styles.info}>
              <div className={styles.room}>{entry.room}</div>
              <div className={styles.time}>{formatDateTime(entry.startedAt)}</div>
            </div>
            <button
              type="button"
              className={styles.delete}
              onClick={(e) => {
                e.stopPropagation()
                setDeletingEntry({ id: entry.id, room: entry.room })
              }}
              title="Удалить"
            >
              <Trash2 size={16} />
            </button>
          </div>
        ))}
      </div>

      {deletingEntry && (
        <ConfirmModal
          title="Удалить запись"
          text={`Удалить запись о конференции «${deletingEntry.room}» из журнала звонков?`}
          onConfirm={handleDelete}
          onClose={() => setDeletingEntry(null)}
        />
      )}
    </div>
  )
}
