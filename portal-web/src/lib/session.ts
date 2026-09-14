// Обёртка над GET /app/api/session, единственная точка входа для получения
// матрикс-сессии. Контракт ответа см. matrix-auth-bridge/server.mjs
// (внутренний инфраструктурный репозиторий): 200 {homeserverUrl, userId, accessToken,
// deviceId, displayName} или 502 {"error": "matrix-auth-bridge failure"}.

export interface SessionResponse {
  homeserverUrl: string
  userId: string
  accessToken: string
  deviceId: string
  displayName: string
}

let inFlight: Promise<SessionResponse> | null = null

export function fetchSession(): Promise<SessionResponse> {
  if (inFlight) return inFlight

  inFlight = fetch('/app/api/session', { credentials: 'include' })
    .then(async (res) => {
      if (!res.ok) {
        throw new Error(`session bootstrap failed: ${res.status}`)
      }
      return (await res.json()) as SessionResponse
    })
    .catch((err) => {
      // Не кэшируем неудачный запрос, следующий вызов должен попробовать заново.
      inFlight = null
      throw err
    })

  return inFlight
}
