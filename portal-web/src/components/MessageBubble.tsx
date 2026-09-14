import type { MatrixClient, MatrixEvent, Room } from 'matrix-js-sdk'
import { MsgType } from 'matrix-js-sdk'
import { Pencil, Reply, SmilePlus, Trash2 } from 'lucide-react'
import { type KeyboardEvent, useState } from 'react'
import { CONFERENCE_LINK_MARKER, type ConferenceLinkMarkerContent, VIDEO_CIRCLE_MARKER, VOICE_MESSAGE_MARKER, POLL_MSGTYPE } from '../types/events'
import { AttachmentAudio } from './AttachmentAudio'
import { AttachmentFile } from './AttachmentFile'
import { AttachmentImage } from './AttachmentImage'
import { AttachmentVideoCircle } from './AttachmentVideoCircle'
import { ConferenceLinkChip } from './ConferenceLinkChip'
import { EmojiPickerPopover } from './EmojiPickerPopover'
import { MentionText } from './MentionText'
import styles from './MessageBubble.module.css'
import { PollMessage } from './PollMessage'
import { ReactionBar } from './ReactionBar'
import { ReadStatus } from './ReadStatus'
import { addReaction } from '../lib/matrix'

export interface ReplyTarget {
  eventId: string
  senderName: string
  snippet: string
}

interface MessageBubbleProps {
  client: MatrixClient
  room: Room
  event: MatrixEvent
  isOwn: boolean
  /** Своё сообщение или чат создан текущим пользователем, тогда можно удалить чужое (раздел 15 инструкции). */
  canDelete: boolean
  isGroup: boolean
  myUserId: string
  /** Имя отправителя над сообщением, только для чужих сообщений в группах (раздел 15.11). */
  senderName?: string
  knownNames: string[]
  isEditing: boolean
  onStartEdit: () => void
  onCancelEdit: () => void
  onSubmitEdit: (newText: string) => void
  onDelete: () => void
  onReply: (target: ReplyTarget) => void
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
}

function snippetOf(body: string): string {
  return body.length > 80 ? `${body.slice(0, 80)}…` : body
}

export function MessageBubble({
  client,
  room,
  event,
  isOwn,
  canDelete,
  isGroup,
  myUserId,
  senderName,
  knownNames,
  isEditing,
  onStartEdit,
  onCancelEdit,
  onSubmitEdit,
  onDelete,
  onReply,
}: MessageBubbleProps) {
  const content = event.getContent()
  const msgtype = content.msgtype as string | undefined
  const wasEdited = Boolean(event.replacingEventId())
  const eventId = event.getId()
  const [draft, setDraft] = useState(() => (typeof content.body === 'string' ? content.body : ''))
  const [pickerOpen, setPickerOpen] = useState(false)

  const replyToEventId = (content['m.relates_to'] as { 'm.in_reply_to'?: { event_id: string } } | undefined)?.[
    'm.in_reply_to'
  ]?.event_id
  const repliedEvent = replyToEventId ? (room.findEventById(replyToEventId) ?? null) : null

  function submitEdit() {
    const text = draft.trim()
    if (!text) return
    onSubmitEdit(text)
  }

  function handleEditKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submitEdit()
    } else if (e.key === 'Escape') {
      onCancelEdit()
    }
  }

  function handleDelete() {
    if (window.confirm('Удалить сообщение?')) onDelete()
  }

  function handleReplyClick() {
    if (!eventId) return
    const body = typeof content.body === 'string' ? content.body : ''
    onReply({ eventId, senderName: senderName ?? (isOwn ? 'Вы' : (event.getSender() ?? '')), snippet: snippetOf(body) })
  }

  function scrollToOriginal() {
    if (!replyToEventId) return
    document.getElementById(`msg-${replyToEventId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  const isPoll = msgtype === POLL_MSGTYPE

  return (
    <div id={eventId ? `msg-${eventId}` : undefined} className={isOwn ? styles.rowOwn : styles.rowIncoming}>
      <div className={isOwn ? styles.bubbleOwn : styles.bubbleIncoming}>
        {senderName && <div className={styles.senderName}>{senderName}</div>}

        {repliedEvent && (
          <button type="button" className={styles.replyQuote} onClick={scrollToOriginal}>
            <span className={styles.replyQuoteSender}>{repliedEvent.getSender()}</span>
            <span className={styles.replyQuoteText}>
              {snippetOf(typeof repliedEvent.getContent().body === 'string' ? String(repliedEvent.getContent().body) : '')}
            </span>
          </button>
        )}

        {isEditing ? (
          <div className={styles.editArea}>
            <textarea
              className={styles.editInput}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={handleEditKeyDown}
              autoFocus
              rows={1}
            />
            <div className={styles.editActions}>
              <button type="button" onClick={onCancelEdit}>
                Отмена
              </button>
              <button type="button" onClick={submitEdit}>
                Сохранить
              </button>
            </div>
          </div>
        ) : isPoll ? (
          <PollMessage client={client} room={room} event={event} />
        ) : (
          <MessageContent client={client} msgtype={msgtype} content={content} knownNames={knownNames} />
        )}

        {eventId && !isPoll && <ReactionBar client={client} room={room} eventId={eventId} />}

        <div className={styles.time}>
          {wasEdited && <span className={styles.editedMark}>изменено · </span>}
          {formatTime(event.getTs())}
          {isOwn && eventId && (
            <span className={styles.readStatus}>
              <ReadStatus
                room={room}
                eventId={eventId}
                myUserId={myUserId}
                isGroup={isGroup}
                otherMember={room.getMembers().find((m) => m.userId !== myUserId)}
              />
            </span>
          )}
        </div>

        {!isEditing && (
          <div className={styles.actions}>
            <div className={styles.emojiWrapper}>
              <button type="button" onClick={() => setPickerOpen((v) => !v)} title="Реакция">
                <SmilePlus size={13} />
              </button>
              {pickerOpen && eventId && (
                <EmojiPickerPopover
                  align={isOwn ? 'right' : 'left'}
                  onPick={(emoji) => {
                    addReaction(client, room.roomId, eventId, emoji).catch((err) => console.error('не удалось поставить реакцию', err))
                    setPickerOpen(false)
                  }}
                  onClose={() => setPickerOpen(false)}
                />
              )}
            </div>
            <button type="button" onClick={handleReplyClick} title="Ответить">
              <Reply size={13} />
            </button>
            {isOwn && msgtype === MsgType.Text && (
              <button type="button" onClick={onStartEdit} title="Редактировать">
                <Pencil size={13} />
              </button>
            )}
            {canDelete && (
              <button type="button" onClick={handleDelete} title="Удалить">
                <Trash2 size={13} />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

interface MessageContentProps {
  client: MatrixClient
  msgtype: string | undefined
  content: Record<string, unknown>
  knownNames: string[]
}

function MessageContent({ client, msgtype, content, knownNames }: MessageContentProps) {
  const body = typeof content.body === 'string' ? content.body : ''
  const url = typeof content.url === 'string' ? content.url : undefined
  const isVoice = Boolean(content[VOICE_MESSAGE_MARKER])
  const isVideoCircle = Boolean(content[VIDEO_CIRCLE_MARKER])
  const conferenceLink = content[CONFERENCE_LINK_MARKER] as ConferenceLinkMarkerContent | undefined

  if (msgtype === MsgType.Text && conferenceLink?.slug) {
    return <ConferenceLinkChip slug={conferenceLink.slug} subject={conferenceLink.subject} />
  }

  if (msgtype === MsgType.Image && url) {
    return <AttachmentImage client={client} mxcUrl={url} name={body} />
  }

  if (msgtype === MsgType.Video && url && isVideoCircle) {
    return <AttachmentVideoCircle client={client} mxcUrl={url} />
  }

  if (msgtype === MsgType.Audio && url && isVoice) {
    return <AttachmentAudio client={client} mxcUrl={url} />
  }

  if (msgtype === MsgType.File && url) {
    return <AttachmentFile client={client} mxcUrl={url} name={body} />
  }

  return (
    <div className={styles.text}>
      <MentionText body={body} knownNames={knownNames} />
    </div>
  )
}
