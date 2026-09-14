import type { MatrixClient } from 'matrix-js-sdk'

export interface ScheduledMessage {
  id: string
  roomId: string
  userId: string
  body: string
  sendAt: number
  createdAt: number
}

function authHeaders(client: MatrixClient): HeadersInit {
  return { Authorization: `Bearer ${client.getAccessToken() ?? ''}` }
}

/**
 * Настоящее серверное планирование (matrix-auth-bridge, не клиентский
 * setTimeout), сообщение уходит даже если ни у кого не открыто
 * приложение. roomId не задан, вернёт все свои отложенные сообщения
 * по всем чатам (для счётчиков в списке чатов).
 */
export async function fetchScheduledMessages(client: MatrixClient, roomId?: string): Promise<ScheduledMessage[]> {
  const qs = roomId ? `?roomId=${encodeURIComponent(roomId)}` : ''
  const res = await fetch(`/app/api/scheduled-messages${qs}`, { credentials: 'include', headers: authHeaders(client) })
  if (!res.ok) throw new Error(`GET /api/scheduled-messages: ${res.status}`)
  return res.json()
}

export async function scheduleMessage(client: MatrixClient, roomId: string, body: string, sendAt: number): Promise<ScheduledMessage> {
  const res = await fetch('/app/api/scheduled-messages', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...authHeaders(client) },
    body: JSON.stringify({ roomId, body, sendAt }),
  })
  if (!res.ok) throw new Error(`POST /api/scheduled-messages: ${res.status}`)
  return res.json()
}

/** Отменить может только тот, кто запланировал, бэкенд сверяет по identity-заголовку, не по id. */
export async function cancelScheduledMessage(client: MatrixClient, id: string): Promise<void> {
  await fetch(`/app/api/scheduled-messages/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    credentials: 'include',
    headers: authHeaders(client),
  })
}
