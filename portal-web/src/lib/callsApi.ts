import type { MatrixClient } from 'matrix-js-sdk'

export interface CallLogEntry {
  id: string
  room: string
  email: string
  displayName: string
  startedAt: string
}

function authHeaders(client: MatrixClient): HeadersInit {
  return { Authorization: `Bearer ${client.getAccessToken() ?? ''}` }
}

export async function fetchCallLog(client: MatrixClient): Promise<CallLogEntry[]> {
  const res = await fetch('/app/api/calls', { credentials: 'include', headers: authHeaders(client) })
  if (!res.ok) throw new Error(`GET /api/calls: ${res.status}`)
  return res.json()
}

/**
 * Уникальность по (room, email) на бэкенде: повторный вход в ту же
 * комнату обновляет время и поднимает запись наверх, а не дублирует
 * (matrix-auth-bridge/server.mjs).
 */
export async function logCallEntry(client: MatrixClient, room: string): Promise<CallLogEntry> {
  const res = await fetch('/app/api/calls', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...authHeaders(client) },
    body: JSON.stringify({ room }),
  })
  if (!res.ok) throw new Error(`POST /api/calls: ${res.status}`)
  return res.json()
}

export async function deleteCallEntry(client: MatrixClient, id: string): Promise<void> {
  await fetch(`/app/api/calls/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    credentials: 'include',
    headers: authHeaders(client),
  })
}
