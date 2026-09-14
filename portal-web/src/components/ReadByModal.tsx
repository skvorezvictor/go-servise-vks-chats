import type { Room } from 'matrix-js-sdk'
import { Avatar } from './Avatar'
import { Modal } from './Modal'
import { compareEventPosition } from '../lib/readReceipts'
import styles from './ReadByModal.module.css'

interface ReadByModalProps {
  room: Room
  eventId: string
  excludeUserId: string | null
  onClose: () => void
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

/**
 * Расширение ParticipantsModal: список участников + время прочтения этого
 * конкретного сообщения. Раньше фильтровался по membership==='join', тот,
 * кто ещё не принял приглашение (не открывал приложение), молча пропадал
 * из списка, будто его вообще нет в чате. Показываем всех, как в
 * ParticipantsModal, с отдельным статусом для не вступивших.
 */
export function ReadByModal({ room, eventId, excludeUserId, onClose }: ReadByModalProps) {
  const members = room.getMembers().filter((m) => m.userId !== excludeUserId)

  const rows = members.map((member) => {
    if (member.membership !== 'join') {
      return { member, readAt: null, joined: false }
    }
    const receipt = room.getReadReceiptForUserId(member.userId)
    const cmp = receipt ? compareEventPosition(room, receipt.eventId, eventId) : null
    const hasRead = cmp !== null && cmp >= 0
    return { member, readAt: hasRead ? (receipt?.data.ts ?? null) : null, joined: true }
  })

  rows.sort((a, b) => (b.readAt ?? 0) - (a.readAt ?? 0))

  function statusText({ readAt, joined }: { readAt: number | null; joined: boolean }): string {
    if (!joined) return 'ещё не вступил(а) в чат'
    return readAt ? formatTime(readAt) : 'ещё не прочитано'
  }

  return (
    <Modal title="Прочитали" onClose={onClose}>
      <div className={styles.list}>
        {rows.map((row) => (
          <div key={row.member.userId} className={styles.item}>
            <Avatar mxcUrl={row.member.getMxcAvatarUrl()} name={row.member.name} size={32} />
            <div className={styles.info}>
              <div className={styles.name}>{row.member.name}</div>
              <div className={styles.status}>{statusText(row)}</div>
            </div>
          </div>
        ))}
      </div>
    </Modal>
  )
}
