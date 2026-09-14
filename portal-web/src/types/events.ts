// Кастомные, не входящие в стандарт Matrix типы событий этого проекта
// (раздел 15 инструкции). Опросы и фон чата сознательно не используют
// официальные MSC3381/MSC3952, решили, что они слишком тяжеловесны для
// единственного клиента, который вообще их читает.

export const POLL_MSGTYPE = 'ru.example.portal.poll'
export const POLL_VOTE_MSGTYPE = 'ru.example.portal.poll.vote'
export const POLL_VOTE_RELATION_TYPE = 'ru.example.portal.vote'
export const CHAT_BACKGROUND_STATE_EVENT_TYPE = 'ru.example.portal.chat_background'
export const GROUP_AVATAR_EMOJI_STATE_EVENT_TYPE = 'ru.example.portal.group_avatar_emoji'
export const CHAT_CONFERENCES_STATE_EVENT_TYPE = 'ru.example.portal.conferences'

export const VOICE_MESSAGE_MARKER = 'org.matrix.msc3245.voice'
// Круглое видеосообщение ("кружочек"), своя, не MSC-шная метка на
// обычном m.video, тем же приёмом, что и голосовое на m.audio.
export const VIDEO_CIRCLE_MARKER = 'ru.example.portal.video_circle'
// Ссылка на ВКС, отправленная в чат, своя метка на обычном m.text: не
// сырой URL текстом, а компактная плашка с иконкой камеры и названием
// встречи, кликабельная (см. ConferenceLinkChip).
export const CONFERENCE_LINK_MARKER = 'ru.example.portal.conference_link'

// Synapse валидирует m.room.message по базовой схеме независимо от
// msgtype: msgtype и body обязательны у любого события этого типа, иначе
// 400 "'body' not in content", поэтому оба кастомных контента (опрос и
// голос за опрос) обязаны нести читаемый текстовый fallback.
export interface PollContent {
  msgtype: typeof POLL_MSGTYPE
  body: string
  question: string
  options: string[]
}

export interface PollVoteContent {
  msgtype: typeof POLL_VOTE_MSGTYPE
  body: string
  'm.relates_to': {
    rel_type: typeof POLL_VOTE_RELATION_TYPE
    event_id: string
  }
  optionIndex: number
}

export interface ChatBackgroundContent {
  type: 'image'
  value: string
}

export interface GroupAvatarEmojiContent {
  emoji: string
}

/** Конференции, которые когда-либо создавались прямо из этого чата, чтобы можно было зайти в них повторно. */
export interface ChatConferenceEntry {
  slug: string
  subject: string
  createdAt: number
}

export interface ChatConferencesContent {
  items: ChatConferenceEntry[]
}

export interface ConferenceLinkMarkerContent {
  slug: string
  subject: string
}
