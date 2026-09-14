import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { logCallEntry } from '../lib/callsApi'
import { getJitsiDomain, type JitsiMeetExternalApiInstance, loadJitsiExternalApi } from '../lib/jitsiExternalApi'
import { fetchConferenceAccess, getMatrixClient } from '../lib/matrix'
import styles from './CallPage.module.css'

/**
 * Контейнер на 100vh, а не flex:1: этот роут намеренно не имеет
 * родителя-layout (см. router.tsx), поэтому flex-родителя, от которого
 * можно было бы унаследовать высоту, просто не существует (раздел 11.3
 * инструкции, уже один раз ломалось на этом самом месте).
 */
export function CallPage() {
  const { room } = useParams<{ room: string }>()
  const [searchParams] = useSearchParams()
  const subject = searchParams.get('subject')
  const navigate = useNavigate()

  const containerRef = useRef<HTMLDivElement>(null)
  const apiRef = useRef<JitsiMeetExternalApiInstance | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!room) return
    let cancelled = false

    async function mount() {
      try {
        const [access] = await Promise.all([fetchConferenceAccess(room!), loadJitsiExternalApi()])
        if (cancelled || !containerRef.current || !window.JitsiMeetExternalAPI) return

        const options = {
          roomName: room!,
          parentNode: containerRef.current,
          width: '100%',
          height: '100%',
          configOverwrite: {
            disableDeepLinking: true,
            ...(subject ? { subject } : {}),
          },
          ...(access.mode === 'jwt' ? { jwt: access.jwt } : {}),
          ...(access.mode === 'guest' ? { userInfo: { displayName: access.guestName, email: access.guestEmail } } : {}),
        }

        const api = new window.JitsiMeetExternalAPI(getJitsiDomain(), options)
        apiRef.current = api
        api.addEventListener('readyToClose', () => navigate('/app/chats'))

        // Best-effort: у внешнего гостя без Keycloak-сессии getMatrixClient
        // упадёт (нет /app/api/session), тогда просто не логируем, ему и
        // незачем видеть этот звонок в чужом журнале.
        getMatrixClient()
          .then((client) => logCallEntry(client, room!))
          .catch(() => {})
      } catch (err) {
        console.error('не удалось подключиться к конференции', err)
        if (!cancelled) setError('Не удалось подключиться к конференции')
      }
    }

    mount()

    return () => {
      cancelled = true
      apiRef.current?.dispose()
      apiRef.current = null
    }
  }, [room, subject, navigate])

  if (!room) {
    return <div className={styles.container}>Комната не указана</div>
  }

  return (
    <div className={styles.container}>
      {error && <div className={styles.error}>{error}</div>}
      <div ref={containerRef} className={styles.jitsi} />
    </div>
  )
}
