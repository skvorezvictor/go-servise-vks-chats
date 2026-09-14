import type { MatrixClient, Room } from 'matrix-js-sdk'
import { Image, Link2, UserPlus, X } from 'lucide-react'
import { useRef, useState } from 'react'
import { clearChatBackground, getChatBackground, setChatBackground } from '../lib/chatBackground'
import { createInviteLink, getRoomCreatorId, inviteToRoom, renameRoom, sendTextMessage, setRoomTopic } from '../lib/matrix'
import { Avatar } from './Avatar'
import { ContactPicker } from './ContactPicker'
import { Modal } from './Modal'
import styles from './ChatSettingsModal.module.css'

interface ChatSettingsModalProps {
  client: MatrixClient
  room: Room
  onClose: () => void
}

function getCurrentTopic(room: Room): string {
  const event = room.currentState.getStateEvents('m.room.topic', '')
  const content = event?.getContent() as { topic?: string } | undefined
  return content?.topic ?? ''
}

/**
 * Всё управление групповым чатом в одном месте вместо разрозненных кнопок
 * в шапке: название/тема, фон, участники, приглашение новых.
 */
export function ChatSettingsModal({ client, room, onClose }: ChatSettingsModalProps) {
  const [name, setName] = useState(room.name)
  const [topic, setTopic] = useState(() => getCurrentTopic(room))
  const [savingRoomInfo, setSavingRoomInfo] = useState(false)
  const [roomInfoError, setRoomInfoError] = useState<string | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const [bgBusy, setBgBusy] = useState(false)
  const [hasBackground, setHasBackground] = useState(() => Boolean(getChatBackground(room)))

  const [addingParticipants, setAddingParticipants] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  const [inviting, setInviting] = useState(false)
  const [inviteError, setInviteError] = useState<string | null>(null)

  const [creatingLink, setCreatingLink] = useState(false)
  const [linkCopied, setLinkCopied] = useState(false)

  const members = room.getMembers()

  async function handleSaveRoomInfo() {
    const trimmedName = name.trim()
    if (!trimmedName) {
      setRoomInfoError('Введите название чата')
      return
    }

    setSavingRoomInfo(true)
    setRoomInfoError(null)
    try {
      const nameChanged = trimmedName !== room.name
      const topicChanged = topic.trim() !== getCurrentTopic(room)

      if (nameChanged) await renameRoom(client, room.roomId, trimmedName)
      if (topicChanged) await setRoomTopic(client, room.roomId, topic.trim())

      // Создатель меняет без лишнего шума, это его чат. Остальные тоже
      // могут менять, но тогда остальным стоит явно знать, кто и что
      // поменял.
      const isCreator = client.getUserId() === getRoomCreatorId(room)
      if (!isCreator && (nameChanged || topicChanged)) {
        const parts: string[] = []
        if (nameChanged) parts.push(`название на «${trimmedName}»`)
        if (topicChanged) parts.push(topic.trim() ? `тему на «${topic.trim()}»` : 'тему (убрал(а))')
        sendTextMessage(client, room.roomId, `🔧 Изменил(а) ${parts.join(' и ')}`)
      }
    } catch (err) {
      console.error('не удалось сохранить название/тему чата', err)
      setRoomInfoError('Не удалось сохранить изменения')
    } finally {
      setSavingRoomInfo(false)
    }
  }

  async function handleBackgroundChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    setBgBusy(true)
    try {
      await setChatBackground(client, room, file)
      setHasBackground(true)
    } catch (err) {
      console.error('не удалось установить фон чата', err)
    } finally {
      setBgBusy(false)
    }
  }

  async function handleClearBackground() {
    setBgBusy(true)
    try {
      await clearChatBackground(client, room)
      setHasBackground(false)
    } catch (err) {
      console.error('не удалось убрать фон чата', err)
    } finally {
      setBgBusy(false)
    }
  }

  async function handleInvite() {
    if (selected.length === 0) {
      setInviteError('Выберите хотя бы одного контакта')
      return
    }
    setInviting(true)
    setInviteError(null)
    try {
      await Promise.all(selected.map((id) => inviteToRoom(client, room.roomId, id)))
      setSelected([])
      setAddingParticipants(false)
    } catch (err) {
      console.error('не удалось пригласить участников', err)
      setInviteError('Не удалось пригласить одного или нескольких участников')
    } finally {
      setInviting(false)
    }
  }

  async function handleCreateLink() {
    setCreatingLink(true)
    setLinkCopied(false)
    try {
      const link = await createInviteLink(client, room.roomId)
      await navigator.clipboard.writeText(link)
      setLinkCopied(true)
    } catch (err) {
      console.error('не удалось создать ссылку-приглашение', err)
    } finally {
      setCreatingLink(false)
    }
  }

  return (
    <Modal title="Настройки чата" onClose={onClose}>
      <div className={styles.wrap}>
        <section className={styles.section}>
          <label className={styles.label}>
            Название
            <input className={styles.input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Название чата" />
          </label>
          <label className={styles.label}>
            Тема
            <input
              className={styles.input}
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="Тема (необязательно)"
            />
          </label>
          {roomInfoError && <div className={styles.error}>{roomInfoError}</div>}
          <button type="button" className={styles.primaryButton} onClick={handleSaveRoomInfo} disabled={savingRoomInfo}>
            {savingRoomInfo ? 'Сохраняем…' : 'Сохранить название и тему'}
          </button>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionTitle}>Фон чата</div>
          <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={handleBackgroundChange} />
          <div className={styles.row}>
            <button type="button" className={styles.secondaryButton} onClick={() => fileInputRef.current?.click()} disabled={bgBusy}>
              <Image size={16} /> {hasBackground ? 'Сменить' : 'Загрузить'}
            </button>
            {hasBackground && (
              <button type="button" className={styles.secondaryButton} onClick={handleClearBackground} disabled={bgBusy}>
                <X size={16} /> Убрать
              </button>
            )}
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionTitle}>Участники ({members.length})</div>
          <div className={`${styles.membersList} no-scrollbar`}>
            {members.map((member) => (
              <div key={member.userId} className={styles.memberItem}>
                <Avatar mxcUrl={member.getMxcAvatarUrl()} name={member.name} size={32} />
                <div className={styles.memberInfo}>
                  <div className={styles.memberName}>{member.name}</div>
                  <div className={styles.memberId}>{member.userId}</div>
                </div>
              </div>
            ))}
          </div>

          {addingParticipants ? (
            <div className={styles.addForm}>
              <ContactPicker client={client} selected={selected} onChange={setSelected} excludeUserIds={members.map((m) => m.userId)} />
              {inviteError && <div className={styles.error}>{inviteError}</div>}
              <button type="button" className={styles.primaryButton} onClick={handleInvite} disabled={inviting}>
                {inviting ? 'Приглашаем…' : 'Пригласить'}
              </button>
            </div>
          ) : (
            <div className={styles.row}>
              <button type="button" className={styles.secondaryButton} onClick={() => setAddingParticipants(true)}>
                <UserPlus size={16} /> Добавить участников
              </button>
              <button type="button" className={styles.secondaryButton} onClick={handleCreateLink} disabled={creatingLink}>
                <Link2 size={16} /> {linkCopied ? 'Ссылка скопирована' : 'Ссылка-приглашение'}
              </button>
            </div>
          )}
          <div className={styles.hint}>
            Ссылка, если человека ещё нет в контактах (он ни разу не заходил в портал): любой, кто откроет её, войдя через
            корпоративный SSO, сразу попадёт в этот чат.
          </div>
        </section>
      </div>
    </Modal>
  )
}
