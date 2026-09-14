import { createClient, EventType, JoinRule, type MatrixClient, type MatrixEvent, MsgType, Preset, RelationType, type Room, RoomEvent } from 'matrix-js-sdk'
import { fetchSession } from './session'
import { CONFERENCE_LINK_MARKER, VIDEO_CIRCLE_MARKER, VOICE_MESSAGE_MARKER } from '../types/events'

let clientPromise: Promise<MatrixClient> | null = null

/**
 * matrix-auth-bridge минтит токен через Synapse admin "login as user" API
 * (POST /_synapse/admin/v1/users/<id>/login), которое намеренно не создаёт
 * устройство и не возвращает device_id (session.deviceId всегда пуст),
 * этому токену на сервере вообще не соответствует ни одно устройство.
 * Генерируем свой и закрепляем в localStorage чисто для стабильности
 * между заходами (используется SDK для sync-фильтров и т.п.), но не для
 * крипто, см. комментарий у getMatrixClient ниже.
 */
function getOrCreateDeviceId(userId: string): string {
  const key = `nps-device-id:${userId}`
  const existing = localStorage.getItem(key)
  if (existing) return existing
  const generated = `WEB${Math.random().toString(36).slice(2, 12).toUpperCase()}`
  localStorage.setItem(key, generated)
  return generated
}

/**
 * Синглтон-клиент Matrix. Создаётся один раз на сессию приложения из ответа
 * GET /app/api/session (см. session.ts), сам компонент никогда не ходит
 * в Keycloak напрямую, всю OIDC-логику делает бэкенд (matrix-auth-bridge).
 */
export function getMatrixClient(): Promise<MatrixClient> {
  if (clientPromise) return clientPromise

  clientPromise = fetchSession()
    .then(async (session) => {
      const client = createClient({
        baseUrl: session.homeserverUrl,
        userId: session.userId,
        accessToken: session.accessToken,
        deviceId: session.deviceId || getOrCreateDeviceId(session.userId),
        // Без этого SDK по умолчанию агрессивно обрезает старые события
        // из таймлайна в памяти по мере поступления новых (это НЕ баг
        // синхронизации и НЕ удаление на сервере, сообщения на месте,
        // просто клиент их больше не хранит и не рисует). Именно это
        // выглядело как "старые сообщения стираются, хотя их не удаляли".
        timelineSupport: true,
      })

      // session.userId, это то, что matrix-auth-bridge САМ вычислил из
      // preferred_username/email в заголовках oauth2-proxy (localpartFromUsername),
      // а не то, что реально сверено с сервером. Если oauth2-proxy на разных
      // заходах присылает эти заголовки чуть по-разному (регистр, порядок
      // источника claim'а), бридж может вычислить другой userId, чем тот,
      // под которым реально были отправлены прошлые сообщения, тогда
      // getUserId() не совпадает с event.getSender() у собственных же
      // сообщений, и "свои/чужие" в чате путаются местами. whoami(), это
      // единственный, дошедший до сервера и подтверждённый им источник
      // правды о том, кто мы на самом деле для этого access-токена.
      try {
        const whoami = await client.whoami()
        if (whoami.user_id && whoami.user_id !== client.credentials.userId) {
          console.warn(`сессия сообщила userId ${client.credentials.userId}, whoami() сервера говорит ${whoami.user_id}, использую ответ сервера`)
          client.credentials.userId = whoami.user_id
        }
      } catch (err) {
        console.error('не удалось проверить userId через whoami()', err)
      }

      // Криптостек НЕ инициализируем: шифрование в Synapse этого проекта
      // выключено (homeserver.yaml.example), а наш deviceId, чисто
      // клиентская выдумка, серверу он неизвестен (см. комментарий выше),
      // поэтому initRustCrypto() пытается опубликовать device-ключи для
      // несуществующего на сервере устройства и Synapse отвечает 400 на
      // каждый /keys/upload. Без вызова initRustCrypto() обычные,
      // нешифрованные комнаты работают штатно.
      wireAutoAcceptInvites(client)

      await client.startClient({ initialSyncLimit: 20 })

      // Диагностика прямо из консоли браузера, когда репорт бага не
      // воспроизводится по описанию: window.__mx.getVisibleRooms()
      // .map(r => ({name: r.name, unread: r.getUnreadNotificationCount(), readUpTo: r.getEventReadUpTo(r.myUserId)}))
      ;(window as unknown as { __mx?: MatrixClient }).__mx = client

      // wireUnreadDebugLog(client), диагностика бага со счётчиком
      // непрочитанных отработала (причина найдена: забытая параллельная
      // сессия того же аккаунта с открытым тем же чатом мгновенно слала
      // receipt) и снята, чтобы не шуметь в консоли поверх других логов.

      return client
    })
    .catch((err) => {
      clientPromise = null
      throw err
    })

  return clientPromise
}

/**
 * Известный баг оригинала (раздел 10.6.1 инструкции): приглашённый в личный
 * чат участник висит в membership 'invite', а не 'join', пока не примет
 * приглашение вручную. Без автопринятия поиск "уже существующего личного
 * чата" пропускал такие комнаты и плодил дубли. Подписка ставится сразу
 * при создании клиента, до того как любой код успеет искать существующие
 * чаты.
 */
function wireAutoAcceptInvites(client: MatrixClient) {
  client.on(RoomEvent.MyMembership, (room, membership) => {
    if (membership === 'invite') {
      client.joinRoom(room.roomId).catch((err) => {
        console.error(`не удалось автоматически принять приглашение в ${room.roomId}`, err)
      })
    }
  })
}

/**
 * Единственный способ получить src/href для чего угодно на базе mxc://
 * в этом проекте. Synapse отдаёт медиа только по авторизованному эндпоинту
 * (MSC3916) с Bearer-токеном, обычная <img src="..."> получает молчаливый
 * отказ без видимой ошибки (баг оригинала, раздел 10.6.3 инструкции).
 * Нигде в компонентах client.mxcUrlToHttp() напрямую не используется.
 */
export async function fetchAuthedMediaBlobUrl(
  client: MatrixClient,
  mxcUrl: string,
  size?: { width: number; height: number },
): Promise<string | null> {
  const httpUrl = size
    ? client.mxcUrlToHttp(mxcUrl, size.width, size.height, 'scale', false, false, true)
    : client.mxcUrlToHttp(mxcUrl, undefined, undefined, undefined, false, false, true)

  if (!httpUrl) return null

  const accessToken = client.getAccessToken()
  const res = await fetch(httpUrl, {
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
  })
  if (!res.ok) return null

  const blob = await res.blob()
  return URL.createObjectURL(blob)
}

/** Превью 320px для вложений в ленте (раздел 13 инструкции). */
export function fetchAuthedThumbnail(client: MatrixClient, mxcUrl: string): Promise<string | null> {
  return fetchAuthedMediaBlobUrl(client, mxcUrl, { width: 320, height: 320 })
}

/**
 * Единственная функция поиска существующего личного чата, проверяет и
 * 'join', и 'invite' membership (не только getJoinedMembers(), это и было
 * причиной дублей в оригинале, раздел 10.6.1). Автопринятие инвайтов уже
 * подключено при создании клиента, поэтому 'invite' здесь скорее защита
 * на случай доли секунды до завершения join, и для входящих приглашений.
 */
export function findExistingDm(client: MatrixClient, otherUserId: string): Room | null {
  for (const room of client.getVisibleRooms()) {
    const membership = room.getMyMembership()
    if (membership !== 'join' && membership !== 'invite') continue

    const members = room.getMembers()
    const isDirect = members.length === 2 && members.some((m) => m.userId === otherUserId)
    if (isDirect) return room
  }
  return null
}

/**
 * Создаёт личный чат, если такого ещё нет с этим собеседником. is_direct:true
 * (в отличие от групповых чатов, раздел 13 инструкции).
 */
export async function getOrCreateDirectMessage(client: MatrixClient, otherUserId: string): Promise<Room> {
  const existing = findExistingDm(client, otherUserId)
  if (existing) return existing

  const { room_id: roomId } = await client.createRoom({
    invite: [otherUserId],
    is_direct: true,
    preset: Preset.TrustedPrivateChat,
  })

  const room = client.getRoom(roomId)
  if (!room) throw new Error(`комната ${roomId} создана, но не найдена в клиенте`)
  return room
}

export function sendTextMessage(client: MatrixClient, roomId: string, text: string): void {
  client.sendTextMessage(roomId, text).catch((err) => {
    console.error(`не удалось отправить сообщение в ${roomId}`, err)
  })
}

/**
 * Групповой чат, в отличие от личного (getOrCreateDirectMessage), БЕЗ
 * is_direct:true (раздел 13 инструкции). Название и первичный список
 * приглашённых задаются сразу при создании.
 */
export async function createGroupChat(client: MatrixClient, name: string, inviteUserIds: string[]): Promise<Room> {
  const { room_id: roomId } = await client.createRoom({
    name,
    invite: inviteUserIds,
    preset: Preset.PrivateChat,
  })

  const room = client.getRoom(roomId)
  if (!room) throw new Error(`комната ${roomId} создана, но не найдена в клиенте`)
  return room
}

export async function inviteToRoom(client: MatrixClient, roomId: string, userId: string): Promise<void> {
  await client.invite(roomId, userId)
}

/**
 * Ссылка-приглашение, для человека, которого ещё нет в справочнике
 * контактов (он никогда не заходил в портал, Matrix-аккаунта под него
 * ещё не существует, приглашать по ID некого). Открывает чат для входа
 * по ссылке любому, кто аутентифицирован через Keycloak (join_rule
 * "public", не открытый интернет, весь портал и так за SSO), вместо
 * точечного приглашения конкретного уже существующего пользователя.
 */
export async function createInviteLink(client: MatrixClient, roomId: string): Promise<string> {
  await client.sendStateEvent(roomId, EventType.RoomJoinRules, { join_rule: JoinRule.Public }, '')
  return `${window.location.origin}/app/chats?joinRoom=${encodeURIComponent(roomId)}`
}

/**
 * Комната-заготовка под ссылку-приглашение из "Написать", без заранее
 * заданного названия и с is_direct:true, как у обычного личного чата,
 * иначе вступивший по ссылке видел бы безликий "Новый чат" вместо имени
 * того, кто его позвал (room.name у SDK сам подставляет имя собеседника,
 * когда явного m.room.name нет).
 */
export async function createInviteLinkRoom(client: MatrixClient): Promise<Room> {
  const { room_id: roomId } = await client.createRoom({
    preset: Preset.TrustedPrivateChat,
    is_direct: true,
  })
  const room = client.getRoom(roomId)
  if (!room) throw new Error(`комната ${roomId} создана, но не найдена в клиенте`)
  return room
}

/** Выйти из чата и сразу забыть его, чтобы он не висел в списке с membership "leave". */
export async function leaveChat(client: MatrixClient, roomId: string): Promise<void> {
  await client.leave(roomId)
  await client.forget(roomId)
}

export async function renameRoom(client: MatrixClient, roomId: string, name: string): Promise<void> {
  await client.setRoomName(roomId, name)
}

export async function setRoomTopic(client: MatrixClient, roomId: string, topic: string): Promise<void> {
  await client.setRoomTopic(roomId, topic)
}

/**
 * m.room.create неизменяемо, sender этого события и есть создатель чата.
 * Создатель получает power level 100 при создании комнаты, а стандартный
 * redact power level, 50, поэтому серверных прав ему хватает удалять
 * чужие сообщения без отдельной настройки power levels.
 */
export function getRoomCreatorId(room: Room): string | null {
  return room.currentState.getStateEvents('m.room.create', '')?.getSender() ?? null
}

/**
 * Загружает файл и отправляет его как m.image (превью 320px через
 * fetchAuthedThumbnail) или m.file, в зависимости от MIME-типа, как
 * в разделе 13 инструкции. Собственного ресайза на клиенте здесь нет,
 * в отличие от фоновой картинки чата (это отдельная фича этапа 3).
 */
export const MAX_ATTACHMENT_SIZE = 1024 * 1024 * 1024 // 1 ГБ

export async function sendAttachment(
  client: MatrixClient,
  roomId: string,
  file: File,
  onProgress?: (fraction: number) => void,
): Promise<void> {
  if (file.size > MAX_ATTACHMENT_SIZE) {
    throw new Error(`Файл больше 1 ГБ (${(file.size / 1024 / 1024).toFixed(0)} МБ)`)
  }

  const { content_uri: contentUri } = await client.uploadContent(file, {
    progressHandler: onProgress ? (progress) => onProgress(progress.total > 0 ? progress.loaded / progress.total : 0) : undefined,
  })
  const info = { mimetype: file.type, size: file.size }

  if (file.type.startsWith('image/')) {
    await client.sendMessage(roomId, { msgtype: MsgType.Image, body: file.name, url: contentUri, info })
  } else {
    await client.sendMessage(roomId, { msgtype: MsgType.File, body: file.name, url: contentUri, info })
  }
}

/**
 * Редактирование: штатная Matrix-связь m.replace. SDK сам агрегирует
 * правки на сервере, event.getContent() у оригинального события после
 * этого автоматически возвращает m.new_content, ручной логики "последняя
 * версия побеждает" не требуется (раздел 13.3 инструкции).
 */
export async function editMessage(client: MatrixClient, roomId: string, originalEventId: string, newText: string): Promise<void> {
  await client.sendMessage(roomId, {
    msgtype: MsgType.Text,
    body: `* ${newText}`,
    'm.new_content': { msgtype: MsgType.Text, body: newText },
    'm.relates_to': { rel_type: RelationType.Replace, event_id: originalEventId },
  })
}

export async function deleteMessage(client: MatrixClient, roomId: string, eventId: string): Promise<void> {
  await client.redactEvent(roomId, eventId)
}

/**
 * Реакция, стандартная m.reaction/m.annotation (раздел 15.1 инструкции,
 * сознательно не кастомная, в отличие от опросов). Повторный клик по своей
 * же реакции снимает её через redactEvent. Проверка "уже поставил ли я эту
 * реакцию" делается вызывающим кодом через getSortedAnnotationsByKey (см.
 * ReactionBar), здесь только сами действия.
 */
export async function addReaction(client: MatrixClient, roomId: string, eventId: string, emoji: string): Promise<void> {
  await client.sendEvent(roomId, EventType.Reaction, {
    'm.relates_to': { rel_type: RelationType.Annotation, event_id: eventId, key: emoji },
  })
}

export async function removeReaction(client: MatrixClient, roomId: string, reactionEventId: string): Promise<void> {
  await client.redactEvent(roomId, reactionEventId)
}

/** Ответ на сообщение, стандартная m.in_reply_to (раздел 15.5 инструкции). */
export async function replyToMessage(client: MatrixClient, roomId: string, originalEventId: string, text: string): Promise<void> {
  await client.sendMessage(roomId, {
    msgtype: MsgType.Text,
    body: text,
    'm.relates_to': { 'm.in_reply_to': { event_id: originalEventId } },
  })
}

/**
 * Голосовое сообщение, обычный m.audio с меткой org.matrix.msc3245.voice
 * (раздел 15.2 инструкции). Этот маркер не типизирован в SDK (нестабильный
 * MSC), поэтому добавляется через объединение типов, а не полный `as never`
 * на весь объект.
 */
export async function sendVoiceMessage(client: MatrixClient, roomId: string, blob: Blob): Promise<void> {
  const file = new File([blob], `voice-${Date.now()}.webm`, { type: blob.type || 'audio/webm' })
  const { content_uri: contentUri } = await client.uploadContent(file)

  await client.sendMessage(roomId, {
    msgtype: MsgType.Audio,
    body: file.name,
    url: contentUri,
    info: { mimetype: file.type, size: file.size },
    [VOICE_MESSAGE_MARKER]: {},
  } as never)
}

export async function sendVideoCircleMessage(client: MatrixClient, roomId: string, blob: Blob): Promise<void> {
  const file = new File([blob], `video-circle-${Date.now()}.webm`, { type: blob.type || 'video/webm' })
  const { content_uri: contentUri } = await client.uploadContent(file)

  await client.sendMessage(roomId, {
    msgtype: MsgType.Video,
    body: file.name,
    url: contentUri,
    info: { mimetype: file.type, size: file.size },
    [VIDEO_CIRCLE_MARKER]: {},
  } as never)
}

/** Ссылка на ВКС в чат, не сырой текст с URL, а плашка с иконкой камеры и названием встречи (ConferenceLinkChip). */
export async function sendConferenceLink(client: MatrixClient, roomId: string, slug: string, subject: string): Promise<void> {
  await client.sendMessage(roomId, {
    msgtype: MsgType.Text,
    body: `📹 ${subject}`,
    [CONFERENCE_LINK_MARKER]: { slug, subject },
  } as never)
}

export type ConferenceAccess =
  | { mode: 'jwt'; jwt: string }
  | { mode: 'guest'; guestName: string; guestEmail: string }
  | { mode: 'anonymous' }

/**
 * Единственная функция, которая потребляет редирект /moderator/<room>
 * (раздел 12 инструкции). Возвращает discriminated union вместо трёх
 * отдельных if в CallPage, структурно исключает ситуацию, когда jwt
 * прочитан из одной формы редиректа, а guest_name/guest_email из другой.
 * Никакой собственной логики "модератор или нет" здесь нет вообще: это
 * на 100% решение сервера, фронтенд только разбирает готовый ответ.
 */
export async function fetchConferenceAccess(room: string): Promise<ConferenceAccess> {
  let response: Response
  try {
    response = await fetch(`/moderator/${encodeURIComponent(room)}`, { credentials: 'include', redirect: 'follow' })
  } catch {
    return { mode: 'anonymous' }
  }

  if (!response.ok) return { mode: 'anonymous' }

  const url = new URL(response.url)
  const jwt = url.searchParams.get('jwt')
  if (jwt) return { mode: 'jwt', jwt }

  const guestName = url.searchParams.get('guest_name')
  const guestEmail = url.searchParams.get('guest_email')
  if (guestName && guestEmail) return { mode: 'guest', guestName, guestEmail }

  return { mode: 'anonymous' }
}

export async function setAvatar(client: MatrixClient, file: File): Promise<void> {
  const { content_uri: contentUri } = await client.uploadContent(file)
  await client.setAvatarUrl(contentUri)
}

/**
 * Уведомления браузера на любое новое сообщение в ЛЮБОЙ комнате, не
 * только открытой (раздел 15.9 инструкции), запрашивается один раз при
 * старте приложения, не при каждом монтировании ChatsPage. Исключает
 * свои сообщения и события-правки (m.replace), чтобы не дублировать
 * уведомление на собственное же редактирование.
 */
export function setupNotifications(client: MatrixClient): () => void {
  if (typeof Notification === 'undefined') return () => {}
  if (Notification.permission === 'default') {
    Notification.requestPermission().catch(() => {})
  }

  // RoomEvent.Timeline стреляет и на историю, подгруженную самой первой
  // синхронизацией после логина, не только на реально новые сообщения,
  // без этой отсечки при каждом заходе высыпался бы залп уведомлений по
  // всей истории чатов. Игнорируем всё, что было отправлено ДО момента
  // подписки на этот листенер.
  const startedAt = Date.now()

  const onTimeline = (event: MatrixEvent) => {
    if (Notification.permission !== 'granted') return
    if (event.getType() !== 'm.room.message') return
    if (event.getSender() === client.getUserId()) return
    if (event.isRelation(RelationType.Replace)) return
    if (event.getTs() < startedAt) return

    const content = event.getContent()
    const body = typeof content.body === 'string' ? content.body : 'Новое сообщение'
    const room = client.getRoom(event.getRoomId())
    const senderId = event.getSender() ?? ''
    // room.getMember() иногда ещё не знает displayname отправителя в момент
    // этого самого события (гонка между обработкой m.room.member и
    // m.room.message в одном sync-батче), тогда RoomMember.name откатывается
    // на голый Matrix ID. client.getUser(), отдельный, обычно уже
    // заполненный к этому моменту кэш профилей, подстраховка перед ним.
    const sender = room?.getMember(senderId)?.name || client.getUser(senderId)?.displayName || senderId

    new Notification(sender, { body })
  }

  client.on(RoomEvent.Timeline, onTimeline)
  return () => client.removeListener(RoomEvent.Timeline, onTimeline)
}
