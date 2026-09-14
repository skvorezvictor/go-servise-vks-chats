import type { Room, RoomMember } from 'matrix-js-sdk'
import { Check, CheckCheck } from 'lucide-react'
import { useState } from 'react'
import { isReadByUser } from '../lib/readReceipts'
import { ReadByModal } from './ReadByModal'
import styles from './ReadStatus.module.css'

interface ReadStatusProps {
  room: Room
  eventId: string
  myUserId: string
  isGroup: boolean
  otherMember?: RoomMember
}

/**
 * Показывается только на СВОИХ сообщениях (см. вызов в MessageBubble).
 * В личном чате, одна/две галочки. В группе, "прочитано X из Y" с
 * модалкой по клику (согласовано с пользователем: именно этот вариант
 * из трёх предложенных, а не аватарки и не просто "все прочитали").
 */
export function ReadStatus({ room, eventId, myUserId, isGroup, otherMember }: ReadStatusProps) {
  const [modalOpen, setModalOpen] = useState(false)

  if (!isGroup) {
    const read = otherMember ? isReadByUser(room, otherMember.userId, eventId) : false
    return read ? <CheckCheck size={14} className={styles.read} /> : <Check size={14} className={styles.sent} />
  }

  const others = room.getMembers().filter((m) => m.userId !== myUserId && m.membership === 'join')
  const readCount = others.filter((m) => isReadByUser(room, m.userId, eventId)).length

  return (
    <>
      <button type="button" className={styles.groupStatus} onClick={() => setModalOpen(true)}>
        прочитано {readCount} из {others.length}
      </button>
      {modalOpen && <ReadByModal room={room} eventId={eventId} excludeUserId={myUserId} onClose={() => setModalOpen(false)} />}
    </>
  )
}
