import type { MatrixClient } from 'matrix-js-sdk'

function authHeaders(client: MatrixClient): HeadersInit {
  return { Authorization: `Bearer ${client.getAccessToken() ?? ''}` }
}

/**
 * "О себе", НЕ поле профиля Matrix, расширение собственного ростера
 * бэкенда (раздел 15.7 инструкции), до 300 символов, обрезается сервером.
 */
export async function fetchAbout(client: MatrixClient): Promise<string> {
  const res = await fetch('/app/api/profile/about', { credentials: 'include', headers: authHeaders(client) })
  if (!res.ok) throw new Error(`GET /api/profile/about: ${res.status}`)
  const data = (await res.json()) as { about: string }
  return data.about
}

export async function saveAbout(client: MatrixClient, about: string): Promise<void> {
  const res = await fetch('/app/api/profile/about', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...authHeaders(client) },
    body: JSON.stringify({ about }),
  })
  if (!res.ok) throw new Error(`POST /api/profile/about: ${res.status}`)
}
