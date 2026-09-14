import type { MatrixClient, Room } from 'matrix-js-sdk'
import { CHAT_BACKGROUND_STATE_EVENT_TYPE, type ChatBackgroundContent } from '../types/events'

/**
 * Ресайз до максимум 1280px по длинной стороне и пережатие в JPEG (0.82) на
 * канвасе перед загрузкой, фоновая картинка чата не обязана быть большой
 * (раздел 15 инструкции). Без сторонних зависимостей: у любого браузера,
 * который вообще нужен этому проекту, есть Canvas API из коробки.
 */
async function resizeImage(file: File, maxSize = 1280, quality = 0.82): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height))
  const width = Math.round(bitmap.width * scale)
  const height = Math.round(bitmap.height * scale)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2D-контекст канваса недоступен')
  ctx.drawImage(bitmap, 0, 0, width, height)

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('не удалось сжать изображение'))),
      'image/jpeg',
      quality,
    )
  })
}

async function purgeMedia(client: MatrixClient, mxcUrls: string[]): Promise<void> {
  if (mxcUrls.length === 0) return
  await fetch('/app/api/purge-media', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${client.getAccessToken() ?? ''}` },
    body: JSON.stringify({ mxcUrls }),
  }).catch((err) => console.error('не удалось очистить медиа фона чата', err))
}

/**
 * sendStateEvent типизирован только на стандартные state-события SDK,
 * ru.example.portal.chat_background в этот словарь не входит (кастомное
 * расширение проекта), поэтому один явный cast на границе этой функции.
 *
 * Фон чата не защищён от общей 3-суточной очистки медиа (media_retention
 * в Synapse), Synapse-эндпоинта для точечной защиты конкретного файла в
 * этой установке нет (POST .../media/protect/... отвечает 404
 * M_UNRECOGNIZED), это не баг фронтенда. Фон просто живёт как любой
 * другой файл и со временем будет автоматически вычищен как остальные.
 */
export async function setChatBackground(client: MatrixClient, room: Room, file: File): Promise<void> {
  const resized = await resizeImage(file)
  const { content_uri: contentUri } = await client.uploadContent(resized, { type: 'image/jpeg' })

  const previous = getChatBackground(room)
  const content: ChatBackgroundContent = { type: 'image', value: contentUri }
  await client.sendStateEvent(room.roomId, CHAT_BACKGROUND_STATE_EVENT_TYPE as never, content as never, '')

  if (previous) await purgeMedia(client, [previous.value])
}

export async function clearChatBackground(client: MatrixClient, room: Room): Promise<void> {
  const previous = getChatBackground(room)
  await client.sendStateEvent(room.roomId, CHAT_BACKGROUND_STATE_EVENT_TYPE as never, {} as never, '')
  if (previous) await purgeMedia(client, [previous.value])
}

export function getChatBackground(room: Room): ChatBackgroundContent | null {
  const event = room.currentState.getStateEvents(CHAT_BACKGROUND_STATE_EVENT_TYPE, '')
  const content = event?.getContent() as Partial<ChatBackgroundContent> | undefined
  if (!content?.value) return null
  return content as ChatBackgroundContent
}
