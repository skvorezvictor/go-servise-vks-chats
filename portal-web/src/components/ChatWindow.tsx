import type { MatrixClient, Room } from 'matrix-js-sdk'
import { RelationType, RoomStateEvent } from 'matrix-js-sdk'
import { Clock, Settings, Users } from 'lucide-react'
import { useEffect, useLayoutEffect, useReducer, useRef, useState } from 'react'
import { useChatBackground } from '../hooks/useChatBackground'
import { useGroupAvatarEmoji } from '../hooks/useGroupAvatarEmoji'
import { useReadReceiptsTick } from '../hooks/useReadReceipts'
import { useMarkAsRead, useRoomTimeline } from '../hooks/useRoomTimeline'
import { useScheduledMessages } from '../hooks/useScheduledMessages'
import { useUnreadDivider } from '../hooks/useUnreadDivider'
import { setGroupAvatarEmoji } from '../lib/groupAvatar'
import {
  deleteMessage,
  editMessage,
  getRoomCreatorId,
  replyToMessage,
  sendAttachment,
  sendTextMessage,
  sendVideoCircleMessage,
  sendVoiceMessage,
} from '../lib/matrix'
import { POLL_VOTE_RELATION_TYPE } from '../types/events'
import { Avatar } from './Avatar'
import { ChatConferencesPicker } from './ChatConferencesPicker'
import { ChatSettingsModal } from './ChatSettingsModal'
import styles from './ChatWindow.module.css'
import { CreatePollModal } from './CreatePollModal'
import { EmojiPickerPopover } from './EmojiPickerPopover'
import { MessageBubble, type ReplyTarget } from './MessageBubble'
import { MessageComposer } from './MessageComposer'
import { ScheduledMessagesModal } from './ScheduledMessagesModal'

interface ChatWindowProps {
  client: MatrixClient
  room: Room
}

export function ChatWindow({ client, room }: ChatWindowProps) {
  // room.currentState (участники, тема, название) может пополниться уже
  // ПОСЛЕ первого рендера без единого нового события в таймлайне, например,
  // у только что созданного по ссылке-приглашению чата собеседник уже
  // состоит в комнате (вступил при её создании), но его m.room.member
  // приезжает как состояние, а не как новое событие таймлайна, и
  // useRoomTimeline (подписан только на Timeline/Redaction) на это не
  // реагирует. RoomStateEvent.Events ловит любое обновление состояния
  // комнаты и форсирует ререндер, чтобы шапка ("Ожидание участника…")
  // подхватила уже пришедшие данные.
  const [, forceUpdate] = useReducer((n: number) => n + 1, 0)
  useEffect(() => {
    room.on(RoomStateEvent.Events, forceUpdate)
    // Подстраховка на случай, если конкретно это состояние всё же
    // приходит без RoomStateEvent.Events (комната только что создана по
    // ссылке-приглашению, единственный открытый инстанс ChatWindow, цена
    // копеечная): сверяемся с состоянием комнаты каждые несколько секунд.
    const pollId = window.setInterval(forceUpdate, 3000)
    return () => {
      room.removeListener(RoomStateEvent.Events, forceUpdate)
      window.clearInterval(pollId)
    }
  }, [room])

  const myUserId = client.getUserId()
  const members = room.getMembers()
  const otherMember = members.find((m) => m.userId !== myUserId)
  const isGroup = members.length > 2
  const knownNames = members.map((m) => m.name)
  const isCreator = myUserId === getRoomCreatorId(room)

  const events = useRoomTimeline(room)
  const unreadBoundary = useUnreadDivider(client, room)
  const backgroundUrl = useChatBackground(client, room)
  const groupAvatarEmoji = useGroupAvatarEmoji(room)
  const { items: scheduledMessages } = useScheduledMessages(client, room.roomId)
  useReadReceiptsTick(room) // форсирует ререндер ленты при изменении чужих read receipt

  const [editingEventId, setEditingEventId] = useState<string | null>(null)
  const [showCreatePoll, setShowCreatePoll] = useState(false)
  const [showAvatarPicker, setShowAvatarPicker] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showScheduled, setShowScheduled] = useState(false)
  const [replyingTo, setReplyingTo] = useState<ReplyTarget | null>(null)

  const topicEvent = room.currentState.getStateEvents('m.room.topic', '')
  const topic = (topicEvent?.getContent() as { topic?: string } | undefined)?.topic ?? ''

  // m.replace-события (правки) сами по себе не рендерятся отдельными
  // сообщениями: event.getContent() у оригинала их уже учитывает
  // (раздел 13.3 инструкции). m.reaction сюда не попадают вообще, их
  // агрегирует ReactionBar через relations, а не эта лента. Голоса за
  // опрос (POLL_VOTE_RELATION_TYPE), тоже formально m.room.message
  // (Synapse требует msgtype/body у любого такого события), но это
  // служебные события для tallyPollVotes, а не отдельные сообщения в
  // ленте, так же, как правки, их отфильтровываем по relation.
  const visibleEvents = events.filter(
    (e) =>
      e.getType() === 'm.room.message' &&
      !e.isRedacted() &&
      !e.isRelation(RelationType.Replace) &&
      !e.isRelation(POLL_VOTE_RELATION_TYPE),
  )

  const timelineRef = useRef<HTMLDivElement>(null)
  const dividerRef = useRef<HTMLDivElement>(null)
  const [dividerDismissed, setDividerDismissed] = useState(false)

  // Раньше read receipt слался на любое новое сообщение просто потому,
  // что чат был "выбран" (ChatWindow смонтирован) и вкладка в фокусе,
  // даже если чат был выбран случайно (например URL ?room=... остался с
  // прошлого раза) и реально никто на него не смотрел. Сообщения
  // помечаются прочитанными, только когда лента действительно докручена
  // почти до конца, это ближе к тому, что человек их физически видит.
  const [isNearBottom, setIsNearBottom] = useState(true)
  // Синхронный источник истины для эффекта автоскролла ниже: React state
  // обновляется асинхронно (не сразу после setIsNearBottom), а решение
  // "докручивать ли к новому сообщению" нужно принять в той же layout-фазе,
  // что и появление этого сообщения, до факта, был ли пользователь внизу
  // ДО того, как эта лента подросла.
  const isNearBottomRef = useRef(true)
  function updateNearBottom(el: HTMLDivElement) {
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 100
    isNearBottomRef.current = near
    setIsNearBottom(near)
  }
  useMarkAsRead(client, room, events, isNearBottom)

  // Открытие чата, всегда в самый низ, к новым сообщениям. Разделитель
  // "непрочитанные сообщения" остаётся чисто визуальной меткой (видно,
  // где остановился) и на скролл не влияет: попытка сразу подвести к
  // разделителю чаще давала обратный эффект, на медленном первом
  // рендере unreadBoundary мог указывать на сообщение из уже подгруженной
  // (в т.ч. из прошлого посещения в этой вкладке) истории заметно выше
  // самого низа, и чат визуально открывался "в старых сообщениях" вместо
  // новых. Дальше скролл никак принудительно не трогается: новое
  // сообщение, пока читаешь историю, больше не выдёргивает обратно вниз.
  //
  // initialScrollDoneRef, не просто [room.roomId]: в свежеоткрытой комнате
  // (особенно только что созданной/только что вступил по ссылке) лента в
  // момент переключения комнаты ещё пустая, el.scrollHeight равен нулю, и
  // scrollTop=scrollHeight ничего не даёт, а как только сообщения реально
  // подгружаются мгновением позже, перепроверить уже было некому. Пробуем
  // при каждом изменении длины ленты, пока не встанем один раз успешно.
  const initialScrollDoneRef = useRef(false)
  useLayoutEffect(() => {
    initialScrollDoneRef.current = false
    setDividerDismissed(false)
    isNearBottomRef.current = true
    setIsNearBottom(true)
  }, [room.roomId])

  useLayoutEffect(() => {
    if (initialScrollDoneRef.current || visibleEvents.length === 0) return
    const el = timelineRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
    initialScrollDoneRef.current = true
  }, [room.roomId, visibleEvents.length])

  // Диагностика (2026-09-10) показала: после первого открытия чата новое
  // сообщение действительно НЕ докручивало вниз само по себе ни при каких
  // условиях, включая случай, когда пользователь и так стоял у самого
  // низа и просто смотрит на живую переписку. Раньше эффект убрали
  // целиком по прямой просьбе, не выдёргивать вниз, пока читаешь историю
  // выше. Но это две разные ситуации: если пользователь ЧИТАЕТ историю
  // (isNearBottomRef.current === false, он сам туда проскроллил), сюда
  // не долезаем и ничего не трогаем; если он и так был внизу, новое
  // сообщение обязано быть видно сразу, как в любом мессенджере. Обычная
  // подгрузка истории вверх сюда не попадает по той же причине: чтобы её
  // вызвать, нужно быть у верха ленты, то есть isNearBottomRef уже false.
  useLayoutEffect(() => {
    if (!initialScrollDoneRef.current) return
    const el = timelineRef.current
    if (!el || !isNearBottomRef.current) return
    el.scrollTop = el.scrollHeight
  }, [visibleEvents.length])

  // Дистанция до низа могла вырасти без единого события scroll (новое
  // сообщение дописалось снизу, пока пользователь читал историю выше),
  // пересчитываем "у низа ли я" и после изменения количества сообщений,
  // не только по факту ручного скролла. Идёт ПОСЛЕ эффекта автоскролла
  // выше (тот же visibleEvents.length, порядок объявления, тот же
  // порядок выполнения layout-эффектов), поэтому если только что сами
  // докрутили вниз, здесь это корректно останется "у низа", а не будет
  // на мгновение показывать устаревшее "далеко от низа".
  useLayoutEffect(() => {
    const el = timelineRef.current
    if (!el) return
    updateNearBottom(el)
  }, [visibleEvents.length])

  // Разделитель пропадает, когда долистали до самого низа ленты. Докрутка
  // истории, когда долистали до самого верха: initialSyncLimit:20
  // подгружает только хвост при каждом СВЕЖЕМ заходе (в т.ч. после
  // hard-refresh на каждом деплое), а без явной пагинации назад более
  // старые сообщения выглядели как будто "пропали", хотя целы на сервере.
  const [hasMoreHistory, setHasMoreHistory] = useState(true)
  const loadingHistoryRef = useRef(false)

  useEffect(() => {
    setHasMoreHistory(true)
  }, [room.roomId])

  useEffect(() => {
    const el = timelineRef.current
    if (!el) return

    function onScroll() {
      if (!el) return
      if (el.scrollHeight - el.scrollTop - el.clientHeight < 40) setDividerDismissed(true)
      updateNearBottom(el)

      // Если лента ещё короче контейнера (короткий чат, весь целиком на
      // экране), scrollTop всегда 0 без единого реального скролла
      // пользователя, раньше это трактовалось как "докрутили до верха" и
      // на каждый чих (например ресайз шапки при подгрузке темы) уходил
      // лишний запрос paginateEventTimeline.
      if (el.scrollHeight <= el.clientHeight) return
      if (el.scrollTop > 60 || loadingHistoryRef.current || !hasMoreHistory) return
      loadingHistoryRef.current = true
      const prevHeight = el.scrollHeight
      client
        .paginateEventTimeline(room.getLiveTimeline(), { backwards: true, limit: 30 })
        .then((more) => {
          if (!more) setHasMoreHistory(false)
        })
        .catch((err) => console.error('не удалось подгрузить историю чата', err))
        .finally(() => {
          requestAnimationFrame(() => {
            if (el) el.scrollTop += el.scrollHeight - prevHeight
          })
          loadingHistoryRef.current = false
        })
    }

    el.addEventListener('scroll', onScroll)
    return () => el.removeEventListener('scroll', onScroll)
  }, [room, client, hasMoreHistory])

  useEffect(() => {
    setReplyingTo(null)
    setEditingEventId(null)
  }, [room.roomId])

  function handleSend(text: string) {
    if (replyingTo) {
      replyToMessage(client, room.roomId, replyingTo.eventId, text).catch((err) =>
        console.error('не удалось отправить ответ', err),
      )
      setReplyingTo(null)
    } else {
      sendTextMessage(client, room.roomId, text)
    }
  }

  return (
    <div className={styles.window} style={backgroundUrl ? { backgroundImage: `url(${backgroundUrl})` } : undefined}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          {isGroup ? (
            <div className={styles.groupIconWrapper}>
              <button
                type="button"
                className={styles.groupIcon}
                onClick={() => setShowAvatarPicker((v) => !v)}
                title="Сменить аватар чата"
              >
                {groupAvatarEmoji ?? <Users size={18} />}
              </button>
              {showAvatarPicker && (
                <EmojiPickerPopover
                  direction="down"
                  onPick={(emoji) => {
                    setGroupAvatarEmoji(client, room, emoji).catch((err) => console.error('не удалось сменить аватар чата', err))
                    setShowAvatarPicker(false)
                  }}
                  onClose={() => setShowAvatarPicker(false)}
                />
              )}
            </div>
          ) : (
            <Avatar mxcUrl={otherMember?.getMxcAvatarUrl()} name={otherMember?.name ?? '?'} size={36} />
          )}
          <div className={styles.title}>{isGroup ? room.name : (otherMember?.name ?? 'Ожидание участника…')}</div>
        </div>

        {topic && <div className={styles.headerTopic}>{topic}</div>}

        <div className={styles.headerActions}>
          <ChatConferencesPicker client={client} room={room} />
          <div className={styles.scheduledButtonWrapper}>
            <button type="button" onClick={() => setShowScheduled(true)} title="Отложенные сообщения">
              <Clock size={18} />
            </button>
            {scheduledMessages.length > 0 && <span className={styles.scheduledBadge}>{scheduledMessages.length}</span>}
          </div>
          {isGroup && (
            <button type="button" onClick={() => setShowSettings(true)} title="Настройки чата">
              <Settings size={18} />
            </button>
          )}
        </div>
      </div>

      <div className={styles.timeline} ref={timelineRef}>
        {visibleEvents.map((event, index) => {
          const sender = members.find((m) => m.userId === event.getSender())
          const isOwn = event.getSender() === myUserId
          const eventId = event.getId()
          // unreadBoundary, id ПОСЛЕДНЕГО прочитанного события, поэтому
          // разделитель ставится перед следующим за ним, а не перед ним
          // самим (иначе он повисал над ещё прочитанным сообщением).
          const prevEventId = index > 0 ? visibleEvents[index - 1].getId() : null

          return (
            <div key={eventId}>
              {unreadBoundary && !dividerDismissed && prevEventId === unreadBoundary && (
                <div ref={dividerRef} className={styles.divider}>
                  <span>Непрочитанные сообщения</span>
                </div>
              )}
              <MessageBubble
                client={client}
                room={room}
                event={event}
                isOwn={isOwn}
                canDelete={isOwn || isCreator}
                isGroup={isGroup}
                myUserId={myUserId ?? ''}
                senderName={isGroup && !isOwn ? (sender?.name ?? event.getSender() ?? undefined) : undefined}
                knownNames={knownNames}
                isEditing={eventId === editingEventId}
                onStartEdit={() => setEditingEventId(eventId ?? null)}
                onCancelEdit={() => setEditingEventId(null)}
                onSubmitEdit={(newText) => {
                  if (!eventId) return
                  editMessage(client, room.roomId, eventId, newText).catch((err) =>
                    console.error(`не удалось отредактировать сообщение ${eventId}`, err),
                  )
                  setEditingEventId(null)
                }}
                onDelete={() => {
                  if (!eventId) return
                  deleteMessage(client, room.roomId, eventId).catch((err) =>
                    console.error(`не удалось удалить сообщение ${eventId}`, err),
                  )
                }}
                onReply={setReplyingTo}
              />
            </div>
          )
        })}
      </div>

      <MessageComposer
        onSend={handleSend}
        onAttach={(file, onProgress) => sendAttachment(client, room.roomId, file, onProgress)}
        onSendVoice={(blob) =>
          sendVoiceMessage(client, room.roomId, blob).catch((err) => console.error('не удалось отправить голосовое', err))
        }
        onSendVideoCircle={(blob) =>
          sendVideoCircleMessage(client, room.roomId, blob).catch((err) => console.error('не удалось отправить видеосообщение', err))
        }
        onCreatePoll={() => setShowCreatePoll(true)}
        memberNames={knownNames.filter((n) => n !== (members.find((m) => m.userId === myUserId)?.name ?? ''))}
        replyingTo={replyingTo}
        onCancelReply={() => setReplyingTo(null)}
      />

      {showCreatePoll && <CreatePollModal client={client} roomId={room.roomId} onClose={() => setShowCreatePoll(false)} />}
      {showSettings && <ChatSettingsModal client={client} room={room} onClose={() => setShowSettings(false)} />}
      {showScheduled && <ScheduledMessagesModal client={client} room={room} onClose={() => setShowScheduled(false)} />}
    </div>
  )
}
