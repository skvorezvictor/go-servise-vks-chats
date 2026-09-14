import type { MatrixClient, Room } from 'matrix-js-sdk'
import { Clock, Trash2, Users, UserPlus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'
import { Avatar } from '../components/Avatar'
import { ChatWindow } from '../components/ChatWindow'
import { ConfirmModal } from '../components/ConfirmModal'
import { NewChatModal } from '../components/NewChatModal'
import { NewGroupChatModal } from '../components/NewGroupChatModal'
import { ScheduledMessagesModal } from '../components/ScheduledMessagesModal'
import { useRooms } from '../hooks/useRooms'
import { useScheduledMessages } from '../hooks/useScheduledMessages'
import { getGroupAvatarEmoji } from '../lib/groupAvatar'
import { getMatrixClient, leaveChat } from '../lib/matrix'
import styles from './ChatsPage.module.css'

export function ChatsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [client, setClient] = useState<MatrixClient | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(() => searchParams.get('room'))
  const [newChatOpen, setNewChatOpen] = useState(false)
  const [newGroupOpen, setNewGroupOpen] = useState(false)
  const [deletingRoom, setDeletingRoom] = useState<{ id: string; name: string } | null>(null)
  const [schedulingRoomId, setSchedulingRoomId] = useState<string | null>(null)
  const [joinError, setJoinError] = useState<string | null>(null)

  useEffect(() => {
    getMatrixClient()
      .then(setClient)
      .catch((err) => {
        console.error('не удалось инициализировать Matrix-клиент', err)
        setError('Не удалось подключиться. Попробуйте обновить страницу.')
      })
  }, [])

  // Переход по ссылке-приглашению (?joinRoom=): вступаем и переключаемся на
  // этот чат, убираем параметр из URL, чтобы повторный переход по нему же
  // (или обновление страницы) не пытался вступить заново.
  useEffect(() => {
    if (!client) return
    const joinRoomId = searchParams.get('joinRoom')
    if (!joinRoomId) return

    client
      .joinRoom(joinRoomId)
      .then(() => {
        setSelectedRoomId(joinRoomId)
        setSearchParams(
          (prev) => {
            const next = new URLSearchParams(prev)
            next.delete('joinRoom')
            next.set('room', joinRoomId)
            return next
          },
          { replace: true },
        )
      })
      .catch((err) => {
        console.error('не удалось войти в чат по ссылке', err)
        setJoinError('Не удалось войти в чат по этой ссылке')
      })
  }, [client, searchParams, setSearchParams])

  const rooms = useRooms(client)
  const { items: scheduledMessages } = useScheduledMessages(client)
  const selectedRoom: Room | null = client && selectedRoomId ? (client.getRoom(selectedRoomId) ?? null) : null
  const schedulingRoom: Room | null = client && schedulingRoomId ? (client.getRoom(schedulingRoomId) ?? null) : null

  if (error && !client) {
    return <div className={styles.centered}>{error}</div>
  }

  if (!client) {
    return <div className={styles.centered}>Загрузка…</div>
  }

  const myUserId = client.getUserId()

  async function handleDeleteChat() {
    if (!deletingRoom || !client) return
    const { id } = deletingRoom
    try {
      await leaveChat(client, id)
      if (selectedRoomId === id) setSelectedRoomId(null)
    } catch (err) {
      console.error('не удалось удалить чат', err)
    } finally {
      setDeletingRoom(null)
    }
  }

  return (
    <div className={styles.layout}>
      <aside className={styles.list}>
        <div className={styles.listHeader}>
          <span>Чаты</span>
          <div className={styles.headerButtons}>
            <button type="button" className={styles.newChatButton} onClick={() => setNewGroupOpen(true)} title="Новая группа">
              <Users size={18} />
            </button>
            <button type="button" className={styles.newChatButton} onClick={() => setNewChatOpen(true)} title="Написать">
              <UserPlus size={18} />
            </button>
          </div>
        </div>

        {error && <div className={styles.errorNote}>{error}</div>}
        {joinError && <div className={styles.errorNote}>{joinError}</div>}

        <div className={`${styles.rooms} no-scrollbar`}>
          {rooms.length === 0 && <div className={styles.empty}>Пока нет чатов</div>}
          {rooms.map(({ room, unread, unreadCount, isGroup }) => {
            const scheduledCount = scheduledMessages.filter((m) => m.roomId === room.roomId).length
            const other = room.getMembers().find((m) => m.userId !== myUserId)
            const lastEvent = room.getLastLiveEvent()
            const lastEventIsMessage = lastEvent?.getType() === 'm.room.message'
            const lastSender = lastEventIsMessage ? room.getMembers().find((m) => m.userId === lastEvent?.getSender()) : undefined
            const lastBody = lastEventIsMessage ? String(lastEvent?.getContent().body ?? '') : ''
            const preview = isGroup && lastSender && lastEvent?.getSender() !== myUserId ? `${lastSender.name}: ${lastBody}` : lastBody

            const roomName = isGroup ? room.name : (other?.name ?? 'Ожидание участника…')

            return (
              // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
              <div
                key={room.roomId}
                role="button"
                tabIndex={0}
                className={room.roomId === selectedRoomId ? `${styles.roomItem} ${styles.roomItemActive}` : styles.roomItem}
                onClick={() => setSelectedRoomId(room.roomId)}
                onKeyDown={(e) => e.key === 'Enter' && setSelectedRoomId(room.roomId)}
              >
                <div className={styles.avatarWrapper}>
                  {isGroup ? (
                    <div className={styles.groupAvatar}>{getGroupAvatarEmoji(room) ?? <Users size={20} />}</div>
                  ) : (
                    <Avatar mxcUrl={other?.getMxcAvatarUrl()} name={other?.name ?? '?'} size={44} />
                  )}
                  {unread && <span className={styles.unreadBadge}>{unreadCount > 99 ? '99+' : unreadCount}</span>}
                </div>
                <div className={styles.roomInfo}>
                  <div className={styles.roomName}>{roomName}</div>
                  <div className={styles.roomPreview}>{preview}</div>
                </div>
                {scheduledCount > 0 && (
                  <button
                    type="button"
                    className={styles.scheduledButton}
                    title="Отложенные сообщения"
                    onClick={(e) => {
                      e.stopPropagation()
                      setSchedulingRoomId(room.roomId)
                    }}
                  >
                    <Clock size={14} />
                    {scheduledCount}
                  </button>
                )}
                <button
                  type="button"
                  className={styles.deleteChat}
                  title="Удалить чат"
                  onClick={(e) => {
                    e.stopPropagation()
                    setDeletingRoom({ id: room.roomId, name: roomName })
                  }}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            )
          })}
        </div>
      </aside>

      <div className={styles.windowArea}>{selectedRoom && <ChatWindow client={client} room={selectedRoom} />}</div>

      {newGroupOpen && (
        <NewGroupChatModal
          client={client}
          onClose={() => setNewGroupOpen(false)}
          onCreated={(roomId) => {
            setSelectedRoomId(roomId)
            setNewGroupOpen(false)
          }}
        />
      )}

      {newChatOpen && (
        <NewChatModal
          client={client}
          onClose={() => setNewChatOpen(false)}
          onCreated={(roomId) => {
            setSelectedRoomId(roomId)
            setNewChatOpen(false)
          }}
        />
      )}

      {deletingRoom && (
        <ConfirmModal
          title="Удалить чат"
          text={`Удалить чат «${deletingRoom.name}»? Вы выйдете из него, история переписки на этом устройстве будет скрыта.`}
          onConfirm={handleDeleteChat}
          onClose={() => setDeletingRoom(null)}
        />
      )}

      {client && schedulingRoom && (
        <ScheduledMessagesModal client={client} room={schedulingRoom} onClose={() => setSchedulingRoomId(null)} />
      )}
    </div>
  )
}
